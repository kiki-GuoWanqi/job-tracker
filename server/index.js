import 'dotenv/config';
import express from 'express';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import rateLimit from 'express-rate-limit';

import { initDb } from './db.js';
import applicationsRouter from './routes/applications.js';
import settingsRouter from './routes/settings.js';
import resumesRouter from './routes/resumes.js';
import aiRouter from './routes/ai.js';
import backupRouter from './routes/backup.js';
import notifyRouter from './routes/notify.js';
import statsRouter from './routes/stats.js';
import scrapeRouter from './routes/scrape.js';
import { startScheduler } from './scheduler.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '..');

const PORT = Number(process.env.PORT) || 3000;
const HOST = process.env.HOST || '127.0.0.1';
const AI_RATE = Number(process.env.AI_RATE_LIMIT_PER_MIN) || 60;

initDb();

const app = express();
app.disable('x-powered-by');
app.use(express.json({ limit: '20mb' }));

app.get('/api/health', (_req, res) => {
  res.json({ ok: true, time: new Date().toISOString() });
});

app.use('/api/applications', applicationsRouter);
app.use('/api/settings', settingsRouter);
app.use('/api/resumes', resumesRouter);
app.use('/api/backup', backupRouter);
app.use('/api/notify', notifyRouter);
app.use('/api/stats', statsRouter);
app.use('/api/scrape', scrapeRouter);

const aiLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: AI_RATE,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'AI 调用过于频繁，请稍后重试' }
});
app.use('/api/ai', aiLimiter, aiRouter);

app.use(express.static(projectRoot, {
  index: 'index.html',
  extensions: ['html']
}));

app.use((err, _req, res, _next) => {
  console.error('[server error]', err);
  if (res.headersSent) return;
  res.status(err.status || 500).json({ error: err.message || 'Internal Server Error' });
});

app.listen(PORT, HOST, () => {
  console.log(`JobTracker 已启动: http://${HOST}:${PORT}`);
  if (!process.env.DEEPSEEK_API_KEY && !process.env.QWEN_API_KEY) {
    console.warn('[warn] 未在 .env 配置 DEEPSEEK_API_KEY 或 QWEN_API_KEY，AI 功能将不可用');
  }
  startScheduler();
});
