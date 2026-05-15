// 企业微信群机器人：markdown 消息
// 文档：https://developer.work.weixin.qq.com/document/path/91770

function renderMarkdown(event, payload) {
  const { title = '', summary = '', items = [] } = payload || {};
  const lines = [];
  if (title) lines.push(`### ${title}`);
  if (summary) lines.push(summary);
  if (Array.isArray(items) && items.length) {
    lines.push('');
    for (const it of items) {
      lines.push(`- ${it}`);
    }
  }
  lines.push('');
  lines.push(`<font color="comment">事件：${event} · ${new Date().toLocaleString('zh-CN', { hour12: false })}</font>`);
  return lines.join('\n');
}

export async function send({ webhookUrl, event, payload, signal }) {
  const content = renderMarkdown(event, payload);
  const resp = await fetch(webhookUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ msgtype: 'markdown', markdown: { content } }),
    signal
  });
  if (!resp.ok) {
    const text = await resp.text().catch(() => '');
    throw new Error(`WeChat ${resp.status}: ${text.slice(0, 200)}`);
  }
  // 企微 200 也可能业务失败
  const data = await resp.json().catch(() => ({}));
  if (data.errcode && data.errcode !== 0) {
    throw new Error(`WeChat errcode ${data.errcode}: ${data.errmsg || ''}`);
  }
  return { ok: true };
}
