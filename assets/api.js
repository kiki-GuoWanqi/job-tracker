// JobTracker 后端 fetch 封装层
// 所有调用都返回 Promise；非 2xx 抛 Error（message 取后端 error 字段）

const BASE = '/api';

async function request(method, url, body) {
  const opts = {
    method,
    headers: { 'Content-Type': 'application/json' }
  };
  if (body !== undefined) opts.body = JSON.stringify(body);
  const resp = await fetch(BASE + url, opts);
  const ctype = resp.headers.get('content-type') || '';
  const data = ctype.includes('application/json') ? await resp.json().catch(() => ({})) : await resp.text();
  if (!resp.ok) {
    const msg = (data && data.error) || (typeof data === 'string' ? data : `HTTP ${resp.status}`);
    const err = new Error(msg);
    err.status = resp.status;
    err.detail = data?.detail;
    throw err;
  }
  return data;
}

window.JobTrackerAPI = {
  health: () => request('GET', '/health'),

  applications: {
    list: () => request('GET', '/applications'),
    get: (id) => request('GET', `/applications/${encodeURIComponent(id)}`),
    create: (app) => request('POST', '/applications', app),
    update: (id, app) => request('PUT', `/applications/${encodeURIComponent(id)}`, app),
    remove: (id) => request('DELETE', `/applications/${encodeURIComponent(id)}`),
    changeStatus: (id, payload) =>
      request('POST', `/applications/${encodeURIComponent(id)}/status`, payload)
  },

  settings: {
    get: () => request('GET', '/settings'),
    update: (payload) => request('PUT', '/settings', payload)
  },

  resumes: {
    list: () => request('GET', '/resumes'),
    create: (r) => request('POST', '/resumes', r),
    update: (id, r) => request('PUT', `/resumes/${encodeURIComponent(id)}`, r),
    remove: (id) => request('DELETE', `/resumes/${encodeURIComponent(id)}`)
  },

  ai: {
    text: ({ system, user, purpose, provider, noFallback }) =>
      request('POST', '/ai/text', { system, user, purpose, provider, noFallback }),
    vision: ({ prompt, base64, mimeType, purpose, provider, noFallback }) =>
      request('POST', '/ai/vision', { prompt, base64, mimeType, purpose, provider, noFallback })
  },

  backup: {
    export: () => request('GET', '/backup/export'),
    import: (payload) => request('POST', '/backup/import', payload)
  },

  notify: {
    test: () => request('POST', '/notify/test'),
    triggerDaily: () => request('POST', '/notify/trigger-daily')
  },

  stats: {
    overview: () => request('GET', '/stats/overview')
  },

  scrape: {
    job: (url) => request('POST', '/scrape/job', { url }),
    platforms: () => request('GET', '/scrape/platforms')
  }
};
