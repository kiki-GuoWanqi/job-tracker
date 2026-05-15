// 拉勾网
import { pickTitle, pickMeta, splitTitle, findSalaryPart, cleanJdText } from '../common.js';

export const id = 'lagou';
export const label = '拉勾网';
export const hostMatch = ['lagou.com'];

export function parse(html) {
  const title   = pickTitle(html);
  const ogTitle = pickMeta(html, 'property', 'og:title');
  const ogDesc  = pickMeta(html, 'property', 'og:description');
  const desc    = pickMeta(html, 'name', 'description');
  // 典型：「岗位 - 公司 - 拉勾网」、「岗位招聘-公司-拉勾网」
  const parts = splitTitle(ogTitle || title, ['拉勾网', '拉勾招聘', '拉勾']);
  const position = parts[0] || '';
  const salary = findSalaryPart(parts);
  const candidates = parts.slice(1).filter(p => p !== salary && p.length >= 2);
  candidates.sort((a, b) => b.length - a.length);
  const companyName = candidates[0] || '';
  // 拉勾静态页面通常带 job_bt 区块
  let jdRaw = '';
  const m = html.match(/<dd[^>]*class=["']job_bt["'][^>]*>([\s\S]*?)<\/dd>/i);
  if (m) jdRaw = cleanJdText(m[1]);
  if (!jdRaw) jdRaw = ogDesc || desc || '';
  return { companyName, position, salary, location: '', jdRaw };
}
