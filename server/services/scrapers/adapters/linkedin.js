// LinkedIn（海外）
import { pickTitle, pickMeta, splitTitle, pickJobPostingLd, cleanJdText } from '../common.js';

export const id = 'linkedin';
export const label = 'LinkedIn';
export const hostMatch = ['linkedin.com'];

export function parse(html) {
  // LinkedIn 大概率注入 JSON-LD JobPosting schema
  const ld = pickJobPostingLd(html);
  if (ld) {
    return {
      companyName: ld.hiringOrganization?.name || '',
      position:    ld.title || '',
      salary:      ld.baseSalary?.value?.value
                     ? `${ld.baseSalary.value.value} ${ld.baseSalary.currency || ''}`.trim()
                     : '',
      location:    ld.jobLocation?.address?.addressLocality || '',
      jdRaw:       cleanJdText(ld.description || '')
    };
  }
  const title    = pickTitle(html);
  const ogTitle  = pickMeta(html, 'property', 'og:title');
  const ogDesc   = pickMeta(html, 'property', 'og:description');
  const metaDesc = pickMeta(html, 'name', 'description');
  // 典型：「{Company} hiring {Position} in {Location} | LinkedIn」
  const t = ogTitle || title || '';
  let companyName = '', position = '', location = '';
  const m = t.match(/^(.+?)\s+hiring\s+(.+?)\s+in\s+(.+?)\s*\|\s*LinkedIn/i);
  if (m) {
    companyName = m[1].trim();
    position    = m[2].trim();
    location    = m[3].trim();
  } else {
    const parts = splitTitle(t, ['LinkedIn']);
    position = parts[0] || '';
    companyName = parts[1] || '';
  }
  return { companyName, position, salary: '', location, jdRaw: ogDesc || metaDesc || '' };
}
