// 猎聘
import { pickTitle, pickMeta, splitTitle, findSalaryPart } from '../common.js';

export const id = 'liepin';
export const label = '猎聘';
export const hostMatch = ['liepin.com'];

export function parse(html) {
  const title   = pickTitle(html);
  const ogTitle = pickMeta(html, 'property', 'og:title');
  const ogDesc  = pickMeta(html, 'property', 'og:description');
  const desc    = pickMeta(html, 'name', 'description');
  // 典型：「岗位招聘-公司-猎聘」、「岗位 - 25-40K - 北京 - 公司 - 猎聘」
  const parts = splitTitle(ogTitle || title, ['猎聘网', '猎聘', '招聘信息']);
  const position = parts[0] || '';
  const salary = findSalaryPart(parts);
  // 城市识别：单独的「北京/上海/...」短词
  const cityPat = /^(北京|上海|深圳|广州|杭州|成都|武汉|南京|苏州|西安|天津|重庆|长沙|郑州|青岛|大连|厦门|福州|合肥|沈阳|济南|宁波|无锡|佛山|东莞|嘉兴|长春|哈尔滨|石家庄|远程)$/;
  const location = parts.find(p => cityPat.test(p)) || '';
  const candidates = parts.slice(1).filter(p => p !== salary && p !== location && p.length >= 2);
  candidates.sort((a, b) => b.length - a.length);
  const companyName = candidates[0] || '';
  return { companyName, position, salary, location, jdRaw: ogDesc || desc || '' };
}
