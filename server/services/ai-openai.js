// OpenAI（GPT 系列，chat/completions）

export async function callText({ apiKey, baseUrl, model, system, user, signal }) {
  if (!apiKey) throw new Error('OpenAI API Key 未配置');
  const url = (baseUrl || 'https://api.openai.com/v1').replace(/\/+$/, '') + '/chat/completions';
  const messages = [];
  if (system) messages.push({ role: 'system', content: system });
  messages.push({ role: 'user', content: user || '' });
  const resp = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({ model: model || 'gpt-4o-mini', messages }),
    signal
  });
  if (!resp.ok) {
    const text = await resp.text().catch(() => '');
    throw new Error(`OpenAI ${resp.status}: ${text.slice(0, 300)}`);
  }
  const data = await resp.json();
  const content = data?.choices?.[0]?.message?.content;
  if (typeof content !== 'string') throw new Error('OpenAI 返回格式异常');
  return content;
}

export async function callVision({ apiKey, baseUrl, model, prompt, base64, mimeType = 'image/png', signal }) {
  if (!apiKey) throw new Error('OpenAI API Key 未配置');
  const url = (baseUrl || 'https://api.openai.com/v1').replace(/\/+$/, '') + '/chat/completions';
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
    body: JSON.stringify({ model: model || 'gpt-4o-mini', messages }),
    signal
  });
  if (!resp.ok) {
    const text = await resp.text().catch(() => '');
    throw new Error(`OpenAI vision ${resp.status}: ${text.slice(0, 300)}`);
  }
  const data = await resp.json();
  const content = data?.choices?.[0]?.message?.content;
  if (typeof content !== 'string') throw new Error('OpenAI vision 返回格式异常');
  return content;
}
