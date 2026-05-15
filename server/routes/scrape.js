import { Router } from 'express';
import { scrapeJob, SUPPORTED_PLATFORMS } from '../services/scrapers/index.js';

const router = Router();

router.get('/platforms', (_req, res) => {
  res.json(SUPPORTED_PLATFORMS);
});

function withTimeout(ms = 15_000) {
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(new Error('抓取超时')), ms);
  return { signal: ctl.signal, clear: () => clearTimeout(timer) };
}

router.post('/job', async (req, res) => {
  const { url } = req.body || {};
  if (typeof url !== 'string' || !url.trim()) {
    return res.status(400).json({ error: 'url 字段必填' });
  }
  const t = withTimeout();
  try {
    const data = await scrapeJob(url.trim(), { signal: t.signal });
    res.json(data);
  } catch (e) {
    res.status(e.status || 500).json({ error: e.message || '抓取失败', detail: e.detail });
  } finally {
    t.clear();
  }
});

export default router;
