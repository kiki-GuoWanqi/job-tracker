import { Router } from 'express';
import { callWithFallback, isVisionPurpose } from '../services/ai-router.js';

const router = Router();

router.post('/text', async (req, res) => {
  const { system, user, purpose = 'connection_test', provider, noFallback } = req.body || {};
  if (typeof user !== 'string' || !user) {
    return res.status(400).json({ error: 'user 字段必填' });
  }
  const kind = isVisionPurpose(purpose) ? 'vision' : 'text';
  try {
    const result = await callWithFallback(purpose, { system, user }, kind, {
      providerOverride: provider,
      noFallback: Boolean(noFallback)
    });
    if (process.env.AI_LOG) {
      console.log(`[ai/text] purpose=${purpose} provider=${result.provider}${result.fallback ? ' (fallback)' : ''} len=${result.content.length}`);
    }
    res.json(result);
  } catch (e) {
    res.status(e.status || 500).json({ error: e.message, detail: e.detail });
  }
});

router.post('/vision', async (req, res) => {
  const { prompt, base64, mimeType, purpose = 'jd_ocr', provider, noFallback } = req.body || {};
  if (typeof base64 !== 'string' || !base64) {
    return res.status(400).json({ error: 'base64 字段必填' });
  }
  try {
    const result = await callWithFallback(purpose, { prompt, base64, mimeType }, 'vision', {
      providerOverride: provider,
      noFallback: Boolean(noFallback)
    });
    if (process.env.AI_LOG) {
      console.log(`[ai/vision] purpose=${purpose} provider=${result.provider}${result.fallback ? ' (fallback)' : ''} len=${result.content.length}`);
    }
    res.json(result);
  } catch (e) {
    res.status(e.status || 500).json({ error: e.message, detail: e.detail });
  }
});

export default router;
