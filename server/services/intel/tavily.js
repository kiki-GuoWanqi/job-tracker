// Tavily Search API 封装（https://docs.tavily.com）
// 风格参考 ai-anthropic.js：fetch + AbortController + 错误规范化

const DEFAULT_INCLUDE_DOMAINS = [
  'nowcoder.com',     // 牛客
  'kanzhun.com',      // 看准网
  'jobui.com',
  'zhihu.com',
  'xiaohongshu.com',
  'csdn.net',
  'juejin.cn',
  '1point3acres.com',
  'maimai.cn',
  'glassdoor.com'
];

export async function tavilySearch({ apiKey, query, maxResults = 5, depth = 'basic', includeDomains, signal } = {}) {
  if (!apiKey) {
    const err = new Error('Tavily API Key 未配置');
    err.status = 400;
    throw err;
  }
  if (!query || typeof query !== 'string') {
    throw new Error('query 必填');
  }

  const body = {
    api_key: apiKey,
    query: query.trim(),
    search_depth: depth,                 // 'basic' or 'advanced'
    max_results: Math.max(1, Math.min(10, maxResults)),
    include_answer: false,
    include_raw_content: false,
    include_domains: Array.isArray(includeDomains) && includeDomains.length
      ? includeDomains
      : DEFAULT_INCLUDE_DOMAINS
  };

  const resp = await fetch('https://api.tavily.com/search', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    signal
  });

  if (!resp.ok) {
    const text = await resp.text().catch(() => '');
    const err = new Error(`Tavily ${resp.status}: ${text.slice(0, 300)}`);
    err.status = resp.status === 401 ? 400 : 502;
    throw err;
  }
  const data = await resp.json();
  const results = Array.isArray(data?.results) ? data.results : [];
  // 标准化结果字段
  return results.map(r => ({
    url: r.url || '',
    title: r.title || '',
    snippet: (r.content || '').slice(0, 1000),
    score: typeof r.score === 'number' ? r.score : null,
    publishedDate: r.published_date || ''
  }));
}
