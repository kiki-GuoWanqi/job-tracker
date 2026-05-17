// Tavily Search API Key 存取：DB 优先，回退到 .env(TAVILY_API_KEY)
// 与 ai-config.js 的 provider key 处理风格一致（不暴露明文给前端）

import { getDb } from '../db.js';

const KEY = 'tavily_key';

export function loadTavilyKey() {
  const db = getDb();
  const row = db.prepare('SELECT value FROM settings WHERE key = ?').get(KEY);
  const stored = (row?.value || '').trim();
  if (stored) return stored;
  return (process.env.TAVILY_API_KEY || '').trim();
}

export function saveTavilyKey(value) {
  const db = getDb();
  const v = typeof value === 'string' ? value.trim() : '';
  db.prepare(
    'INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value'
  ).run(KEY, v);
  return v;
}

export function maskTavilyKey(k) {
  if (!k) return '';
  if (k.length <= 8) return '*'.repeat(k.length);
  return k.slice(0, 4) + '****' + k.slice(-4);
}

export function maskTavilyForFrontend() {
  const k = loadTavilyKey();
  return {
    hasKey: Boolean(k),
    keyPreview: k ? maskTavilyKey(k) : ''
  };
}
