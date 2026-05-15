// 平台无关的小工具：meta 提取、JSON-LD 查找、标题拆分

export function pickMeta(html, attrName, attrValue) {
  const re = new RegExp(
    `<meta[^>]*\\b${attrName}=["']${attrValue}["'][^>]*\\bcontent=["']([^"']+)["']`,
    'i'
  );
  const m = html.match(re);
  if (m) return m[1].trim();
  const re2 = new RegExp(
    `<meta[^>]*\\bcontent=["']([^"']+)["'][^>]*\\b${attrName}=["']${attrValue}["']`,
    'i'
  );
  const m2 = html.match(re2);
  return m2 ? m2[1].trim() : '';
}

export function pickTitle(html) {
  const m = html.match(/<title>([\s\S]*?)<\/title>/i);
  return m ? m[1].replace(/\s+/g, ' ').trim() : '';
}

// 提取所有 <script type="application/ld+json"> 块，找出 JobPosting schema
export function pickJobPostingLd(html) {
  const blocks = Array.from(html.matchAll(/<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi));
  for (const m of blocks) {
    try {
      const raw = m[1].trim();
      const data = JSON.parse(raw);
      const found = findJobPosting(data);
      if (found) return found;
    } catch { /* skip malformed */ }
  }
  return null;
}

function findJobPosting(node) {
  if (!node || typeof node !== 'object') return null;
  if (Array.isArray(node)) {
    for (const it of node) {
      const r = findJobPosting(it);
      if (r) return r;
    }
    return null;
  }
  const t = node['@type'];
  if (t === 'JobPosting' || (Array.isArray(t) && t.includes('JobPosting'))) return node;
  if (node['@graph']) return findJobPosting(node['@graph']);
  return null;
}

// 用一组分隔符把标题切碎，去掉品牌后缀
export function splitTitle(title, brandSuffixes = []) {
  if (!title) return [];
  let cleaned = title;
  for (const sfx of brandSuffixes) {
    cleaned = cleaned.replace(new RegExp(`[-_|·\\s]*${sfx}.*$`, 'i'), '');
  }
  return cleaned.split(/\s*[-_|·]+\s*|\s+/).map(s => s.trim()).filter(Boolean);
}

// 通用：从分段中识别薪资段（如 25-40K / 12K-25K · 14薪 / 6千-1万）
export function findSalaryPart(parts) {
  return parts.find(p =>
    /\d+\s*[-~–至]\s*\d+\s*[Kk万千]/.test(p) ||
    /^\d+\s*[Kk万千]/.test(p) ||
    /薪资/.test(p)
  ) || '';
}

// 把 jd 文本里 HTML entities 解码 + 折叠多余空白
export function cleanJdText(s) {
  if (!s) return '';
  return String(s)
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

// 反爬 / 空壳页面检测
export function looksBlocked(html, isShortAcceptable = false) {
  const head = html.slice(0, 3000);
  if (/访问异常|安全验证|安全检查|滑块验证|请稍后再试|verify|cloudflare|当前访问异常/i.test(head)) return true;
  if (!isShortAcceptable && html.length < 4000) return true;
  return false;
}
