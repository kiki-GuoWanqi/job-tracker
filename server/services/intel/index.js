// 岗位情报聚合编排器：
// (applicationId) → company/position → buildQueries → 并发 tavilySearch → LLM 结构化 → 写回 DB

import { getDb } from '../../db.js';
import { rowToApplication } from '../../mappers.js';
import { loadTavilyKey } from '../tavily-key.js';
import { callWithFallback } from '../ai-router.js';
import { tavilySearch } from './tavily.js';
import { buildQueries, ALL_DIMENSIONS } from './queries.js';

const TAVILY_TIMEOUT_MS = 20_000;

function withTimeout(ms) {
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(new Error('Tavily 调用超时')), ms);
  return { signal: ctl.signal, clear: () => clearTimeout(timer) };
}

function loadApplication(db, id) {
  const row = db.prepare('SELECT * FROM applications WHERE id = ?').get(id);
  return rowToApplication(row, []);
}

function dedupResults(results) {
  const seen = new Set();
  const out = [];
  for (const r of results) {
    if (!r.url || seen.has(r.url)) continue;
    seen.add(r.url);
    out.push(r);
  }
  return out;
}

// 单条 query 失败不致命，分组返回 { dim, items, error? }
async function runOneQuery({ apiKey, dim, q }) {
  const t = withTimeout(TAVILY_TIMEOUT_MS);
  try {
    const items = await tavilySearch({
      apiKey,
      query: q,
      maxResults: 5,
      depth: 'advanced',
      signal: t.signal
    });
    return { dim, q, items };
  } catch (e) {
    return { dim, q, items: [], error: e.message || String(e) };
  } finally {
    t.clear();
  }
}

function buildLLMPrompt({ company, position, perDim }) {
  const blocks = [];
  for (const dim of Object.keys(perDim)) {
    const items = perDim[dim];
    if (!items.length) continue;
    const dimLabel = { written: '笔试题', interview: '面试经历', salary: '薪资评价' }[dim] || dim;
    blocks.push(`### 维度：${dimLabel}\n` + items.map((r, i) =>
      `[${i + 1}] 标题：${r.title}\n来源：${r.url}\n时间：${r.publishedDate || '未知'}\n摘要：${r.snippet}`
    ).join('\n\n'));
  }

  const system = `你是一个招聘信息整理助手。基于下方搜索结果，归纳出关于「${company} ${position || ''}」的笔试题、面试经历、薪资评价。

严格要求：
1. 只输出 JSON，不要任何前后文字。
2. 结构必须是：
{
  "writtenTests": [ { "topic": "", "summary": "", "difficulty": "易|中|难|未知", "sourceIndex": [1,2], "confidence": "高|中|低" } ],
  "interviews": {
    "round1": [ { "question": "", "context": "", "sourceIndex": [], "confidence": "" } ],
    "round2": [],
    "round3": [],
    "hr": [],
    "other": []
  },
  "salary": {
    "range": "若有数字范围，写如 '15-25K/月'；否则空字符串",
    "reviews": [ { "summary": "", "sourceIndex": [], "confidence": "" } ]
  }
}
3. sourceIndex 必须对应上面 [n] 编号；查不到的字段写空数组/空字符串。
4. 内容必须忠实于搜索结果，不要编造。证据弱的标 confidence="低"。
5. 同一题/同一事实多处提到，合并成一条并把多个 sourceIndex 都列上。`;

  const user = blocks.length
    ? blocks.join('\n\n')
    : '（无搜索结果）';

  return { system, user };
}

function safeParseJSON(s) {
  if (!s || typeof s !== 'string') return null;
  // LLM 偶尔包 ```json fence
  const cleaned = s.trim()
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```$/, '');
  try { return JSON.parse(cleaned); } catch { /* fall through */ }
  // 退而求其次：抓第一个 { ... } 块
  const m = cleaned.match(/\{[\s\S]*\}/);
  if (m) {
    try { return JSON.parse(m[0]); } catch { return null; }
  }
  return null;
}

function normalizeIntel(parsed, sources) {
  const obj = (parsed && typeof parsed === 'object') ? parsed : {};
  const arr = v => Array.isArray(v) ? v : [];
  const interviews = (obj.interviews && typeof obj.interviews === 'object') ? obj.interviews : {};
  return {
    writtenTests: arr(obj.writtenTests),
    interviews: {
      round1: arr(interviews.round1),
      round2: arr(interviews.round2),
      round3: arr(interviews.round3),
      hr:     arr(interviews.hr),
      other:  arr(interviews.other)
    },
    salary: {
      range:   typeof obj.salary?.range === 'string' ? obj.salary.range : '',
      reviews: arr(obj.salary?.reviews)
    },
    sources,
    fetchedAt: new Date().toISOString()
  };
}

function persist(db, applicationId, intel) {
  db.prepare(
    'UPDATE applications SET intel_json = ?, intel_at = ?, updated_at = ? WHERE id = ?'
  ).run(JSON.stringify(intel), intel.fetchedAt, intel.fetchedAt, applicationId);
}

/**
 * 主入口
 * @param {object} opts
 * @param {string} opts.applicationId
 * @param {string[]} [opts.dimensions]
 * @returns {Promise<{intel: object, queryStats: object}>}
 */
export async function searchIntel({ applicationId, dimensions } = {}) {
  if (!applicationId) {
    const err = new Error('applicationId 必填'); err.status = 400; throw err;
  }
  const apiKey = loadTavilyKey();
  if (!apiKey) {
    const err = new Error('未配置 Tavily API Key，请前往设置页配置'); err.status = 400; throw err;
  }

  const db = getDb();
  const app = loadApplication(db, applicationId);
  if (!app) {
    const err = new Error('投递记录不存在'); err.status = 404; throw err;
  }
  const company = app.companyName;
  const position = app.position;
  if (!company) {
    const err = new Error('投递记录缺少公司名'); err.status = 400; throw err;
  }

  const dims = Array.isArray(dimensions) && dimensions.length ? dimensions : ALL_DIMENSIONS;
  const queries = buildQueries({ company, position, dimensions: dims });

  // 并发跑所有 query，单条失败不致命
  const results = await Promise.all(
    queries.map(({ dim, q }) => runOneQuery({ apiKey, dim, q }))
  );

  // 按维度分组、去重、攒成全局 sources 列表（带稳定编号）
  const perDim = {};
  for (const r of results) {
    perDim[r.dim] = perDim[r.dim] || [];
    perDim[r.dim].push(...r.items);
  }
  for (const dim of Object.keys(perDim)) {
    perDim[dim] = dedupResults(perDim[dim]).slice(0, 10);
  }

  // 全局 sources（按维度拼接顺序排号，给 LLM 用）
  const sources = [];
  let cursor = 0;
  const indexedPerDim = {};
  for (const dim of Object.keys(perDim)) {
    indexedPerDim[dim] = perDim[dim].map(r => {
      cursor += 1;
      sources.push({ idx: cursor, url: r.url, title: r.title, snippet: r.snippet, publishedDate: r.publishedDate, dim });
      return { ...r, idx: cursor };
    });
  }

  // 若一条都没搜到，直接返回空结构（不调 LLM）
  if (!sources.length) {
    const empty = normalizeIntel(null, []);
    persist(db, applicationId, empty);
    return {
      intel: empty,
      queryStats: { totalQueries: queries.length, totalSources: 0, errors: results.filter(r => r.error).map(r => ({ q: r.q, error: r.error })) }
    };
  }

  // 让 LLM 结构化
  const { system, user } = buildLLMPrompt({ company, position, perDim: indexedPerDim });

  let parsed = null;
  let raw = '';
  try {
    const out = await callWithFallback('intel_summary', { system, user }, 'text', {});
    raw = out.content;
    parsed = safeParseJSON(raw);
  } catch (e) {
    const err = new Error(`LLM 总结失败：${e.message}`); err.status = 502; throw err;
  }

  // 一次纠错重试：要求只输出 JSON
  if (!parsed) {
    try {
      const out2 = await callWithFallback('intel_summary',
        { system: system + '\n\n上次输出无法被 JSON.parse，请重新输出，只允许 JSON。', user },
        'text', {});
      parsed = safeParseJSON(out2.content);
    } catch { /* swallow, normalizeIntel 会兜底为空 */ }
  }

  const intel = normalizeIntel(parsed, sources);
  persist(db, applicationId, intel);
  return {
    intel,
    queryStats: {
      totalQueries: queries.length,
      totalSources: sources.length,
      errors: results.filter(r => r.error).map(r => ({ q: r.q, error: r.error }))
    }
  };
}
