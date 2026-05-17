import { Router } from 'express';
import { searchIntel } from '../services/intel/index.js';
import { ALL_DIMENSIONS } from '../services/intel/queries.js';

const router = Router();

router.get('/dimensions', (_req, res) => {
  res.json({ dimensions: ALL_DIMENSIONS });
});

router.post('/search', async (req, res) => {
  const { applicationId, dimensions } = req.body || {};
  if (typeof applicationId !== 'string' || !applicationId.trim()) {
    return res.status(400).json({ error: 'applicationId 必填' });
  }
  try {
    const result = await searchIntel({
      applicationId: applicationId.trim(),
      dimensions: Array.isArray(dimensions) ? dimensions : undefined
    });
    if (process.env.AI_LOG) {
      console.log(`[intel/search] app=${applicationId} sources=${result.queryStats.totalSources}`);
    }
    res.json({ ok: true, intel: result.intel, queryStats: result.queryStats });
  } catch (e) {
    res.status(e.status || 500).json({ error: e.message || '岗位情报搜索失败', detail: e.detail });
  }
});

export default router;
