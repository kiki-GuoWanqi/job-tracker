// Webhook 通知主入口
// 用法：notify('status_changed', { title, summary, items?, raw? })

import { getDb } from '../db.js';
import * as generic from './notify-adapters/generic.js';
import * as wechatWork from './notify-adapters/wechat-work.js';

const KEY_NOTIFY_SETTINGS = 'notify_settings';

export const NOTIFY_EVENTS = [
  { key: 'status_changed', label: '投递状态变更', defaultOn: true },
  { key: 'daily_digest',   label: '每日提醒摘要（面试日 / 未跟进）', defaultOn: true }
];

export const NOTIFY_CHANNELS = [
  { key: 'generic',     label: '通用 JSON Webhook' },
  { key: 'wechat_work', label: '企业微信群机器人' }
];

const ADAPTERS = {
  generic,
  wechat_work: wechatWork
};

export const DEFAULT_NOTIFY_SETTINGS = {
  webhookUrl: '',
  channel: 'generic',
  events: Object.fromEntries(NOTIFY_EVENTS.map(e => [e.key, e.defaultOn]))
};

function normalizeEvents(raw) {
  const out = {};
  for (const e of NOTIFY_EVENTS) {
    out[e.key] = raw && typeof raw[e.key] === 'boolean' ? raw[e.key] : e.defaultOn;
  }
  return out;
}

export function normalizeNotifySettings(input) {
  const v = input && typeof input === 'object' ? input : {};
  const channel = NOTIFY_CHANNELS.some(c => c.key === v.channel) ? v.channel : 'generic';
  return {
    webhookUrl: typeof v.webhookUrl === 'string' ? v.webhookUrl.trim() : '',
    channel,
    events: normalizeEvents(v.events)
  };
}

export function loadNotifySettings() {
  const db = getDb();
  const row = db.prepare('SELECT value FROM settings WHERE key = ?').get(KEY_NOTIFY_SETTINGS);
  if (!row) return { ...DEFAULT_NOTIFY_SETTINGS };
  try {
    return normalizeNotifySettings(JSON.parse(row.value));
  } catch {
    return { ...DEFAULT_NOTIFY_SETTINGS };
  }
}

export function saveNotifySettings(input) {
  const db = getDb();
  const merged = normalizeNotifySettings({ ...loadNotifySettings(), ...input });
  db.prepare(
    'INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value'
  ).run(KEY_NOTIFY_SETTINGS, JSON.stringify(merged));
  return merged;
}

// 脱敏 webhook URL（保留 host + 后 6 位）
export function maskWebhookForFrontend(s) {
  const url = s?.webhookUrl || '';
  let host = '';
  try { host = new URL(url).host; } catch { /* ignore */ }
  return {
    hasUrl: Boolean(url),
    urlHost: host,
    urlTail: url ? url.slice(-6) : '',
    channel: s?.channel || 'generic',
    events: s?.events || {}
  };
}

function adapterOf(channel) {
  return ADAPTERS[channel] || ADAPTERS.generic;
}

// 主入口：失败不抛，只 console.error，避免业务路径被通知问题拖垮
export async function notify(event, payload) {
  const settings = loadNotifySettings();
  if (!settings.webhookUrl) return { skipped: 'no-url' };
  if (!settings.events?.[event]) return { skipped: 'event-disabled' };

  const adapter = adapterOf(settings.channel);
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(new Error('webhook timeout')), 10_000);
  try {
    await adapter.send({
      webhookUrl: settings.webhookUrl,
      event,
      payload,
      signal: ctl.signal
    });
    return { ok: true };
  } catch (e) {
    console.error(`[notify] ${event} failed:`, e.message || e);
    return { error: e.message || String(e) };
  } finally {
    clearTimeout(timer);
  }
}

// 强制发送（不检查 event 开关），仅用于测试连接
export async function notifyTest(payload = {}) {
  const settings = loadNotifySettings();
  if (!settings.webhookUrl) throw new Error('未配置 Webhook URL');
  const adapter = adapterOf(settings.channel);
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(new Error('webhook timeout')), 10_000);
  try {
    await adapter.send({
      webhookUrl: settings.webhookUrl,
      event: 'test',
      payload: {
        title: 'JobTracker 测试消息',
        summary: '如果你看到这条消息，说明 Webhook 配置正常 ✓',
        items: [`通道：${settings.channel}`, `时间：${new Date().toLocaleString('zh-CN', { hour12: false })}`],
        ...payload
      },
      signal: ctl.signal
    });
    return { ok: true };
  } finally {
    clearTimeout(timer);
  }
}
