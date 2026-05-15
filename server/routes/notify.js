import { Router } from 'express';
import { notifyTest } from '../services/notifier.js';
import { triggerDailyDigestNow } from '../scheduler.js';

const router = Router();

router.post('/test', async (_req, res) => {
  try {
    await notifyTest();
    res.json({ ok: true });
  } catch (e) {
    res.status(e.status || 400).json({ error: e.message || '通知失败' });
  }
});

// debug：手动触发每日摘要（绕过窗口和 dedup），便于本地验证
router.post('/trigger-daily', async (_req, res) => {
  try {
    const r = await triggerDailyDigestNow();
    res.json(r);
  } catch (e) {
    res.status(500).json({ error: e.message || '触发失败' });
  }
});

export default router;
