import { Router } from 'express';
import { getDb } from '../db.js';
import {
  PROVIDER_DEFAULTS,
  PROVIDER_KEYS,
  AI_PURPOSES,
  loadProviders,
  saveProviders,
  loadRouting,
  saveRouting,
  maskProvidersForFrontend
} from '../ai-config.js';

const router = Router();

const KEY_DEFAULT_RESUME = 'default_resume_id';
const KEY_CUSTOM_STATUSES = 'custom_statuses';

function readKv(db, key, fallback) {
  const row = db.prepare('SELECT value FROM settings WHERE key = ?').get(key);
  return row ? row.value : fallback;
}

function writeKv(db, key, value) {
  db.prepare(
    'INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value'
  ).run(key, value);
}

function buildResponse() {
  const db = getDb();
  const defaultResumeId = readKv(db, KEY_DEFAULT_RESUME, '');
  const customStatusesRaw = readKv(db, KEY_CUSTOM_STATUSES, '[]');
  let customStatuses = [];
  try { customStatuses = JSON.parse(customStatusesRaw); } catch { customStatuses = []; }

  const providers = loadProviders();
  const routing = loadRouting();

  // 提供给前端的元数据：每个 provider 的默认值、支持视觉、AI 功能列表
  const providerMeta = {};
  for (const pk of PROVIDER_KEYS) {
    const def = PROVIDER_DEFAULTS[pk];
    providerMeta[pk] = {
      key: pk,
      label: def.label,
      defaultBaseUrl: def.baseUrl,
      defaultTextModel: def.textModel,
      defaultVisionModel: def.visionModel,
      supportsVision: def.supportsVision,
      envName: def.keyEnv
    };
  }

  return {
    defaultResumeId,
    customStatuses: Array.isArray(customStatuses) ? customStatuses : [],
    aiProviders: maskProvidersForFrontend(providers),
    aiRouting: routing,
    aiProviderMeta: providerMeta,
    aiPurposes: AI_PURPOSES,
    // 兼容旧字段（前端仍可用作 hasAnyKey 判断）
    hasDeepseekKey: Boolean(providers.deepseek?.apiKey),
    hasQwenKey:     Boolean(providers.qwen?.apiKey),
    hasOpenaiKey:   Boolean(providers.openai?.apiKey),
    hasAnthropicKey: Boolean(providers.anthropic?.apiKey)
  };
}

router.get('/', (_req, res) => {
  res.json(buildResponse());
});

router.put('/', (req, res) => {
  const db = getDb();
  const { defaultResumeId, customStatuses, aiProviders, aiRouting } = req.body || {};

  db.prepare('BEGIN').run();
  try {
    if (typeof defaultResumeId === 'string') {
      writeKv(db, KEY_DEFAULT_RESUME, defaultResumeId);
    }
    if (Array.isArray(customStatuses)) {
      const filtered = customStatuses.filter(s => typeof s === 'string');
      writeKv(db, KEY_CUSTOM_STATUSES, JSON.stringify(filtered));
    }
    if (aiProviders && typeof aiProviders === 'object') {
      saveProviders(aiProviders);
    }
    if (aiRouting && typeof aiRouting === 'object') {
      saveRouting(aiRouting);
    }
    db.prepare('COMMIT').run();
  } catch (e) {
    db.prepare('ROLLBACK').run();
    throw e;
  }

  res.json(buildResponse());
});

export default router;
