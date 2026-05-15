// 通用 fallback：JSON-LD > og:* > <title> 拆分
import { pickTitle, pickMeta, splitTitle, findSalaryPart, pickJobPostingLd, cleanJdText } from '../common.js';

export const id = 'generic';
export const label = '通用网页';
export const hostMatch = [];   // 兜底，由 dispatcher 在没匹配到时直接选用

export function parse(html) {
  // 优先 JSON-LD（很多企业官网招聘页都有）
  const ld = pickJobPostingLd(html);
  if (ld) {
    return {
      companyName: ld.hiringOrganization?.name || '',
      position:    ld.title || '',
      salary:      ld.baseSalary?.value?.value
                     ? `${ld.baseSalary.value.value} ${ld.baseSalary.currency || ''}`.trim()
                     : '',
      location:    ld.jobLocation?.address?.addressLocality
                     || ld.jobLocation?.address?.addressRegion || '',
      jdRaw:       cleanJdText(ld.description || '')
    };
  }
  const title    = pickTitle(html);
  const ogTitle  = pickMeta(html, 'property', 'og:title');
  const ogDesc   = pickMeta(html, 'property', 'og:description');
  const metaDesc = pickMeta(html, 'name', 'description');
  const ogSite   = pickMeta(html, 'property', 'og:site_name');
  const parts = splitTitle(ogTitle || title, [ogSite ? ogSite.replace(/[.()]/g, '') : '___']);
  const position = parts[0] || '';
  const salary = findSalaryPart(parts);
  const candidates = parts.slice(1).filter(p => p !== salary && p.length >= 2);
  candidates.sort((a, b) => b.length - a.length);
  const companyName = candidates[0] || ogSite || '';
  return { companyName, position, salary, location: '', jdRaw: ogDesc || metaDesc || '' };
}
