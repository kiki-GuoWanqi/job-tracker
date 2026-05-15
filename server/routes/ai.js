import { Router } from 'express';
import * as deepseek from '../services/ai-deepseek.js';
import * as qwen from '../services/ai-qwen.js';
import * as openai from '../services/ai-openai.js';
import * as anthropic from '../services/ai-anthropic.js';
import { resolveCallTarget, AI_PURPOSES, PROVIDER_KEYS, loadProviders, PROVIDER_DEFAULTS } from '../ai-config.js';

function buildTargetFromProvider(providerKey, isVision) {
  if (!PROVIDER_KEYS.includes(providerKey)) {
    const err = new Error(`未知 provider: ${providerKey}`);
    err.status = 400;
    throw err;
  }
  const cfg = loadProviders()[providerKey];
  if (!cfg?.apiKey) {
    const err = new Error(`${PROVIDER_DEFAULTS[providerKey].label} 未配置 API Key`);
    err.status = 400;
    throw err;
  }
  if (isVision && !PROVIDER_DEFAULTS[providerKey].supportsVision) {
    const err = new Error(`${PROVIDER_DEFAULTS[providerKey].label} 不支持视觉`);
    err.status = 400;
    throw err;
  }
  return {
    providerKey,
    apiKey: cfg.apiKey,
    baseUrl: cfg.baseUrl || PROVIDER_DEFAULTS[providerKey].baseUrl,
    model: isVision
      ? (cfg.visionModel || PROVIDER_DEFAULTS[providerKey].visionModel)
      : (cfg.textModel   || PROVIDER_DEFAULTS[providerKey].textModel),
    isVision
  };
}

const router = Router();

const PROVIDERS = { deepseek, qwen, openai, anthropic };

function timeoutMs() {
  const v = Number(process.env.AI_TIMEOUT_MS);
  return Number.isFinite(v) && v > 0 ? v : 90_000;
}

function withTimeout() {
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(new Error('AI 调用超时')), timeoutMs());
  return { signal: ctl.signal, clear: () => clearTimeout(timer) };
}

function isVisionPurpose(purpose) {
  const meta = AI_PURPOSES.find(p => p.key === purpose);
  return meta?.kind === 'vision';
}

async function callWithFallback(purpose, payload, kind, opts = {}) {
  // 主选 provider：若指定了 providerOverride 则直接走该 provider；否则按 routing 解析
  let target;
  try {
    target = opts.providerOverride
      ? buildTargetFromProvider(opts.providerOverride, kind === 'vision')
      : resolveCallTarget(purpose);
  } catch (e) {
    const err = new Error(e.message);
    err.status = e.status || 503;
    throw err;
  }

  const errors = [];
  const tried = new Set();

  // 主 provider
  const tryProvider = async (providerKey, cfg) => {
    const svc = PROVIDERS[providerKey];
    if (!svc) throw new Error(`unknown provider: ${providerKey}`);
    const fn = kind === 'vision' ? svc.callVision : svc.callText;
    const t = withTimeout();
    try {
      const content = await fn({
        apiKey: cfg.apiKey,
        baseUrl: cfg.baseUrl,
        model: cfg.model,
        ...payload,
        signal: t.signal
      });
      t.clear();
      return content;
    } catch (e) {
      t.clear();
      throw e;
    }
  };

  try {
    const content = await tryProvider(target.providerKey, target);
    return { content, provider: target.providerKey };
  } catch (e) {
    errors.push(`${target.providerKey}: ${e.message || e}`);
    tried.add(target.providerKey);
  }

  // noFallback：仅测试指定 provider，不降级
  if (opts.noFallback) {
    const err = new Error(`${target.providerKey} 调用失败：${errors[0]?.split(': ').slice(1).join(': ') || '未知错误'}`);
    err.detail = errors;
    err.status = 502;
    throw err;
  }

  // 降级：尝试其他有 Key 的 provider
  const providers = loadProviders();
  for (const pk of PROVIDER_KEYS) {
    if (tried.has(pk)) continue;
    const cfg = providers[pk];
    if (!cfg?.apiKey) continue;
    if (kind === 'vision' && !PROVIDER_DEFAULTS[pk].supportsVision) continue;
    try {
      const content = await tryProvider(pk, {
        apiKey: cfg.apiKey,
        baseUrl: cfg.baseUrl,
        model: kind === 'vision' ? cfg.visionModel : cfg.textModel
      });
      return { content, provider: pk, fallback: true };
    } catch (e) {
      errors.push(`${pk}(fallback): ${e.message || e}`);
    }
  }
  const err = new Error('AI 调用全部失败');
  err.detail = errors;
  err.status = 502;
  throw err;
}

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
