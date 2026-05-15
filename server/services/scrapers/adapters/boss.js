// Boss 直聘
import { pickTitle, pickMeta, splitTitle, findSalaryPart } from '../common.js';

export const id = 'boss';
export const label = 'Boss 直聘';
export const hostMatch = ['zhipin.com'];

export function parse(html) {
  const title    = pickTitle(html);
  const ogTitle  = pickMeta(html, 'property', 'og:title');
  const ogDesc   = pickMeta(html, 'property', 'og:description');
  const metaDesc = pickMeta(html, 'name', 'description');
  // 典型：「React前端工程师_某公司招聘信息_BOSS直聘」、「岗位 - 公司 - 25-40K - BOSS直聘」
  const parts = splitTitle(ogTitle || title, ['BOSS\\s*直聘', '直聘', '招聘信息']);
  const position = parts[0] || '';
  const salary = findSalaryPart(parts);
  const candidates = parts.slice(1).filter(p => p !== salary && p.length >= 2);
  candidates.sort((a, b) => b.length - a.length);
  const companyName = candidates[0] || '';
  return {
    companyName, position, salary, location: '',
    jdRaw: ogDesc || metaDesc || ''
  };
}
