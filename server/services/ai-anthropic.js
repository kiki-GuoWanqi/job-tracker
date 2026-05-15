// Anthropic Claude（messages API，与 OpenAI 不同的协议）

function textFromBlocks(blocks) {
  if (!Array.isArray(blocks)) return '';
  return blocks
    .filter(b => b?.type === 'text' && typeof b.text === 'string')
    .map(b => b.text)
    .join('\n')
    .trim();
}

export async function callText({ apiKey, baseUrl, model, system, user, signal }) {
  if (!apiKey) throw new Error('Anthropic API Key 未配置');
  const url = (baseUrl || 'https://api.anthropic.com/v1').replace(/\/+$/, '') + '/messages';
  const body = {
    model: model || 'claude-sonnet-4-6',
    max_tokens: 4096,
    messages: [{ role: 'user', content: user || '' }]
  };
  if (system) body.system = system;

  const resp = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01'
    },
    body: JSON.stringify(body),
    signal
  });
  if (!resp.ok) {
    const text = await resp.text().catch(() => '');
    throw new Error(`Anthropic ${resp.status}: ${text.slice(0, 300)}`);
  }
  const data = await resp.json();
  const content = textFromBlocks(data?.content);
  if (!content) throw new Error('Anthropic 返回内容为空');
  return content;
}

export async function callVision({ apiKey, baseUrl, model, prompt, base64, mimeType = 'image/png', signal }) {
  if (!apiKey) throw new Error('Anthropic API Key 未配置');
  const url = (baseUrl || 'https://api.anthropic.com/v1').replace(/\/+$/, '') + '/messages';
  const body = {
    model: model || 'claude-sonnet-4-6',
    max_tokens: 4096,
    messages: [{
      role: 'user',
      content: [
        { type: 'image', source: { type: 'base64', media_type: mimeType, data: base64 } },
        { type: 'text', text: prompt || '请识别图片中的文字内容，按原结构输出。' }
      ]
    }]
  };
  const resp = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01'
    },
    body: JSON.stringify(body),
    signal
  });
  if (!resp.ok) {
    const text = await resp.text().catch(() => '');
    throw new Error(`Anthropic vision ${resp.status}: ${text.slice(0, 300)}`);
  }
  const data = await resp.json();
  const content = textFromBlocks(data?.content);
  if (!content) throw new Error('Anthropic vision 返回内容为空');
  return content;
}
