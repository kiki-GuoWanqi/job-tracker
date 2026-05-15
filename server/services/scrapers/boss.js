// Boss 直聘 + 通用 fallback 抓取器
// 注意：Boss 是 SPA，服务端直接 fetch 大概率拿不到完整 JD（页面靠 JS 拉接口渲染）。
// 我们做最大努力：解析 <title> 和 <meta og:*> / <meta description>，给出可填的字段；
// 拿不到时清晰报错，引导用户切到截图 OCR 流程。

const UA_DESKTOP = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';

function pickAttr(html, attrName, attrValue) {
  // 提取形如 <meta {attrName}="{attrValue}" content="...">
  const re = new RegExp(
    `<meta[^>]*\\b${attrName}=["']${attrValue}["'][^>]*\\bcontent=["']([^"']+)["']`,
    'i'
  );
  const m = html.match(re);
  if (m) return m[1].trim();
  // 也试一下 content 在前的写法
  const re2 = new RegExp(
    `<meta[^>]*\\bcontent=["']([^"']+)["'][^>]*\\b${attrName}=["']${attrValue}["']`,
    'i'
  );
  const m2 = html.match(re2);
  return m2 ? m2[1].trim() : '';
}

function pickTitle(html) {
  const m = html.match(/<title>([\s\S]*?)<\/title>/i);
  return m ? m[1].replace(/\s+/g, ' ').trim() : '';
}

// 尝试从 Boss / 通用标题中拆出公司 / 岗位
// 常见格式：
//   "React前端工程师_某某公司招聘信息_BOSS直聘"
//   "Java工程师 - 字节跳动 - 25-40K - BOSS直聘"
//   "高级前端 | 阿里巴巴 - 直聘"
function parseBossTitle(title) {
  if (!title) return { position: '', companyName: '', salary: '' };
  // 去掉品牌后缀
  const cleaned = title
    .replace(/[-_|·\s]*BOSS\s*直聘.*$/i, '')
    .replace(/[-_|·\s]*直聘.*$/i, '')
    .replace(/[-_|·\s]*招聘信息.*$/i, '')
    .trim();
  // 按常见分隔符切
  const parts = cleaned.split(/\s*[-_|·]+\s*|\s+/).map(s => s.trim()).filter(Boolean);
  let position = '', companyName = '', salary = '';
  // 第一段一般是岗位
  if (parts.length) position = parts[0];
  // 找薪资段（含 K 或 万 的数字范围）
  const salaryIdx = parts.findIndex(p => /\d+\s*[-~]\s*\d+\s*[Kk万]/.test(p) || /^\d+\s*[Kk万]/.test(p));
  if (salaryIdx >= 0) {
    salary = parts[salaryIdx];
  }
  // 公司名：取最长的非位置/薪资段
  const candidates = parts.slice(1).filter((p, i) => (i + 1) !== salaryIdx && p.length >= 2);
  if (candidates.length) {
    candidates.sort((a, b) => b.length - a.length);
    companyName = candidates[0];
  }
  return { position, companyName, salary };
}

export async function scrapeJob(url, { signal } = {}) {
  let parsed;
  try { parsed = new URL(url); } catch {
    const e = new Error('URL 格式不正确');
    e.status = 400;
    throw e;
  }
  if (!/^https?:$/.test(parsed.protocol)) {
    const e = new Error('仅支持 http / https 链接');
    e.status = 400;
    throw e;
  }

  const isBoss = /zhipin\.com$/i.test(parsed.hostname) || /^([\w-]+\.)?zhipin\.com$/i.test(parsed.hostname);

  let html;
  try {
    const resp = await fetch(url, {
      headers: {
        'User-Agent': UA_DESKTOP,
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8',
        'Referer': parsed.origin
      },
      signal,
      redirect: 'follow'
    });
    if (!resp.ok) {
      const e = new Error(`抓取失败：HTTP ${resp.status}`);
      e.status = 502;
      throw e;
    }
    html = await resp.text();
  } catch (e) {
    if (e.status) throw e;
    const err = new Error(`网络错误：${e.message || e}`);
    err.status = 502;
    throw err;
  }

  // 解析
  const title       = pickTitle(html);
  const ogTitle     = pickAttr(html, 'property', 'og:title');
  const ogDesc      = pickAttr(html, 'property', 'og:description');
  const metaDesc    = pickAttr(html, 'name', 'description');
  const description = ogDesc || metaDesc || '';

  // 尝试从 Boss 标题/og:title 解析
  const titleForParse = ogTitle || title;
  const fromTitle = parseBossTitle(titleForParse);

  // Boss 反爬：常见返回是一个不含真实数据的壳页面。判定方法：title 含「访问异常」「安全验证」或 body 太短
  const looksBlocked = /访问异常|安全验证|安全检查|滑块验证|请稍后再试|verify/i.test(html.slice(0, 2000))
    || (isBoss && html.length < 8000 && !fromTitle.companyName && !description);

  const result = {
    source: isBoss ? 'boss' : 'generic',
    url,
    title,
    companyName: fromTitle.companyName,
    position: fromTitle.position,
    salary: fromTitle.salary,
    location: '',
    jdRaw: description,    // 仅 meta 描述，通常不够完整
    blocked: looksBlocked,
    note: looksBlocked
      ? '页面被反爬拦截或为空壳，建议改用「JD 截图导入」（粘贴图片到表单也行）。'
      : (description ? '' : 'meta 描述为空，正文未抓到。Boss 真实 JD 需登录态/JS 渲染，建议改用「JD 截图导入」补全。')
  };

  // 整体没拿到任何有用信息时报错
  if (!result.companyName && !result.position && !result.jdRaw) {
    const e = new Error(result.note || '未抓到任何字段');
    e.status = 422;
    e.detail = { source: result.source, title, blocked: result.blocked };
    throw e;
  }

  return result;
}
