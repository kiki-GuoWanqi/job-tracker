// AI provider 与功能路由的默认配置 + 配置读写工具

import { getDb } from './db.js';

export const PROVIDER_DEFAULTS = {
  deepseek: {
    label: 'DeepSeek',
    baseUrl: 'https://api.deepseek.com/v1',
    textModel: 'deepseek-chat',
    visionModel: 'deepseek-chat',
    supportsVision: true,
    keyEnv: 'DEEPSEEK_API_KEY'
  },
  qwen: {
    label: '阿里千问',
    baseUrl: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
    textModel: 'qwen-plus',
    visionModel: 'qwen-vl-plus',
    supportsVision: true,
    keyEnv: 'QWEN_API_KEY'
  },
  openai: {
    label: 'OpenAI (GPT)',
    baseUrl: 'https://api.openai.com/v1',
    textModel: 'gpt-4o-mini',
    visionModel: 'gpt-4o-mini',
    supportsVision: true,
    keyEnv: 'OPENAI_API_KEY'
  },
  anthropic: {
    label: 'Anthropic (Claude)',
    baseUrl: 'https://api.anthropic.com/v1',
    textModel: 'claude-sonnet-4-6',
    visionModel: 'claude-sonnet-4-6',
    supportsVision: true,
    keyEnv: 'ANTHROPIC_API_KEY'
  }
};

export const PROVIDER_KEYS = Object.keys(PROVIDER_DEFAULTS);

// AI 功能（purpose）列表 — 决定支持哪些路由项
export const AI_PURPOSES = [
  { key: 'jd_format',          label: 'JD 格式化',        kind: 'text'   },
  { key: 'interview_analysis', label: 'AI 面试建议',      kind: 'text'   },
  { key: 'ref_answer',         label: '面试参考答案',      kind: 'text'   },
  { key: 'match_score',        label: '简历匹配评分',      kind: 'text'   },
  { key: 'company_research',   label: 'AI 公司研究',      kind: 'text'   },
  { key: 'greeting_message',   label: '打招呼语生成',      kind: 'text'   },
  { key: 'cover_letter',       label: '求职信生成',        kind: 'text'   },
  { key: 'jd_extract',         label: 'JD 文本结构化提取',  kind: 'text'   },
  { key: 'jd_ocr',             label: 'JD 截图识别',      kind: 'vision' },
  { key: 'connection_test',    label: '连接测试',         kind: 'text'   }
];

export const DEFAULT_ROUTING = {
  jd_format:          'deepseek',
  interview_analysis: 'deepseek',
  ref_answer:         'deepseek',
  match_score:        'deepseek',
  company_research:   'deepseek',
  greeting_message:   'deepseek',
  cover_letter:       'deepseek',
  jd_extract:         'deepseek',
  jd_ocr:             'qwen',
  connection_test:    'deepseek'
};

const KEY_PROVIDERS = 'ai_providers';
const KEY_ROUTING   = 'ai_routing';

function readKv(db, key) {
  const row = db.prepare('SELECT value FROM settings WHERE key = ?').get(key);
  return row ? row.value : null;
}

function writeKv(db, key, value) {
  db.prepare(
    'INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value'
  ).run(key, value);
}

// 标准化 provider 配置：填充默认值
function normalizeProvider(providerKey, raw) {
  const def = PROVIDER_DEFAULTS[providerKey] || {};
  const v = raw || {};
  return {
    apiKey:      typeof v.apiKey      === 'string' ? v.apiKey      : '',
    baseUrl:     (v.baseUrl     || def.baseUrl     || '').trim(),
    textModel:   (v.textModel   || def.textModel   || '').trim(),
    visionModel: (v.visionModel || def.visionModel || '').trim()
  };
}

// 读取所有 providers（含 .env 兜底）。返回 { providerKey: { apiKey, baseUrl, textModel, visionModel } }
export function loadProviders() {
  const db = getDb();
  const raw = readKv(db, KEY_PROVIDERS);
  let stored = {};
  try { stored = raw ? JSON.parse(raw) : {}; } catch { stored = {}; }

  const out = {};
  for (const pk of PROVIDER_KEYS) {
    const cfg = normalizeProvider(pk, stored[pk] || {});
    // 若 DB 中没有 apiKey，回退读 .env
    if (!cfg.apiKey) {
      const envName = PROVIDER_DEFAULTS[pk].keyEnv;
      const envVal = (process.env[envName] || '').trim();
      if (envVal) cfg.apiKey = envVal;
    }
    out[pk] = cfg;
  }
  return out;
}

export function saveProviders(input) {
  const db = getDb();
  const current = loadProviders();
  const merged = {};
  for (const pk of PROVIDER_KEYS) {
    const inCfg = input?.[pk] || {};
    // apiKey: 只有当输入字段是字符串时才更新；undefined/null 视为不变；空字符串视为清除
    let apiKey = current[pk].apiKey;
    if (typeof inCfg.apiKey === 'string') apiKey = inCfg.apiKey.trim();
    merged[pk] = normalizeProvider(pk, {
      apiKey,
      baseUrl:     inCfg.baseUrl     ?? current[pk].baseUrl,
      textModel:   inCfg.textModel   ?? current[pk].textModel,
      visionModel: inCfg.visionModel ?? current[pk].visionModel
    });
  }
  // 持久化前剔除 .env 注入的值（仅当 DB 之前为空且当前等于 .env 时），避免 .env 改动后旧值滞留
  const toStore = {};
  for (const pk of PROVIDER_KEYS) {
    toStore[pk] = { ...merged[pk] };
    // 但实际上既然用户在前端"配置"过，就视作显式设置，全部存
  }
  writeKv(db, KEY_PROVIDERS, JSON.stringify(toStore));
  return merged;
}

export function loadRouting() {
  const db = getDb();
  const raw = readKv(db, KEY_ROUTING);
  let stored = {};
  try { stored = raw ? JSON.parse(raw) : {}; } catch { stored = {}; }
  const out = { ...DEFAULT_ROUTING };
  for (const p of AI_PURPOSES) {
    if (stored[p.key] && PROVIDER_KEYS.includes(stored[p.key])) {
      out[p.key] = stored[p.key];
    }
  }
  return out;
}

export function saveRouting(input) {
  const db = getDb();
  const current = loadRouting();
  const merged = { ...current };
  if (input && typeof input === 'object') {
    for (const p of AI_PURPOSES) {
      const v = input[p.key];
      if (typeof v === 'string' && PROVIDER_KEYS.includes(v)) {
        merged[p.key] = v;
      }
    }
  }
  writeKv(db, KEY_ROUTING, JSON.stringify(merged));
  return merged;
}

// 对外暴露给前端：脱敏 apiKey 为 has + preview
export function maskProvidersForFrontend(providers) {
  const out = {};
  for (const pk of PROVIDER_KEYS) {
    const cfg = providers[pk] || {};
    const k = cfg.apiKey || '';
    out[pk] = {
      hasKey: Boolean(k),
      keyPreview: k ? maskKey(k) : '',
      baseUrl: cfg.baseUrl || '',
      textModel: cfg.textModel || '',
      visionModel: cfg.visionModel || ''
    };
  }
  return out;
}

function maskKey(k) {
  if (!k) return '';
  if (k.length <= 8) return '*'.repeat(k.length);
  return k.slice(0, 4) + '****' + k.slice(-4);
}

// 给 ai router 用：根据 purpose 取出"应该用哪个 provider + 哪个 model + key/baseUrl"
export function resolveCallTarget(purpose) {
  const routing = loadRouting();
  const providers = loadProviders();
  const purposeMeta = AI_PURPOSES.find(p => p.key === purpose);
  const isVision = purposeMeta?.kind === 'vision';

  let providerKey = routing[purpose] || (isVision ? 'qwen' : 'deepseek');
  let cfg = providers[providerKey];

  // 若被选 provider 没有 Key，自动降级到任何有 Key 的 provider
  if (!cfg?.apiKey) {
    const fallback = PROVIDER_KEYS.find(pk => providers[pk]?.apiKey);
    if (!fallback) {
      throw new Error(`未配置任何 AI Key（${PROVIDER_KEYS.join(' / ')}），请前往设置页配置`);
    }
    providerKey = fallback;
    cfg = providers[providerKey];
  }

  return {
    providerKey,
    apiKey: cfg.apiKey,
    baseUrl: cfg.baseUrl || PROVIDER_DEFAULTS[providerKey].baseUrl,
    model: isVision
      ? (cfg.visionModel || PROVIDER_DEFAULTS[providerKey].visionModel)
      : (cfg.textModel   || PROVIDER_DEFAULTS[providerKey].textModel),
    isVision
  };
}
