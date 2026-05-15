// 智联招聘
import { pickTitle, pickMeta, splitTitle, findSalaryPart } from '../common.js';

export const id = 'zhaopin';
export const label = '智联招聘';
export const hostMatch = ['zhaopin.com'];

export function parse(html) {
  const title   = pickTitle(html);
  const ogTitle = pickMeta(html, 'property', 'og:title');
  const ogDesc  = pickMeta(html, 'property', 'og:description');
  const desc    = pickMeta(html, 'name', 'description');
  // 典型：「岗位-公司招聘-智联招聘」
  const parts = splitTitle(ogTitle || title, ['智联招聘', '智联']);
  const position = parts[0] || '';
  const salary = findSalaryPart(parts);
  const candidates = parts.slice(1).filter(p => p !== salary && p.length >= 2);
  candidates.sort((a, b) => b.length - a.length);
  const companyName = (candidates[0] || '').replace(/招聘$/, '');
  return { companyName, position, salary, location: '', jdRaw: ogDesc || desc || '' };
}
