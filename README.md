# JobTracker v2 — AI 驱动的求职全流程管理工具

> 前后端架构版本，数据持久化到本地 SQLite，AI Key 仅后端持有，单命令一键启动。

**本地部署 · 隐私优先 · AI 全程辅助**

---

## 一、产品定位

应届生同期投递 30–80 家公司，求职信息分散在邮件、聊天记录和多个招聘平台。JobTracker 将整个求职链路整合到一个工作台，并在每个信息密集节点（读 JD、简历匹配、面试准备、Offer 比较）提供 AI 决策支持。

v2 相比纯前端版（v1）的核心升级：

| 维度 | v1（纯前端） | v2（前后端） |
|------|------------|------------|
| 数据存储 | localStorage（~5MB 上限） | SQLite WAL，无大小限制 |
| AI Provider | DeepSeek / 千问 × 2 | DeepSeek / 千问 / OpenAI / Anthropic × 4 |
| AI 路由 | 全局共用一个 Key | 11 个功能独立路由到不同 Provider |
| Key 安全 | 存浏览器 localStorage | 仅后端 .env / SQLite，前端只见脱敏 preview |
| 新增 AI 功能 | — | 全网岗位情报（Tavily + LLM）、招呼语、求职信 |
| JD 来源 | 手动粘贴 / 截图 | 新增 Boss直聘 URL 一键抓取 |
| 通知 | 无 | Webhook + 企业微信群机器人 + 每日摘要调度 |

---

## 二、快速开始

**环境要求**：Node.js ≥ 22.5（使用 `node:sqlite` 内置模块，无需编译原生依赖）

```bash
# 1. 安装依赖（express / dotenv / express-rate-limit，约 70 个包）
npm install

# 2. （可选）配置 API Key
cp .env.example .env
# 编辑 .env，填入 DEEPSEEK_API_KEY 等任一 Key

# 3. 启动
npm start
# → JobTracker 已启动: http://127.0.0.1:3000
```

打开 `http://127.0.0.1:3000`，无需注册。若有 v1 的 localStorage 数据，首次加载时会弹出一键迁移弹窗。

AI Key 也可在运行后前往「设置 → 模型配置」页面直接填写，不必重启服务。

---

## 三、功能全览

### 3.1 投递管理核心

| 功能 | 说明 |
|------|------|
| 投递看板 | 状态机（待投递→已投递→笔试→面试→Offer/已挂），卡片内直接切换 |
| 状态时间轴 | 每次状态变更自动记录时间戳，全程可追溯 |
| 日历视图 | 笔试日、面试日、Offer 截止日三类事件月历聚合，防止漏场 |
| 来源渠道记录 | 官网/内推/Boss直聘/公众号/实习僧/其他，统计各渠道进面率 |
| 排序 | 自定义拖拽排序，`display_order` 字段 SQLite 持久化 |
| 归档复盘 | 已挂投递归档保留，支持写复盘笔记，漏斗分析失败关卡 |

### 3.2 AI 功能矩阵（核心差异化）

| AI 功能 | Purpose Key | 输入 | 输出 |
|---------|------------|------|------|
| JD 格式化 | `jd_format` | JD 原文 | 结构化 Markdown（职责/要求/加分项）|
| JD OCR 截图识别 | `jd_ocr` | 图片 base64 | 提取文本 |
| JD 结构提取 | `jd_extract` | Boss抓取原文 | 结构化字段（公司/岗位/薪资） |
| 简历匹配打分 | `match_score` | JD + 简历 | 0–100 分 + 优势/差距/建议 |
| AI 面试建议 | `interview_analysis` | JD + 简历 | 面试题预测 + 准备方向 |
| AI 公司研究 | `company_research` | 公司名 + 岗位 | 公司背景/行业/团队简报 |
| 招呼语生成 | `greeting_message` | JD + 简历 + 求职偏好 | 个性化打招呼消息 |
| 求职信生成 | `cover_letter` | JD + 简历 + 求职偏好 | 定制化求职信 |
| 面试参考答案 | `ref_answer` | 面试题目 + 岗位背景 | 参考答案文本 |
| **全网岗位情报** | `intel_summary` | 公司名 + 岗位名 | 笔试题 + 面经 + 薪资三维聚合 |

> `intel_summary` 为 v2 新增的复合 AI 功能，详见第四节。

### 3.3 全网岗位情报（Tavily + LLM）

这是 v2 最具差异化的 AI 功能——用户只需点击「搜索岗位情报」，系统自动：

1. 根据公司名 + 岗位，生成 7 条多维搜索 query（笔试题/面经/薪资 × 多个变体）
2. 通过 Tavily Search API **并发**抓取全网招聘论坛、看准网、牛客等来源
3. 将搜索结果喂给 LLM，结构化输出带置信度（高/中/低）的情报
4. 结果写回 SQLite，下次打开直接展示，附带来源引用编号

输出结构：
```
岗位情报
├── 笔试题目      [topic, summary, difficulty, sourceIndex, confidence]
├── 面试经历
│   ├── 一面题目  [question, context, sourceIndex, confidence]
│   ├── 二面题目
│   ├── HR面
│   └── 其他
└── 薪资评价      [range, reviews[]]
```

### 3.4 JD 一键抓取（Boss直聘）

在「添加投递」页粘贴 Boss直聘职位 URL，自动抓取：公司名、岗位名、薪资区间、JD 原文。抓取失败时给出明确说明（含反爬提示和手动填写引导）。

### 3.5 Webhook 通知

| 通知事件 | 触发时机 |
|---------|---------|
| 投递状态变更 | 调用 `/api/applications/:id/status` 时 fire-and-forget |
| 每日摘要 | 每天 09:00–10:00 窗口内发送一次（调度器去重） |

支持渠道：**通用 JSON Webhook**（任何支持 POST 的机器人）和**企业微信群机器人**（Markdown 格式）。URL 在设置页填写，返回前端时脱敏（只显示 host + 后 6 位）。

### 3.6 数据统计（SQL 聚合）

| 图表 | 数据来源 |
|------|---------|
| 漏斗转化 | `GROUP BY status` SQL 聚合 |
| 月度趋势 | 按 `strftime('%Y-%m', application_date)` 分组 |
| 渠道效果 | `source` 字段投递数 + 进面率 |
| 平均周转时长 | 投递日期 → 第一次面试日期的平均天数 |

---

## 四、AI 系统架构

### Provider 管理

```
4 个 Provider（可同时配置）
  DeepSeek · 千问(Qwen) · OpenAI(GPT) · Anthropic(Claude)

每家配置：API Key · Base URL · 文本模型名 · 视觉模型名
（Base URL 可指向中转代理，解决网络问题）
```

### 功能路由（Purpose-based Routing）

```
11 个 AI Purpose → 各自独立路由到指定 Provider

例：
  jd_ocr       → 千问-VL（多模态视觉，默认）
  intel_summary → DeepSeek（长上下文 + 低成本）
  match_score   → 可单独切换为 GPT-4o 等更强模型
```

### 自动降级链路

```
callWithFallback(purpose, payload, kind)
  ↓ resolveCallTarget(purpose)：读 routing 取主 Provider
  ↓ 主 Provider 调用（AbortController 90s 超时）
  ↓ 失败 → 遍历其他有 Key 的 Provider（视觉任务只在 supportsVision=true 中降级）
  ↓ 全部失败 → 返回 { error }，前端展示具体错误
```

### Key 安全设计

- Key 仅存后端 `.env` 或 SQLite `settings` 表
- GET `/api/settings` 返回 `{ hasKey: true, keyPreview: 'sk-p****07ae' }`，**永不返回明文**
- 进程默认绑 `127.0.0.1`，仅本机访问，避免成为无认证 AI 代理
- `/api/ai/*` 默认 60 req/min 限流（可通过 `AI_RATE_LIMIT_PER_MIN` 调整）

---

## 五、技术架构

```
job-tracker/
├── index.html                  ← 模板 + CDN（Vue/Tailwind/marked/PDF.js）
├── assets/
│   ├── api.js                  ← fetch 封装层（统一错误处理）
│   └── app.js                  ← Vue 应用逻辑（业务核心）
├── server/
│   ├── index.js                ← Express 入口，绑 127.0.0.1，挂 /api/* + 静态资源
│   ├── db.js                   ← node:sqlite 单例 + WAL + runMigrations
│   ├── schema.sql              ← DDL（4 张表）
│   ├── mappers.js              ← snake_case ↔ camelCase + JSON 列序列化
│   ├── scheduler.js            ← 每小时 tick；09:00-10:00 窗口每日摘要
│   ├── ai-config.js            ← Provider 配置 + Purpose 路由读写
│   ├── routes/
│   │   ├── applications.js     ← CRUD + 状态切换（触发 Webhook）
│   │   ├── settings.js         ← GET/PUT（AI 配置脱敏）
│   │   ├── ai.js               ← /api/ai/text + /vision 代理
│   │   ├── intel.js            ← /api/intel/search（Tavily + LLM）
│   │   ├── scrape.js           ← /api/scrape/job（Boss直聘抓取）
│   │   ├── stats.js            ← /api/stats/overview（SQL 聚合）
│   │   ├── notify.js           ← /api/notify/test + trigger-daily
│   │   └── backup.js           ← export / import
│   └── services/
│       ├── ai-router.js        ← callWithFallback / 降级逻辑
│       ├── ai-{deepseek,qwen,openai,anthropic}.js ← 各 Provider 适配
│       ├── notifier.js         ← Webhook 发送主入口
│       ├── notify-adapters/    ← generic.js + wechat-work.js
│       ├── intel/              ← tavily.js + queries.js + index.js
│       └── scrapers/           ← boss.js
└── data/jobtracker.db          ← SQLite（gitignore）
```

**NPM 依赖**：`express` · `dotenv` · `express-rate-limit`（无原生编译依赖，SQLite 用 Node 内置）

---

## 六、数据安全 & 部署说明

- 进程默认绑 `127.0.0.1`，**仅本机可访问**
- 如需局域网访问：`HOST=0.0.0.0 npm start`（请评估风险，AI 端点无认证）
- 数据库：`data/jobtracker.db`（不进 git）
- `.env`：不进 git（已在 `.gitignore`）
- 备份/迁移：设置页「导出 JSON」/「导入 JSON」，格式与 v1 兼容
