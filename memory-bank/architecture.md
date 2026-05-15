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
│   ├── index.js                ← Express 入口（绑 127.0.0.1，挂 /api/* + 静态资源）
│   ├── db.js                   ← node:sqlite 单例 + WAL + 启动建表
│   ├── schema.sql              ← DDL（4 张表 + 1 个索引）
│   ├── mappers.js              ← snake_case↔camelCase + JSON 列序列化
│   ├── routes/
│   │   ├── applications.js     ← /api/applications CRUD + /:id/status
│   │   ├── settings.js         ← /api/settings GET/PUT（返回 aiProviders 脱敏 + aiRouting + aiPurposes）
│   │   ├── resumes.js          ← /api/resumes CRUD
│   │   ├── ai.js               ← /api/ai/text + /api/ai/vision（按 routing[purpose] 分发，含降级）
│   │   └── backup.js           ← /api/backup/export + /import
│   ├── ai-config.js            ← AI provider 默认值 / purposes 定义 / routing 读写 / resolveCallTarget
│   └── services/
│       ├── ai-deepseek.js      ← DeepSeek（OpenAI 兼容）
│       ├── ai-qwen.js          ← 千问（DashScope 兼容模式）
│       ├── ai-openai.js        ← OpenAI GPT
│       └── ai-anthropic.js     ← Anthropic Claude（messages API，与 OpenAI 协议不同）
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
| `settings` | KV 表：`default_resume_id`、`custom_statuses`、`ai_providers`（4 家 Key/baseUrl/textModel/visionModel JSON）、`ai_routing`（7 个 purpose → providerKey 映射） |

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
| `/api/ai/text` | POST | 文本代理，body `{ system, user, purpose }` → `{ content, provider }` |
| `/api/ai/vision` | POST | 视觉代理，body `{ prompt, base64, mimeType, purpose }` |
| `/api/backup/export` | GET | 完整 JSON（兼容 v1 导出格式） |
| `/api/backup/import` | POST | 事务全清重建 |

---

## 前端关键模块（assets/app.js）

- **STORAGE 层**：debounced + dirty-set（`lastSentByAppId` Map + `dirtySet` Set + 500ms `flushTimer`）
- **AI 层**：`callTextAI(systemPrompt, userContent, purpose)` 与 `extractJDFromImage(base64, mimeType)` 内部走 `JobTrackerAPI.ai.*`
- **AI Key 检测**：`hasAnyKey()` 读 `settings.hasDeepseekKey || settings.hasQwenKey`（来自后端响应）
- **localStorage 兼容**：`jobtracker_notified_v1`（桌面通知去重表）仍存浏览器；其余字段已迁移
- **迁移弹窗**：首次启动若检测到 `jobtracker_applications` 非空且后端为空，弹模态触发 `/api/backup/import`，迁移后原 key 改名为 `*_migrated_<ts>`
- **路由**：Hash 路由，与 v1 完全一致（`#list / #add / #edit / #detail / #review / #settings / #offers / #archived / #calendar`）

---

## CDN 依赖（前端，版本锁定）

| 库 | 版本 | 用途 |
|---|------|------|
| tailwindcss | CDN play | 原子化样式 |
| vue | 3.4.21 | 响应式框架 |
| marked | 9.1.6 | Markdown 渲染 |
| pdf.js | 3.11.174 | PDF 文字提取（浏览器端） |
| mammoth | 1.6.0 | Word .docx 文字提取（浏览器端） |

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
