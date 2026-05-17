import { DatabaseSync } from 'node:sqlite';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { dedupHistory, historyEquals } from './utils/status-history.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '..');
const dataDir = path.join(projectRoot, 'data');
const dbPath = path.join(dataDir, 'jobtracker.db');
const schemaPath = path.join(__dirname, 'schema.sql');

let dbInstance = null;

export function initDb() {
  if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
  }
  dbInstance = new DatabaseSync(dbPath);
  dbInstance.exec('PRAGMA journal_mode = WAL');
  dbInstance.exec('PRAGMA foreign_keys = ON');
  const schema = fs.readFileSync(schemaPath, 'utf-8');
  dbInstance.exec(schema);
  runMigrations(dbInstance);
  runDataMigrations(dbInstance);
  return dbInstance;
}

// Idempotent ALTER TABLE for fields added after initial schema.
// schema.sql holds the latest shape for fresh installs; this catches existing DBs.
function runMigrations(db) {
  const cols = new Set(
    db.prepare("PRAGMA table_info(applications)").all().map(c => c.name)
  );
  const additions = [
    ['greeting_message', 'TEXT'],
    ['greeting_message_at', 'TEXT'],
    ['cover_letter', 'TEXT'],
    ['cover_letter_at', 'TEXT'],
    ['display_order', 'REAL'],
    ['intel_json', 'TEXT'],
    ['intel_at', 'TEXT']
  ];
  for (const [col, type] of additions) {
    if (!cols.has(col)) {
      db.exec(`ALTER TABLE applications ADD COLUMN ${col} ${type}`);
    }
  }
}

// 一次性数据迁移：清单存在 settings.data_migrations（JSON 字符串数组），跑过的 key 不再跑
function runDataMigrations(db) {
  const KEY = 'data_migrations';
  const row = db.prepare('SELECT value FROM settings WHERE key = ?').get(KEY);
  let done = [];
  try { done = row ? JSON.parse(row.value) : []; } catch { done = []; }
  const marker = (k) => done.push(k);

  if (!done.includes('dedup_status_history_v1')) {
    dedupAllStatusHistory(db);
    marker('dedup_status_history_v1');
    db.prepare(
      'INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value'
    ).run(KEY, JSON.stringify(done));
    console.log('[migration] dedup_status_history_v1 完成');
  }

  if (!done.includes('backfill_display_order_v1')) {
    backfillDisplayOrder(db);
    marker('backfill_display_order_v1');
    db.prepare(
      'INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value'
    ).run(KEY, JSON.stringify(done));
    console.log('[migration] backfill_display_order_v1 完成');
  }
}

// 用 created_at 的毫秒数填充缺失的 display_order，让历史数据有合理初值（创建越新越靠上）
function backfillDisplayOrder(db) {
  const rows = db.prepare(
    'SELECT id, created_at FROM applications WHERE display_order IS NULL'
  ).all();
  if (!rows.length) return;
  const stmt = db.prepare('UPDATE applications SET display_order = ? WHERE id = ?');
  for (const r of rows) {
    const t = Date.parse(r.created_at);
    stmt.run(Number.isFinite(t) ? t : Date.now(), r.id);
  }
  console.log(`[migration] 已为 ${rows.length} 条投递回填 display_order`);
}

// 把所有 application 的 status_history 跑一遍 dedupHistory，只对实际变化的写回
function dedupAllStatusHistory(db) {
  const appIds = db.prepare('SELECT id FROM applications').all().map(r => r.id);
  let touched = 0;
  for (const appId of appIds) {
    const existing = db.prepare(
      'SELECT status, round, changed_at FROM status_history WHERE application_id = ? ORDER BY id ASC'
    ).all(appId);
    if (!existing.length) continue;
    const deduped = dedupHistory(existing);
    if (historyEquals(existing, deduped)) continue;
    db.prepare('DELETE FROM status_history WHERE application_id = ?').run(appId);
    if (deduped.length) {
      const stmt = db.prepare(
        'INSERT INTO status_history (application_id, status, round, changed_at) VALUES (?, ?, ?, ?)'
      );
      for (const h of deduped) stmt.run(appId, h.status, h.round || '', h.changed_at || '');
    }
    touched++;
  }
  if (touched > 0) console.log(`[migration] 已去重 ${touched} 条投递记录的时间轴`);
}

export function getDb() {
  if (!dbInstance) {
    throw new Error('Database not initialized. Call initDb() first.');
  }
  return dbInstance;
}
