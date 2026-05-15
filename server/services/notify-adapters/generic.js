// 通用 Webhook：直接 POST JSON payload
export async function send({ webhookUrl, event, payload, signal }) {
  const body = JSON.stringify({
    event,
    timestamp: new Date().toISOString(),
    ...payload
  });
  const resp = await fetch(webhookUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body,
    signal
  });
  if (!resp.ok) {
    const text = await resp.text().catch(() => '');
    throw new Error(`Webhook ${resp.status}: ${text.slice(0, 200)}`);
  }
  return { ok: true };
}
