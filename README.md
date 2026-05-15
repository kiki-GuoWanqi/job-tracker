# 🎯 求职助手 JobTracker（v2 · 前后端版）

> 从投递到 Offer，一站式管理求职全流程。内置 AI 辅助，让每次面试准备有据可依。

v2 改造为前后端架构：数据持久化到本地 SQLite，AI Key 仅后端持有，单命令一键启动。

---

## 解决的问题

校招季同时投递几十家公司，Excel 太笨重、Notion 要搭模板、聊天记录里的面经过几天就找不到了——JobTracker 把这些碎片整合成一个工作台：

- 📋 **投递进度一眼看清** — 状态标签一键切换，超过 7 天未跟进自动提醒
- 🤖 **AI 帮你读懂 JD** — 粘贴职位描述，自动整理为结构化要点；截图也能 OCR 识别
- 🧠 **AI 面试建议** — 上传简历后，AI 对比你的简历 × JD，输出匹配度分析 + 准备方向 + 可能被问的问题
- 📝 **面经系统沉淀** — 按场次记录题目和回答，每道题可让 AI 生成参考答案做对比
- 🧪 **面试前自测** — 隐藏参考答案，模拟真实问答节奏
- 💾 **数据持久化到本地 SQLite** — 不再依赖浏览器 localStorage，重装系统不丢失，仍可导出 / 导入 JSON

---

## 技术栈

| 层 | 选型 | 理由 |
|---|------|------|
| 后端 | Node.js (≥22.5) + Express | 单进程，绑 127.0.0.1，仅本机访问 |
| 数据库 | SQLite（`node:sqlite`） | Node 内置，零原生依赖；WAL 模式 |
| 前端框架 | Vue 3 (CDN) | 单 HTML + 外部 JS，无需构建 |
| UI | Tailwind CSS (CDN) | 原子化样式 |
| Markdown | marked.js | 渲染 AI 输出和 JD 格式化结果 |
| PDF / Word | PDF.js + mammoth.js | 浏览器端简历文本提取 |
| AI | DeepSeek / 千问 / OpenAI / Anthropic | 4 家可选，每个 AI 功能独立路由；Base URL 与模型名前端可改 |

**架构决策**：前后端同源（http://127.0.0.1:3000），无 CORS。AI Key 既可在后端 `.env` 配置，也可在前端「设置 → AI 模型配置」中改写；前端写入的值优先级更高，保存到 SQLite。所有 AI 调用通过 `/api/ai/*` 后端代理。

### AI 模型配置

- **4 家服务商**：DeepSeek、阿里千问、OpenAI (GPT)、Anthropic (Claude)
- **每家可配**：API Key、Base URL、文本模型、视觉模型
- **6 个 AI 功能独立路由**：JD 格式化、面试建议、参考答案、匹配评分、公司研究、JD OCR；每项可单独指定使用哪个服务商
- **自动降级**：被选服务商无 Key 或调用失败时，按其他可用服务商兜底
- **安全**：Key 仅在后端 .env / SQLite 中明文存储，前端 API 响应仅返回 `keyPreview`（如 `sk-p****07ae`）

---

## 项目结构

```
job-tracker/
├── index.html                # 模板 + Tailwind/Vue/marked CDN，挂载 #app
├── assets/
│   ├── api.js                # fetch 封装层
│   └── app.js                # Vue 应用逻辑（业务核心）
├── server/
│   ├── index.js              # Express 入口
│   ├── db.js                 # SQLite 单例 + WAL
│   ├── schema.sql            # DDL
│   ├── mappers.js            # snake↔camel + JSON 列序列化
│   ├── routes/               # applications / settings / resumes / ai / backup
│   └── services/             # ai-deepseek / ai-qwen
├── data/                     # SQLite 文件，gitignore
├── .env / .env.example       # API Key + 端口
├── package.json
└── memory-bank/              # 设计文档与进度
```

---

## 快速开始

```bash
# 1. 安装依赖（仅 express / dotenv / express-rate-limit，约 70 个包）
npm install

# 2. 启动
npm start
# → JobTracker 已启动: http://127.0.0.1:3000

# 3. 在浏览器「设置 → AI 模型配置」中填入任一服务商的 API Key
#   （或先 cp .env.example .env 把 Key 写在 .env 里作为初始默认）
```

浏览器打开 `http://127.0.0.1:3000` 即可。

**首次启动**：若浏览器之前有 v1 的 localStorage 数据，会弹出一键迁移弹窗；点击「立即迁移」即可把全部投递、面经、简历同步到 SQLite。

---

## 部署 / 数据安全

- 进程默认绑 `127.0.0.1`，**仅本机可访问**；如需暴露到局域网请改 `HOST=0.0.0.0`，但请先评估风险（AI 端点会变成无认证代理）
- 数据库文件位置：`data/jobtracker.db`（不进 git）
- `.env` 文件不进 git（已在 `.gitignore`）
- AI 调用走后端，前端不持有 Key
- AI 接口默认 60 req/min 限流，可在 `.env` 调整 `AI_RATE_LIMIT_PER_MIN`

## 备份 / 迁移

设置页提供「导出 JSON」/「导入 JSON」，文件格式与 v1 完全兼容。换机器只需复制 JSON 导入即可。

---

## API 概览（仅供 hack）

| 路径 | 方法 | 说明 |
|------|------|------|
| `/api/applications` | GET/POST | 列表 / 创建 |
| `/api/applications/:id` | GET/PUT/DELETE | 单条 CRUD |
| `/api/applications/:id/status` | POST | 状态切换 + 历史记录 |
| `/api/resumes` 等 | CRUD | 简历 |
| `/api/settings` | GET/PUT | 设置（**永不返回 Key 明文**） |
| `/api/ai/text` | POST | 文本代理（DeepSeek / qwen） |
| `/api/ai/vision` | POST | 视觉代理（qwen-vl / DeepSeek） |
| `/api/backup/export` | GET | 完整 JSON |
| `/api/backup/import` | POST | 事务全清重建 |
