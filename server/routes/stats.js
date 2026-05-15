// 投递统计聚合查询。所有计算尽量在 SQL 里做，不要把全量 applications 拉到内存
import { Router } from 'express';
import { getDb } from '../db.js';

const router = Router();

// 状态分组：把任意状态映射到漏斗的 5 个分组
// 自定义状态默认归为「初筛中」，避免淹没在「其他」
const STATUS_GROUPS = [
  { key: 'submitted',  label: '已投递',   statuses: ['待投递', '已投递待回复'] },
  { key: 'screening',  label: '初筛/笔试', statuses: ['待笔试', '笔试完待通知'] },
  { key: 'interview',  label: '面试中',   statuses: ['面试中'] },
  { key: 'offer',      label: 'Offer',    statuses: ['已 Offer'] },
  { key: 'rejected',   label: '已拒',     statuses: ['已挂'] }
];

function groupOfStatus(status) {
  if (!status) return 'submitted';
  for (const g of STATUS_GROUPS) {
    if (g.statuses.includes(status)) return g.key;
  }
  return 'submitted';   // 自定义状态归到「已投递」桶
}

router.get('/overview', (_req, res) => {
  const db = getDb();

  // 漏斗：按状态分组计数
  const statusRows = db.prepare(
    'SELECT status, COUNT(*) AS n FROM applications GROUP BY status'
  ).all();
  const funnelCounts = Object.fromEntries(STATUS_GROUPS.map(g => [g.key, 0]));
  let totalApps = 0;
  for (const r of statusRows) {
    const g = groupOfStatus(r.status);
    funnelCounts[g] = (funnelCounts[g] || 0) + r.n;
    totalApps += r.n;
  }
  const funnel = STATUS_GROUPS.map(g => ({
    key: g.key,
    label: g.label,
    count: funnelCounts[g.key]
  }));

  // 月度投递趋势：按 application_date 的 YYYY-MM 计数
  // 含最近 6 个月（含本月），缺失月份补 0
  const monthRows = db.prepare(
    `SELECT substr(application_date, 1, 7) AS ym, COUNT(*) AS n
     FROM applications
     WHERE application_date IS NOT NULL AND application_date != ''
     GROUP BY ym
     ORDER BY ym`
  ).all();
  const monthMap = new Map(monthRows.map(r => [r.ym, r.n]));
  const trend = [];
  const now = new Date();
  for (let i = 5; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const ym = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    trend.push({ ym, count: monthMap.get(ym) || 0 });
  }

  // Top 公司响应率：投递 ≥ 2 家的公司，响应率 = 进入面试或后续阶段的投递数 / 总投递数
  // 「响应」定义为状态不在 ['待投递', '已投递待回复'] 中
  const companyRows = db.prepare(
    `SELECT company_name, status FROM applications WHERE company_name != ''`
  ).all();
  const byCompany = new Map();
  for (const r of companyRows) {
    if (!byCompany.has(r.company_name)) {
      byCompany.set(r.company_name, { total: 0, responded: 0 });
    }
    const c = byCompany.get(r.company_name);
    c.total += 1;
    if (r.status && !['待投递', '已投递待回复'].includes(r.status)) c.responded += 1;
  }
  const topCompanies = Array.from(byCompany.entries())
    .filter(([, c]) => c.total >= 2)
    .map(([name, c]) => ({
      company: name,
      total: c.total,
      responded: c.responded,
      rate: Math.round((c.responded / c.total) * 100)
    }))
    .sort((a, b) => b.total - a.total || b.rate - a.rate)
    .slice(0, 10);

  // 平均状态停留时长：基于 status_history，相邻两条记录间隔的中位/平均
  // 只算「投递→首次响应」和「响应→Offer/拒」两个关键间隔
  const histRows = db.prepare(
    'SELECT application_id, status, changed_at FROM status_history ORDER BY application_id, id'
  ).all();
  const histByApp = new Map();
  for (const h of histRows) {
    if (!histByApp.has(h.application_id)) histByApp.set(h.application_id, []);
    histByApp.get(h.application_id).push(h);
  }
  const submitToResponse = [];   // 投递 → 任何「响应」状态
  const responseToFinal = [];    // 响应 → Offer/已挂
  for (const list of histByApp.values()) {
    if (list.length < 2) continue;
    const submit = list.find(h => ['待投递', '已投递待回复'].includes(h.status));
    const firstResponse = list.find(h => h.status && !['待投递', '已投递待回复'].includes(h.status));
    const final = list.find(h => ['已 Offer', '已挂'].includes(h.status));
    if (submit && firstResponse) {
      const days = (new Date(firstResponse.changed_at) - new Date(submit.changed_at)) / (24 * 3600 * 1000);
      if (days >= 0 && days < 365) submitToResponse.push(days);
    }
    if (firstResponse && final && firstResponse !== final) {
      const days = (new Date(final.changed_at) - new Date(firstResponse.changed_at)) / (24 * 3600 * 1000);
      if (days >= 0 && days < 365) responseToFinal.push(days);
    }
  }
  const avg = arr => arr.length ? Math.round((arr.reduce((s, x) => s + x, 0) / arr.length) * 10) / 10 : null;
  const timing = {
    submitToResponse: { count: submitToResponse.length, avgDays: avg(submitToResponse) },
    responseToFinal:  { count: responseToFinal.length,  avgDays: avg(responseToFinal) }
  };

  // 概览指标
  const overview = {
    totalApps,
    activePipeline: funnelCounts.screening + funnelCounts.interview,
    offerCount: funnelCounts.offer,
    rejectedCount: funnelCounts.rejected,
    overallResponseRate: totalApps
      ? Math.round(((totalApps - funnelCounts.submitted) / totalApps) * 100)
      : 0,
    offerRate: totalApps
      ? Math.round((funnelCounts.offer / totalApps) * 100)
      : 0
  };

  res.json({ overview, funnel, trend, topCompanies, timing });
});

export default router;
