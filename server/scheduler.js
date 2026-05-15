// 每小时一次，在 09:00-09:59 窗口内发一次每日提醒摘要（明天的面试 + 7+ 天未跟进）
// 用 settings KV 的 notify_state.lastDailyAt 做去重，server 重启不丢

import { getDb } from './db.js';
import { notify } from './services/notifier.js';

const KEY_NOTIFY_STATE = 'notify_state';
const DAILY_WINDOW_START_HOUR = 9;   // 09:xx 触发
const DAILY_WINDOW_END_HOUR   = 10;
const TICK_INTERVAL_MS = 60 * 60 * 1000; // 1 小时
const FINAL_STATUSES = new Set(['已 Offer', '已挂']);
const STALE_DAYS = 7;

function loadState() {
  const db = getDb();
  const row = db.prepare('SELECT value FROM settings WHERE key = ?').get(KEY_NOTIFY_STATE);
  if (!row) return {};
  try { return JSON.parse(row.value) || {}; } catch { return {}; }
}

function saveState(state) {
  const db = getDb();
  db.prepare(
    'INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value'
  ).run(KEY_NOTIFY_STATE, JSON.stringify(state));
}

function todayLocalDate() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function tomorrowLocalDate() {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function buildDailyDigest() {
  const db = getDb();
  const tomorrow = tomorrowLocalDate();
  const staleCutoff = new Date(Date.now() - STALE_DAYS * 24 * 60 * 60 * 1000).toISOString();

  // 明天的面试（按 next_interview_date 字段，前端写 YYYY-MM-DD）
  const tomorrowInterviews = db.prepare(
    'SELECT id, company_name, position, interview_round, next_interview_date FROM applications WHERE next_interview_date = ?'
  ).all(tomorrow);

  // 7+ 天未更新 且 状态非 final
  const staleApps = db.prepare(
    'SELECT id, company_name, position, status, updated_at FROM applications WHERE updated_at < ? AND status NOT IN (?, ?) ORDER BY updated_at ASC LIMIT 20'
  ).all(staleCutoff, '已 Offer', '已挂');

  const items = [];
  if (tomorrowInterviews.length) {
    items.push(`📅 明天 ${tomorrow} 的面试（${tomorrowInterviews.length} 场）：`);
    for (const a of tomorrowInterviews) {
      const round = a.interview_round ? ` · ${a.interview_round}` : '';
      items.push(`　• ${a.company_name} · ${a.position || ''}${round}`);
    }
  }
  if (staleApps.length) {
    if (items.length) items.push('');
    items.push(`⏰ 超过 ${STALE_DAYS} 天未跟进（${staleApps.length} 条）：`);
    for (const a of staleApps) {
      const days = Math.floor((Date.now() - new Date(a.updated_at).getTime()) / (24 * 60 * 60 * 1000));
      items.push(`　• ${a.company_name} · ${a.position || ''} · ${a.status} · 已 ${days} 天`);
    }
  }
  if (!items.length) return null;
  return {
    title: '📋 JobTracker 每日提醒',
    summary: `${tomorrow ? '明天面试：' + tomorrowInterviews.length : ''}　未跟进：${staleApps.length}`.trim(),
    items
  };
}

async function tick() {
  try {
    const now = new Date();
    const hour = now.getHours();
    if (hour < DAILY_WINDOW_START_HOUR || hour >= DAILY_WINDOW_END_HOUR) return;

    const state = loadState();
    const today = todayLocalDate();
    if (state.lastDailyAt === today) return;

    const digest = buildDailyDigest();
    if (!digest) {
      // 今天没事件，也标记一下避免每小时反复跑 query
      saveState({ ...state, lastDailyAt: today });
      return;
    }

    const result = await notify('daily_digest', digest);
    if (result.ok || result.skipped) {
      saveState({ ...state, lastDailyAt: today });
    }
    // 若 result.error，下个小时再试，但 daily window 只有 1 小时所以最多再试 1 次
  } catch (e) {
    console.error('[scheduler] tick failed:', e.message || e);
  }
}

let timer = null;

export function startScheduler() {
  if (timer) return;
  // 立刻跑一次，然后定时
  tick().catch(() => {});
  timer = setInterval(() => { tick().catch(() => {}); }, TICK_INTERVAL_MS);
  console.log(`[scheduler] daily digest tick every ${TICK_INTERVAL_MS / 60000} min, window ${DAILY_WINDOW_START_HOUR}-${DAILY_WINDOW_END_HOUR}:00`);
}

export function stopScheduler() {
  if (timer) {
    clearInterval(timer);
    timer = null;
  }
}

// 调试用：手动强制发一次每日摘要（绕过窗口和 dedup）
export async function triggerDailyDigestNow() {
  const digest = buildDailyDigest();
  if (!digest) return { skipped: 'no-events' };
  return notify('daily_digest', digest);
}
