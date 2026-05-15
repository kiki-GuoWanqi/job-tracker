import { Router } from 'express';
import { randomUUID } from 'node:crypto';
import { getDb } from '../db.js';
import { rowToResume, resumeToRow } from '../mappers.js';

const router = Router();

router.get('/', (_req, res) => {
  const db = getDb();
  const rows = db.prepare('SELECT * FROM resumes ORDER BY updated_at DESC').all();
  res.json(rows.map(rowToResume));
});

router.get('/:id', (req, res) => {
  const db = getDb();
  const row = db.prepare('SELECT * FROM resumes WHERE id = ?').get(req.params.id);
  if (!row) return res.status(404).json({ error: 'Not found' });
  res.json(rowToResume(row));
});

router.post('/', (req, res) => {
  const db = getDb();
  const now = new Date().toISOString();
  const r = {
    id: req.body?.id || randomUUID(),
    label: req.body?.label || '',
    fileName: req.body?.fileName || '',
    text: req.body?.text || '',
    createdAt: req.body?.createdAt || now,
    updatedAt: now
  };
  if (!r.text) return res.status(400).json({ error: 'text required' });
  const row = resumeToRow(r);
  db.prepare(
    'INSERT INTO resumes (id, label, file_name, text, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)'
  ).run(row.id, row.label, row.file_name, row.text, row.created_at, row.updated_at);
  res.status(201).json(rowToResume(row));
});

router.put('/:id', (req, res) => {
  const db = getDb();
  const existing = db.prepare('SELECT * FROM resumes WHERE id = ?').get(req.params.id);
  if (!existing) return res.status(404).json({ error: 'Not found' });
  const now = new Date().toISOString();
  const r = {
    id: req.params.id,
    label: req.body?.label ?? existing.label,
    fileName: req.body?.fileName ?? existing.file_name,
    text: req.body?.text ?? existing.text,
    createdAt: existing.created_at,
    updatedAt: now
  };
  const row = resumeToRow(r);
  db.prepare(
    'UPDATE resumes SET label = ?, file_name = ?, text = ?, updated_at = ? WHERE id = ?'
  ).run(row.label, row.file_name, row.text, row.updated_at, row.id);
  res.json(rowToResume(row));
});

router.delete('/:id', (req, res) => {
  const db = getDb();
  const result = db.prepare('DELETE FROM resumes WHERE id = ?').run(req.params.id);
  if (result.changes === 0) return res.status(404).json({ error: 'Not found' });
  res.json({ ok: true });
});

export default router;
