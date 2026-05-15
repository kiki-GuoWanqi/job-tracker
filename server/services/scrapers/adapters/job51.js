// 前程无忧 51job
import { pickTitle, pickMeta, splitTitle, findSalaryPart } from '../common.js';

export const id = 'job51';
export const label = '前程无忧';
export const hostMatch = ['51job.com', '51jobcdn.com'];

export function parse(html) {
  const title   = pickTitle(html);
  const ogTitle = pickMeta(html, 'property', 'og:title');
  const ogDesc  = pickMeta(html, 'property', 'og:description');
  const desc    = pickMeta(html, 'name', 'description');
  const parts = splitTitle(ogTitle || title, ['前程无忧', '51job']);
  const position = parts[0] || '';
  const salary = findSalaryPart(parts);
  const candidates = parts.slice(1).filter(p => p !== salary && p.length >= 2);
  candidates.sort((a, b) => b.length - a.length);
  const companyName = candidates[0] || '';
  return { companyName, position, salary, location: '', jdRaw: ogDesc || desc || '' };
}
