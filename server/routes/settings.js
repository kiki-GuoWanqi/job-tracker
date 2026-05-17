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
import {
  loadNotifySettings,
  saveNotifySettings,
  maskWebhookForFrontend,
  NOTIFY_EVENTS,
  NOTIFY_CHANNELS
} from '../services/notifier.js';
import { saveTavilyKey, maskTavilyForFrontend } from '../services/tavily-key.js';

const router = Router();

const KEY_DEFAULT_RESUME = 'default_resume_id';
const KEY_CUSTOM_STATUSES = 'custom_statuses';
const KEY_JOB_PREFERENCES = 'job_preferences';

const DEFAULT_JOB_PREFERENCES = {
  targetPositions: [],   // string[]
  targetCities: [],      // string[]
  salaryMin: null,       // 数字，单位 K/月，null 表示未设
  salaryMax: null,
  companyTypes: [],      // string[]：大厂 / 外企 / 国企 / 央企 / 创业公司 / 独角兽 / 上市公司 / 不限
  urgency: ''            // '观望中' | '正在找' | '紧急'
};

function normalizePreferences(input) {
  const v = input && typeof input === 'object' ? input : {};
  const sanitizeArr = a => (Array.isArray(a) ? a.filter(x => typeof x === 'string' && x.trim()).map(x => x.trim()) : []);
  const sanitizeNum = n => (typeof n === 'number' && Number.isFinite(n) && n >= 0 ? Math.round(n) : null);
  return {
    targetPositions: sanitizeArr(v.targetPositions),
    targetCities:    sanitizeArr(v.targetCities),
    salaryMin:       sanitizeNum(v.salaryMin),
    salaryMax:       sanitizeNum(v.salaryMax),
    companyTypes:    sanitizeArr(v.companyTypes),
    urgency:         typeof v.urgency === 'string' ? v.urgency.trim() : ''
  };
}

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

  const jobPrefRaw = readKv(db, KEY_JOB_PREFERENCES, null);
  let jobPreferences = { ...DEFAULT_JOB_PREFERENCES };
  if (jobPrefRaw) {
    try { jobPreferences = normalizePreferences(JSON.parse(jobPrefRaw)); } catch { /* keep default */ }
  }

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

  const notify = loadNotifySettings();

  return {
    defaultResumeId,
    customStatuses: Array.isArray(customStatuses) ? customStatuses : [],
    jobPreferences,
    notifySettings: maskWebhookForFrontend(notify),
    notifyEvents: NOTIFY_EVENTS,
    notifyChannels: NOTIFY_CHANNELS,
    aiProviders: maskProvidersForFrontend(providers),
    aiRouting: routing,
    aiProviderMeta: providerMeta,
    aiPurposes: AI_PURPOSES,
    tavily: maskTavilyForFrontend(),
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
  const { defaultResumeId, customStatuses, jobPreferences, notifySettings, aiProviders, aiRouting, tavily } = req.body || {};

  db.prepare('BEGIN').run();
  try {
    if (typeof defaultResumeId === 'string') {
      writeKv(db, KEY_DEFAULT_RESUME, defaultResumeId);
    }
    if (Array.isArray(customStatuses)) {
      const filtered = customStatuses.filter(s => typeof s === 'string');
      writeKv(db, KEY_CUSTOM_STATUSES, JSON.stringify(filtered));
    }
    if (jobPreferences && typeof jobPreferences === 'object') {
      writeKv(db, KEY_JOB_PREFERENCES, JSON.stringify(normalizePreferences(jobPreferences)));
    }
    if (notifySettings && typeof notifySettings === 'object') {
      saveNotifySettings(notifySettings);
    }
    if (aiProviders && typeof aiProviders === 'object') {
      saveProviders(aiProviders);
    }
    if (aiRouting && typeof aiRouting === 'object') {
      saveRouting(aiRouting);
    }
    if (tavily && typeof tavily === 'object' && typeof tavily.apiKey === 'string') {
      // 空串视为清除，与 ai provider 行为一致
      saveTavilyKey(tavily.apiKey);
    }
    db.prepare('COMMIT').run();
  } catch (e) {
    db.prepare('ROLLBACK').run();
    throw e;
  }

  res.json(buildResponse());
});

export default router;
