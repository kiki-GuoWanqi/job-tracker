# 架构地图 — JobTracker v2（前后端版）

## 部署信息
- **运行方式**：本机 `npm start` 一键启动，监听 `http://127.0.0.1:3000`
- **状态**：v2.0 改造完成（前后端 + SQLite + AI 代理）
- **节点版本要求**：Node.js ≥ 22.5（使用 `node:sqlite` 内置模块，避免编译原生依赖）

---

## 文件结构（当前态）

```
job-tracker/
├── index.html                  ← 模板 + CDN 引入，挂载点 #app
├── assets/
│   ├── api.js                  ← fetch 封装层（applications/settings/resumes/ai/backup）
│   └── app.js                  ← Vue 应用逻辑（业务核心，从 index.html 抽出）
├── server/
│   ├── index.js                ← Express 入口（绑 127.0.0.1，挂 /api/* + 静态资源 + 启动 scheduler）
│   ├── db.js                   ← node:sqlite 单例 + WAL + 启动建表 + runMigrations（按需 ALTER TABLE 补列）
│   ├── schema.sql              ← DDL（4 张表 + 1 个索引）
│   ├── mappers.js              ← snake_case↔camelCase + JSON 列序列化
│   ├── scheduler.js            ← 每小时 tick；09:00-10:00 窗口内发一次每日摘要；KV `notify_state` 去重
│   ├── routes/
│   │   ├── applications.js     ← /api/applications CRUD + /:id/status（status 变化时 fire-and-forget 推送通知）
│   │   ├── settings.js         ← /api/settings GET/PUT（aiProviders/notifySettings 都脱敏；jobPreferences/notifySettings 入参规范化）
│   │   ├── resumes.js          ← /api/resumes CRUD
│   │   ├── ai.js               ← /api/ai/text + /api/ai/vision（按 routing[purpose] 分发，含降级，支持 provider/noFallback override）
│   │   ├── backup.js           ← /api/backup/export + /import
│   │   ├── notify.js           ← /api/notify/test + /api/notify/trigger-daily（debug）
│   │   ├── stats.js            ← /api/stats/overview（漏斗 / 趋势 / Top 公司 / 平均周转，全在 SQL 聚合）
│   │   └── scrape.js           ← /api/scrape/job（Boss + 通用 fallback，15s 超时）
│   ├── ai-config.js            ← AI provider 默认值 / 9 个 purposes / routing 读写 / resolveCallTarget
│   └── services/
│       ├── ai-deepseek.js      ← DeepSeek（OpenAI 兼容）
│       ├── ai-qwen.js          ← 千问（DashScope 兼容模式）
│       ├── ai-openai.js        ← OpenAI GPT（不传 temperature，兼容 GPT-5/o 系列只接受默认值）
│       ├── ai-anthropic.js     ← Anthropic Claude（messages API，与 OpenAI 协议不同）
│       ├── notifier.js         ← `notify(event, payload)` 主入口 + load/save/maskNotifySettings + adapter 选择
│       ├── notify-adapters/
│       │   ├── generic.js      ← 通用 JSON Webhook
│       │   └── wechat-work.js  ← 企业微信群机器人 markdown 消息
│       └── scrapers/
│           └── boss.js         ← `scrapeJob(url)`：fetch + regex 提取 meta/title + Boss 标题拆分 + 反爬检测
├── data/                       ← gitignore
│   └── jobtracker.db           ← SQLite 文件（WAL）
├── .env / .env.example         ← API Key + 端口配置
├── .gitignore
├── package.json                ← scripts.start = "node --no-warnings=ExperimentalWarning server/index.js"
├── README.md
└── memory-bank/                ← 设计与进度文档
```

---

## 数据流

### 持久化路径
```
前端 mutation → Vue watch (deep)
  ↓
diff 出 dirty applications（按 id 序列化对比）
  ↓
500ms debounce → 逐个 PUT /api/applications/:id
  ↓
后端 mapper：camel → snake + JSON.stringify
  ↓
SQLite (WAL) 落盘
```

显式操作（新建、删除、状态切换）走专用 endpoint，绕过 debounce：
- 新建：`POST /api/applications`
- 删除：`DELETE /api/applications/:id`
- 状态切换：`POST /api/applications/:id/status`（同步追加 status_history）

### AI 调用路径
```
前端调用 callTextAI(system, user, purpose)
  ↓
POST /api/ai/text  body { system, user, purpose }
  ↓
resolveCallTarget(purpose) 读 ai_routing[purpose] → 选定 provider + apiKey + baseUrl + model
  ↓
services/ai-{deepseek|qwen|openai|anthropic}.js
  ↓ AbortController 90s 超时
对应服务商 API
  ↓
失败 → 自动降级到任何其他有 Key 的 provider（视觉只在 supportsVision 的 provider 之间降级）
  ↓
返回 { content, provider, fallback? }
```

视觉走 `/api/ai/vision` 同样流程，purpose 为 `jd_ocr`，默认路由到千问 VL。

---

## 数据库 Schema

4 张表：

| 表 | 说明 |
|---|---|
| `applications` | 投递主表，数组字段（interviews/tasks/matchStrengths/matchGaps）作为 JSON 列存储 |
| `status_history` | 状态变更时间线，独立表（外键级联删） |
| `resumes` | 简历主表（id/label/fileName/text/timestamps） |
| `settings` | KV 表：`default_resume_id`、`custom_statuses`、`job_preferences`、`notify_settings`、`notify_state`、`ai_providers`（4 家 Key/baseUrl/textModel/visionModel JSON）、`ai_routing`（9 个 purpose → providerKey 映射） |

**Schema 演进**：`server/db.js` 的 `runMigrations()` 在启动时检查 `applications` 列集合并补齐缺失列（如 Phase 1.1 增加的 `greeting_message`/`greeting_message_at`/`cover_letter`/`cover_letter_at`）。新字段加流程：① 在 `schema.sql` 末尾把列写进 `CREATE TABLE`（fresh install 用）；② 在 `runMigrations()` 的 `additions` 数组追加同名列（existing DB 用）；③ 在 `mappers.js` 的 `APPLICATION_COLUMNS` 加 `[db_name, camelName]` 映射。

**KV settings keys 说明**：
- `job_preferences` — 求职偏好 JSON：targetPositions / targetCities / salaryMin / salaryMax / companyTypes / urgency。AI prompt 自动注入（5 个 purpose）
- `notify_settings` — Webhook 配置 JSON：`{ webhookUrl, channel, events }`。返回前端时 URL 脱敏（只保留 host + 后 6 位）
- `notify_state` — 调度器去重状态 JSON：`{ lastDailyAt: 'YYYY-MM-DD' }`

**为什么混合 JSON 列**：单用户量级几百条，前端把 Application 当胖对象操作，完全 normalize 会让前端改大量代码且无查询收益。

**为什么 status_history 独立**：天然时间序列，未来可支持「全局状态变更看板」视图。

---

## API 端点表

| 路径 | 方法 | 说明 |
|------|------|------|
| `/api/health` | GET | 健康检查 |
| `/api/applications` | GET / POST | 列表 / 创建 |
| `/api/applications/:id` | GET / PUT / DELETE | 单条 CRUD |
| `/api/applications/:id/status` | POST | 状态切换（含 status_history） |
| `/api/resumes` | GET / POST | 简历列表 / 创建 |
| `/api/resumes/:id` | GET / PUT / DELETE | 简历 CRUD |
| `/api/settings` | GET / PUT | 设置（**永不返回 Key 明文**，返回 hasDeepseekKey / hasQwenKey 布尔） |
| `/api/ai/text` | POST | 文本代理，body `{ system, user, purpose, provider?, noFallback? }` → `{ content, provider }` |
| `/api/ai/vision` | POST | 视觉代理，body `{ prompt, base64, mimeType, purpose, provider?, noFallback? }` |
| `/api/backup/export` | GET | 完整 JSON（兼容 v1 导出格式） |
| `/api/backup/import` | POST | 事务全清重建 |
| `/api/notify/test` | POST | 用当前配置发一条测试消息，绕过 event 开关 |
| `/api/notify/trigger-daily` | POST | debug：手动触发每日摘要，绕过窗口和 dedup |
| `/api/stats/overview` | GET | 漏斗 / 月度趋势 / Top 公司响应率 / 平均周转，全在 SQL 聚合 |
| `/api/scrape/job` | POST | body `{ url }` → Boss + 通用 fallback 抓取，含 `blocked` 标志和 `note` 引导 |

---

## 前端关键模块（assets/app.js）

- **STORAGE 层**：debounced + dirty-set（`lastSentByAppId` Map + `dirtySet` Set + 500ms `flushTimer`）
- **AI 层**：`callTextAI(systemPrompt, userContent, purpose)` 与 `extractJDFromImage(base64, mimeType)` 内部走 `JobTrackerAPI.ai.*`
- **AI Key 检测**：`hasAnyKey()` 读 `settings.hasDeepseekKey || settings.hasQwenKey`（来自后端响应）
- **localStorage 兼容**：`jobtracker_notified_v1`（桌面通知去重表）仍存浏览器；其余字段已迁移
- **迁移弹窗**：首次启动若检测到 `jobtracker_applications` 非空且后端为空，弹模态触发 `/api/backup/import`，迁移后原 key 改名为 `*_migrated_<ts>`
- **路由**：Hash 路由（`#list / #add / #edit / #detail / #settings / #offers / #archived / #calendar / #stats`）
- **求职偏好注入**：`buildPreferencesContext()` 把 `settings.jobPreferences` 渲染成 prompt 末尾段落，注入 5 个 AI 功能（interview_analysis / company_research / greeting_message / cover_letter / match_score）。JD 格式化与参考答案故意不注入
- **Webhook draft 模式**：URL 后端脱敏返回，前端用 `notifyDraft.webhookUrl` 单独管理；空串=保留旧值，`__CLEAR__` 哨兵值=清除
- **统计图表**：Chart.js 4.4.1 CDN，进 `#stats` 路由时 fetch + 2 次 requestAnimationFrame 等 DOM 渲染再 render，destroy 旧 chart 避免 canvas 复用问题
- **JD 抓取**：仅 add 模式可见；`scrapeFromUrl()` **只覆盖空字段**，不抢用户已有输入；`resetForm` 联动清空

---

## CDN 依赖（前端，版本锁定）

| 库 | 版本 | 用途 |
|---|------|------|
| tailwindcss | CDN play | 原子化样式 |
| vue | 3.4.21 | 响应式框架 |
| marked | 9.1.6 | Markdown 渲染 |
| pdf.js | 3.11.174 | PDF 文字提取（浏览器端） |
| mammoth | 1.6.0 | Word .docx 文字提取（浏览器端） |
| chart.js | 4.4.1 | 数据统计页图表 |

## NPM 依赖（后端）

| 库 | 版本 | 用途 |
|---|------|------|
| express | ^4.21.0 | HTTP 服务 |
| dotenv | ^16.4.5 | .env 加载 |
| express-rate-limit | ^7.4.0 | AI 端点限流 |
| **（无原生编译依赖）** | | SQLite 用 Node 内置 `node:sqlite` |

---

## 安全姿态

- 进程默认绑 `127.0.0.1`（仅本机），避免 AI 代理被滥用
- `/api/ai/*` 接口加 60 req/min 限流（可配）
- API Key 仅在 `.env`，前后端响应均不暴露明文
- `.env` 与 `data/` 已加入 `.gitignore`
