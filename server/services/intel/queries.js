// 为 (company, position) + 维度 生成搜索 query
// 中文招聘语境下，多组变体提升召回；前缀公司名让 Tavily 优先匹配

const DIMENSIONS = ['written', 'interview', 'salary'];

export const ALL_DIMENSIONS = DIMENSIONS;

export function buildQueries({ company, position, dimensions = DIMENSIONS } = {}) {
  const c = (company || '').trim();
  if (!c) throw new Error('company 必填');
  const p = (position || '').trim();
  const dims = Array.isArray(dimensions) && dimensions.length
    ? dimensions.filter(d => DIMENSIONS.includes(d))
    : DIMENSIONS;

  const queries = [];
  const push = (dim, text) => queries.push({ dim, q: text });

  if (dims.includes('written')) {
    push('written', `${c} 笔试 题目`);
    push('written', `${c} OA 真题 ${p}`.trim());
  }
  if (dims.includes('interview')) {
    push('interview', `${c} ${p} 一面 面试`.replace(/\s+/g, ' ').trim());
    push('interview', `${c} 面经 二面 三面`);
    push('interview', `${c} ${p} HR 面试`.replace(/\s+/g, ' ').trim());
  }
  if (dims.includes('salary')) {
    push('salary', `${c} ${p} 薪资 待遇`.replace(/\s+/g, ' ').trim());
    push('salary', `${c} 工资 评价 看准`);
  }

  return queries;
}
