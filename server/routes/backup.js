import { Router } from 'express';
import { getDb } from '../db.js';
import { APP_DB_COLUMNS, rowToApplication, applicationToRow, rowToResume, resumeToRow } from '../mappers.js';

const router = Router();

router.get('/export', (_req, res) => {
  const db = getDb();
  const appRows = db.prepare('SELECT * FROM applications ORDER BY created_at DESC').all();
  const historyRows = db.prepare(
    'SELECT application_id, status, round, changed_at FROM status_history ORDER BY id ASC'
  ).all();
  const histMap = new Map();
  for (const h of historyRows) {
    if (!histMap.has(h.application_id)) histMap.set(h.application_id, []);
    histMap.get(h.application_id).push(h);
  }
  const applications = appRows.map(r => rowToApplication(r, histMap.get(r.id) || []));

  const resumes = db.prepare('SELECT * FROM resumes ORDER BY updated_at DESC').all().map(rowToResume);

  const defaultRow = db.prepare("SELECT value FROM settings WHERE key = 'default_resume_id'").get();
  const customRow = db.prepare("SELECT value FROM settings WHERE key = 'custom_statuses'").get();
  let customStatuses = [];
  try { customStatuses = JSON.parse(customRow?.value || '[]'); } catch { customStatuses = []; }

  res.json({
    exportedAt: new Date().toISOString(),
    applications,
    settings: {
      deepseekApiKey: '',
      qwenApiKey: '',
      resumes,
      defaultResumeId: defaultRow?.value || '',
      customStatuses,
      resumeText: '',
      resumeFileName: ''
    }
  });
});

router.post('/import', (req, res) => {
  const db = getDb();
  const payload = req.body || {};
  if (!Array.isArray(payload.applications)) {
    return res.status(400).json({ error: 'applications 字段必填且必须是数组' });
  }

  db.prepare('BEGIN').run();
  try {
    // 清空
    db.prepare('DELETE FROM status_history').run();
    db.prepare('DELETE FROM applications').run();
    db.prepare('DELETE FROM resumes').run();
    db.prepare("DELETE FROM settings WHERE key IN ('default_resume_id', 'custom_statuses')").run();

    // 写入 applications
    const cols = APP_DB_COLUMNS;
    const placeholders = cols.map(() => '?').join(', ');
    const insertApp = db.prepare(
      `INSERT INTO applications (${cols.join(', ')}) VALUES (${placeholders})`
    );
    const insertHist = db.prepare(
      'INSERT INTO status_history (application_id, status, round, changed_at) VALUES (?, ?, ?, ?)'
    );
    for (const app of payload.applications) {
      if (!app || typeof app !== 'object' || !app.id) continue;
      const row = applicationToRow(app);
      insertApp.run(...cols.map(c => row[c]));
      if (Array.isArray(app.statusHistory)) {
        for (const h of app.statusHistory) {
          insertHist.run(app.id, h.status || '', h.round || '', h.changedAt || '');
        }
      }
    }

    // 写入 resumes（从 settings.resumes 或 payload.resumes 取）
    const resumes = (payload.settings && Array.isArray(payload.settings.resumes))
      ? payload.settings.resumes
      : (Array.isArray(payload.resumes) ? payload.resumes : []);
    const insertResume = db.prepare(
      'INSERT INTO resumes (id, label, file_name, text, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)'
    );
    for (const r of resumes) {
      if (!r || typeof r !== 'object' || !r.id) continue;
      const row = resumeToRow(r);
      insertResume.run(row.id, row.label, row.file_name, row.text, row.created_at, row.updated_at);
    }

    // 写入 settings 单 KV
    const settings = payload.settings || {};
    if (typeof settings.defaultResumeId === 'string') {
      db.prepare(
        'INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value'
      ).run('default_resume_id', settings.defaultResumeId);
    }
    if (Array.isArray(settings.customStatuses)) {
      db.prepare(
        'INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value'
      ).run('custom_statuses', JSON.stringify(settings.customStatuses.filter(s => typeof s === 'string')));
    }

    db.prepare('COMMIT').run();
  } catch (e) {
    db.prepare('ROLLBACK').run();
    return res.status(500).json({ error: e.message || '导入失败' });
  }

  res.json({ ok: true, imported: payload.applications.length });
});

export default router;
