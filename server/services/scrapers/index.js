// 多平台 JD 抓取 dispatcher
// 按 hostname 匹配 adapter；任何 adapter 失败时回落到 generic

import * as boss     from './adapters/boss.js';
import * as lagou    from './adapters/lagou.js';
import * as liepin   from './adapters/liepin.js';
import * as zhaopin  from './adapters/zhaopin.js';
import * as job51    from './adapters/job51.js';
import * as linkedin from './adapters/linkedin.js';
import * as generic  from './adapters/generic.js';
import { looksBlocked } from './common.js';

const UA_DESKTOP = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';

const ADAPTERS = [boss, lagou, liepin, zhaopin, job51, linkedin];

export const SUPPORTED_PLATFORMS = ADAPTERS.concat([generic]).map(a => ({
  id: a.id, label: a.label, hostMatch: a.hostMatch
}));

function pickAdapter(hostname) {
  const h = hostname.toLowerCase();
  for (const a of ADAPTERS) {
    if (a.hostMatch.some(suffix => h === suffix || h.endsWith(`.${suffix}`))) {
      return a;
    }
  }
  return generic;
}

export async function scrapeJob(url, { signal } = {}) {
  let parsed;
  try { parsed = new URL(url); } catch {
    const e = new Error('URL 格式不正确');
    e.status = 400;
    throw e;
  }
  if (!/^https?:$/.test(parsed.protocol)) {
    const e = new Error('仅支持 http / https 链接');
    e.status = 400;
    throw e;
  }

  const adapter = pickAdapter(parsed.hostname);

  let html;
  try {
    const resp = await fetch(url, {
      headers: {
        'User-Agent': UA_DESKTOP,
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8',
        'Referer': parsed.origin
      },
      signal,
      redirect: 'follow'
    });
    if (!resp.ok) {
      const e = new Error(`抓取失败：HTTP ${resp.status}`);
      e.status = 502;
      e.detail = { platform: adapter.id };
      throw e;
    }
    html = await resp.text();
  } catch (e) {
    if (e.status) throw e;
    const err = new Error(`网络错误：${e.message || e}`);
    err.status = 502;
    err.detail = { platform: adapter.id };
    throw err;
  }

  const blocked = looksBlocked(html);
  let extracted = {};
  try {
    extracted = adapter.parse(html) || {};
  } catch (e) {
    extracted = {};
  }
  // 若 adapter 啥也没抓到，再让 generic 兜一次
  if (adapter.id !== 'generic' && !extracted.companyName && !extracted.position && !extracted.jdRaw) {
    try {
      const fallback = generic.parse(html);
      if (fallback.companyName || fallback.position || fallback.jdRaw) extracted = fallback;
    } catch { /* keep empty */ }
  }

  const result = {
    source:      adapter.id,
    platform:    adapter.label,
    url,
    companyName: extracted.companyName || '',
    position:    extracted.position    || '',
    salary:      extracted.salary      || '',
    location:    extracted.location    || '',
    jdRaw:       extracted.jdRaw       || '',
    blocked,
    note: blocked
      ? `${adapter.label} 触发反爬或返回空壳页面，建议改用「从粘贴文本提取」（推荐）方案。`
      : (extracted.jdRaw ? '' : `${adapter.label} 静态 HTML 只含 meta 摘要，JD 正文需 JS 渲染。建议改用「从粘贴文本提取」方案补全。`)
  };

  if (!result.companyName && !result.position && !result.jdRaw) {
    const e = new Error(result.note || '未抓到任何字段');
    e.status = 422;
    e.detail = { platform: adapter.id, blocked };
    throw e;
  }

  return result;
}
