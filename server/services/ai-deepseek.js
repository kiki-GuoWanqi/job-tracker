// DeepSeek（OpenAI 兼容协议）

export async function callText({ apiKey, baseUrl, model, system, user, signal }) {
  if (!apiKey) throw new Error('DeepSeek API Key 未配置');
  const url = (baseUrl || 'https://api.deepseek.com/v1').replace(/\/+$/, '') + '/chat/completions';
  const messages = [];
  if (system) messages.push({ role: 'system', content: system });
  messages.push({ role: 'user', content: user || '' });

  const resp = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({ model: model || 'deepseek-chat', messages, temperature: 0.3 }),
    signal
  });
  if (!resp.ok) {
    const text = await resp.text().catch(() => '');
    throw new Error(`DeepSeek ${resp.status}: ${text.slice(0, 300)}`);
  }
  const data = await resp.json();
  const content = data?.choices?.[0]?.message?.content;
  if (typeof content !== 'string') throw new Error('DeepSeek 返回格式异常');
  return content;
}

export async function callVision({ apiKey, baseUrl, model, prompt, base64, mimeType = 'image/png', signal }) {
  if (!apiKey) throw new Error('DeepSeek API Key 未配置');
  const url = (baseUrl || 'https://api.deepseek.com/v1').replace(/\/+$/, '') + '/chat/completions';
  const messages = [{
    role: 'user',
    content: [
      { type: 'text', text: prompt || '请识别图片中的文字内容，按原结构输出。' },
      { type: 'image_url', image_url: { url: `data:${mimeType};base64,${base64}` } }
    ]
  }];
  const resp = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({ model: model || 'deepseek-chat', messages, temperature: 0.2 }),
    signal
  });
  if (!resp.ok) {
    const text = await resp.text().catch(() => '');
    throw new Error(`DeepSeek vision ${resp.status}: ${text.slice(0, 300)}`);
  }
  const data = await resp.json();
  const content = data?.choices?.[0]?.message?.content;
  if (typeof content !== 'string') throw new Error('DeepSeek vision 返回格式异常');
  return content;
}
