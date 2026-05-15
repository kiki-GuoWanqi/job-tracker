import { Router } from 'express';
import { randomUUID } from 'node:crypto';
import { getDb } from '../db.js';
import { APP_DB_COLUMNS, rowToApplication, applicationToRow } from '../mappers.js';
import { notify } from '../services/notifier.js';
import { dedupHistory, historyEquals } from '../utils/status-history.js';

const router = Router();

function loadStatusHistoryMap(db) {
  const rows = db.prepare(
    'SELECT application_id, status, round, changed_at FROM status_history ORDER BY id ASC'
  ).all();
  const map = new Map();
  for (const r of rows) {
    if (!map.has(r.application_id)) map.set(r.application_id, []);
    map.get(r.application_id).push(r);
  }
  return map;
}

function loadStatusHistory(db, id) {
  return db.prepare(
    'SELECT status, round, changed_at FROM status_history WHERE application_id = ? ORDER BY id ASC'
  ).all(id);
}

function insertStatusHistoryRows(db, appId, history) {
  if (!Array.isArray(history) || history.length === 0) return;
  const stmt = db.prepare(
    'INSERT INTO status_history (application_id, status, round, changed_at) VALUES (?, ?, ?, ?)'
  );
  for (const h of history) {
    stmt.run(appId, h.status || '', h.round || '', h.changedAt || h.changed_at || '');
  }
}

// 用 dedup 后的结果替换某 app 的整段 status_history。仅在内容真的变了时才写
function replaceStatusHistoryDeduped(db, appId, candidate) {
  const deduped = dedupHistory(candidate);
  const current = db.prepare(
    'SELECT status, round, changed_at FROM status_history WHERE application_id = ? ORDER BY id ASC'
  ).all(appId);
  if (historyEquals(current, deduped)) return deduped;
  db.prepare('DELETE FROM status_history WHERE application_id = ?').run(appId);
  insertStatusHistoryRows(db, appId, deduped);
  return deduped;
}

function upsertApplication(db, app) {
  const row = applicationToRow(app);
  const cols = APP_DB_COLUMNS;
  const placeholders = cols.map(() => '?').join(', ');
  const updates = cols.filter(c => c !== 'id').map(c => `${c} = excluded.${c}`).join(', ');
  const sql = `INSERT INTO applications (${cols.join(', ')}) VALUES (${placeholders})
               ON CONFLICT(id) DO UPDATE SET ${updates}`;
  const values = cols.map(c => row[c]);
  db.prepare(sql).run(...values);
}

router.get('/', (_req, res) => {
  const db = getDb();
  const rows = db.prepare('SELECT * FROM applications ORDER BY created_at DESC').all();
  const historyMap = loadStatusHistoryMap(db);
  res.json(rows.map(r => rowToApplication(r, historyMap.get(r.id) || [])));
});

router.get('/:id', (req, res) => {
  const db = getDb();
  const row = db.prepare('SELECT * FROM applications WHERE id = ?').get(req.params.id);
  if (!row) return res.status(404).json({ error: 'Not found' });
  res.json(rowToApplication(row, loadStatusHistory(db, req.params.id)));
});

router.post('/', (req, res) => {
  const db = getDb();
  const now = new Date().toISOString();
  const app = {
    ...req.body,
    id: req.body?.id || randomUUID(),
    createdAt: req.body?.createdAt || now,
    updatedAt: now
  };
  if (!app.companyName) return res.status(400).json({ error: 'companyName required' });

  const tx = db.prepare('BEGIN');
  tx.run();
  try {
    upsertApplication(db, app);
    if (Array.isArray(app.statusHistory) && app.statusHistory.length > 0) {
      const deduped = dedupHistory(app.statusHistory);
      insertStatusHistoryRows(db, app.id, deduped);
    }
    db.prepare('COMMIT').run();
  } catch (e) {
    db.prepare('ROLLBACK').run();
    throw e;
  }

  const row = db.prepare('SELECT * FROM applications WHERE id = ?').get(app.id);
  res.status(201).json(rowToApplication(row, loadStatusHistory(db, app.id)));
});

router.put('/:id', (req, res) => {
  const db = getDb();
  const id = req.params.id;
  const existing = db.prepare('SELECT id FROM applications WHERE id = ?').get(id);
  if (!existing) return res.status(404).json({ error: 'Not found' });

  const app = {
    ...req.body,
    id,
    updatedAt: new Date().toISOString()
  };

  db.prepare('BEGIN').run();
  try {
    upsertApplication(db, app);
    if (Array.isArray(app.statusHistory)) {
      replaceStatusHistoryDeduped(db, id, app.statusHistory);
    }
    db.prepare('COMMIT').run();
  } catch (e) {
    db.prepare('ROLLBACK').run();
    throw e;
  }

  const row = db.prepare('SELECT * FROM applications WHERE id = ?').get(id);
  res.json(rowToApplication(row, loadStatusHistory(db, id)));
});

router.delete('/:id', (req, res) => {
  const db = getDb();
  const result = db.prepare('DELETE FROM applications WHERE id = ?').run(req.params.id);
  if (result.changes === 0) return res.status(404).json({ error: 'Not found' });
  res.json({ ok: true });
});

router.post('/:id/status', (req, res) => {
  const db = getDb();
  const id = req.params.id;
  const { status, round = '', offerSalary } = req.body || {};
  if (typeof status !== 'string' || !status) {
    return res.status(400).json({ error: 'status required' });
  }
  const existing = db.prepare('SELECT id, status, interview_round, company_name, position FROM applications WHERE id = ?').get(id);
  if (!existing) return res.status(404).json({ error: 'Not found' });

  const now = new Date().toISOString();
  db.prepare('BEGIN').run();
  try {
    if (typeof offerSalary === 'string') {
      db.prepare(
        'UPDATE applications SET status = ?, interview_round = ?, offer_salary = ?, updated_at = ? WHERE id = ?'
      ).run(status, round, offerSalary, now, id);
    } else {
      db.prepare(
        'UPDATE applications SET status = ?, interview_round = ?, updated_at = ? WHERE id = ?'
      ).run(status, round, now, id);
    }
    // 状态时间轴：取现有 history + 候选新条目，过一遍 dedup（处理重复 / 倒退），再写回
    const existing = db.prepare(
      'SELECT status, round, changed_at FROM status_history WHERE application_id = ? ORDER BY id ASC'
    ).all(id);
    replaceStatusHistoryDeduped(db, id, [...existing, { status, round, changed_at: now }]);
    db.prepare('COMMIT').run();
  } catch (e) {
    db.prepare('ROLLBACK').run();
    throw e;
  }

  // 通知（异步、失败静默）：只在状态或轮次实际变化时触发
  const statusChanged = existing.status !== status || existing.interview_round !== round;
  if (statusChanged) {
    const fromLabel = existing.interview_round ? `${existing.status}·${existing.interview_round}` : existing.status;
    const toLabel   = round ? `${status}·${round}` : status;
    notify('status_changed', {
      title: `📌 投递状态变更：${existing.company_name}`,
      summary: `${existing.position || ''}　${fromLabel} → ${toLabel}`,
      items: [`公司：${existing.company_name}`, `岗位：${existing.position || '（未填）'}`, `状态：${fromLabel} → ${toLabel}`]
    }).catch(() => {});
  }

  const row = db.prepare('SELECT * FROM applications WHERE id = ?').get(id);
  res.json(rowToApplication(row, loadStatusHistory(db, id)));
});

export default router;
