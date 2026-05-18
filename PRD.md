# PRD · 求职助手 JobTracker v2（前后端版）

**文档版本**：v1.0  
**撰写日期**：2025 年 5 月  
**产品形态**：本地 Node.js + Express + SQLite，单命令启动，`http://127.0.0.1:3000`  
**代码仓库**：kiki-GuoWanqi/job-tracker（jay 分支）

---

## 目录

1. [产品概述](#1-产品概述)
2. [背景与立项目标](#2-背景与立项目标)
3. [用户研究](#3-用户研究)
4. [需求优先级](#4-需求优先级)
5. [功能规格](#5-功能规格)
6. [AI 系统设计（核心章节）](#6-ai-系统设计)
7. [数据模型](#7-数据模型)
8. [非功能需求](#8-非功能需求)
9. [度量指标](#9-度量指标)
10. [迭代规划](#10-迭代规划)
11. [风险与依赖](#11-风险与依赖)

---

## 1. 产品概述

**JobTracker v2** 是求职助手的前后端架构版本。在 v1（纯前端）已验证产品方向的基础上，v2 做了三个核心升级：

1. **数据可靠性**：持久化到本地 SQLite，突破 localStorage 5MB 限制，数据不随浏览器清理丢失
2. **AI 系统化**：4 家 AI Provider（DeepSeek / 千问 / OpenAI / Anthropic）统一在服务端管理，11 个 AI 功能可独立路由到不同 Provider，自动降级
3. **主动情报**：接入 Tavily Search API，并发搜索全网面经/笔试/薪资，LLM 结构化后展示带来源引用的岗位情报（v2 独有核心功能）

还新增了：Boss直聘 URL 一键抓取 JD、招呼语/求职信 AI 生成、Webhook 投递状态通知 + 每日摘要调度。

**一句话定位**：本机运行、数据私有、AI 全程辅助的求职管理工作台。

---

## 2. 背景与立项目标

### 2.1 v1 → v2 的升级动因

v1 验证了产品方向（用户愿意用 AI 辅助求职准备），但暴露了三个结构性问题：

| v1 问题 | 具体表现 | v2 解法 |
|---------|---------|---------|
| 数据脆弱 | 清除浏览器缓存即丢失，简历文本占满 5MB 上限 | SQLite WAL 持久化，无大小限制 |
| AI 扩展受限 | API Key 存浏览器，只能全局配一家 Provider，无法差异化路由 | 服务端 4 家 Provider + 11 个 Purpose 级独立路由 |
| 信息获取被动 | 面经只靠用户自己填，JD 只能手动粘贴，没有外部信息来源 | Tavily 全网情报搜索 + Boss直聘 URL 自动抓取 |

### 2.2 立项目标

| # | 目标 | 验收标准 |
|---|------|---------|
| G1 | 数据可靠性 | 重启服务、清空浏览器缓存后数据完整保留 |
| G2 | AI 能力覆盖率 | 11 个 AI Purpose 全部可路由；主 Provider 宕机时 ≤ 30s 自动降级 |
| G3 | 全网情报可用性 | 给定公司+岗位，60s 内返回至少 1 条带来源的结构化情报（依赖 Tavily 结果质量） |
| G4 | Key 安全 | 前端任何 API 响应中不出现 Key 明文 |
| G5 | 本地部署门槛 | `npm install && npm start` 后 60s 内可访问，无需额外安装数据库 |

---

## 3. 用户研究

### 3.1 目标用户画像

**主要用户：校招应届生（24–26 届本硕）**

- 同期在投：30–80 家
- 求职周期：3–6 个月（每年 9 月–次年 5 月）
- 信息源：Boss直聘、牛客网、实习僧、校园宣讲、内推渠道
- 设备：电脑端操作招聘网站和 JobTracker，手机接收面试通知

**次要用户：技术/产品岗社招人员**

- 在投数量少（5–20 家），但更关注公司调研深度和 Offer 谈判
- 对 API Key 管理和隐私安全要求更高，愿意接受需要本地部署的工具

### 3.2 核心痛点（v2 视角）

| 痛点 | v1 覆盖程度 | v2 新增解法 |
|------|-----------|-----------|
| P1：投递进度管理散乱 | ✅ 已解决 | SQLite 持久化，数据更可靠 |
| P2：面试前准备耗时 | ✅ 部分（需手动搜索面经）| **全网岗位情报**自动聚合面经/笔试/薪资 |
| P3：面经记录散乱 | ✅ 已解决 | — |
| P4：Offer 决策困难 | ✅ 已解决 | — |
| P5：投递材料撰写重复 | ❌ v1 无此功能 | 招呼语生成 + 求职信 AI 生成 |
| P6：JD 手动录入慢 | ❌ v1 无此功能 | Boss直聘 URL 一键抓取 |
| P7：面试日程变更无提醒 | ❌ v1 无此功能 | Webhook 状态通知 + 每日摘要调度 |

### 3.3 用户旅程地图（v2 完整版）

```
[确定求职意向]
    ↓ 设置求职偏好（城市/薪资/公司类型/紧迫度）
    ↓ → AI 功能自动注入偏好上下文（5 个 purpose 复用）
    ↓
[寻找岗位]
    ↓ 粘贴 Boss直聘 URL → 自动抓取公司/岗位/薪资/JD
    ↓ AI 格式化 JD（也支持截图 OCR）
    ↓
[投递前决策]
    ↓ 简历匹配打分（0–100 + 优势/差距）→ 决定优先级
    ↓ 招呼语 AI 生成（基于 JD + 简历 + 偏好）→ 直接发 Boss
    ↓ 求职信 AI 生成（需要时）
    ↓
[等待筛选 + 笔试准备]
    ↓ 全网岗位情报搜索 → Tavily 并发 7 条 query → LLM 结构化
    ↓ 获取历史笔试题型/难度/高频面试题/薪资区间（附来源引用）
    ↓
[面试准备]
    ↓ AI 公司研究（背景/行业/岗位简报）
    ↓ AI 面试建议（基于 JD + 简历的定制化准备方向）
    ↓
[面试进行]
    ↓ 面经记录 → AI 参考答案 → 题库自测（三级评分）
    ↓ 状态切换 → Webhook 自动推送通知（企业微信/通用 JSON）
    ↓
[Offer 决策]
    ↓ Offer 列表 + 多维加权比较器 + AI 综合建议
    ↓
[复盘]
    ↓ 归档已挂 → 失败漏斗分析 → 数据看板（SQL 聚合）
```

---

## 4. 需求优先级

### Must Have（核心，无法妥协）

- 投递 CRUD + 状态机 + SQLite 持久化
- AI 多 Provider 管理（4 家）+ Per-purpose 路由 + 自动降级
- **全网岗位情报**（Tavily + LLM，v2 核心差异化）
- API Key 安全（前端永不见明文）
- JSON 导入/导出 + v1 数据迁移

### Should Have（完整产品体验）

- 招呼语生成 + 求职信生成
- Boss直聘 URL 抓取
- Webhook 通知（状态变更 + 每日摘要调度）
- 简历匹配打分 + 面试建议 + 公司研究
- 数据统计（SQL 聚合：漏斗/趋势/渠道效果）

### Could Have（差异化，提升深度）

- 面试题库 + 题库自测（三级评分）
- 归档复盘 + 失败关卡分析
- 企业微信群机器人专属 Markdown 格式
- 日历视图

### Won't Have（本版不做）

- 多用户/团队协作（引入认证复杂度，偏离个人工具定位）
- 云端 SaaS 化（隐私承诺是核心卖点，云化需重新设计数据隔离）
- 移动端 App（主场景在电脑端）
- AI 自动更新投递状态（高意图操作不应由 AI 干预）

---

## 5. 功能规格

### 5.1 投递管理（v2 增量）

在 v1 基础上，v2 新增/升级：

**来源渠道**：新增 `source` 字段（官网/内推/Boss直聘/公众号/实习僧/其他），与统计页「渠道进面率」联动。

**拖拽排序**：`display_order` 字段（REAL 类型）持久化到 SQLite，历史数据启动时自动回填（以 `created_at` 毫秒数作初值）。

**JD 一键抓取**：在「添加投递」页粘贴 Boss直聘职位 URL，后端 15s 内抓取并自动填充：公司名、岗位名、薪资区间、JD 原文。**设计原则**：只填充空字段，不覆盖用户已有内容；反爬时返回 `blocked` 标志 + 引导手动填写的 `note`。

### 5.2 全网岗位情报（v2 核心功能）

#### 5.2.1 功能描述

用户在投递详情页点击「搜索岗位情报」，系统自动完成以下流程：

**Step 1 — Query 生成**

根据公司名 + 岗位，生成 7 条覆盖三维度的搜索变体：

| 维度 | Query 示例（以"字节跳动 产品经理"为例）|
|------|--------------------------------------|
| 笔试（2条） | `字节跳动 笔试 题目`、`字节跳动 OA 真题 产品经理` |
| 面试（3条） | `字节跳动 产品经理 一面 面试`、`字节跳动 面经 二面 三面`、`字节跳动 产品经理 HR 面试` |
| 薪资（2条） | `字节跳动 产品经理 薪资 待遇`、`字节跳动 工资 评价 看准` |

**Step 2 — 并发搜索**

通过 Tavily Search API（depth=advanced）并发执行 7 条 query，每条独立 20s AbortController 超时。单条失败不阻断其他——热门公司的薪资/笔试条数多，冷门公司只要面试维度有结果即可。

**Step 3 — LLM 结构化**

将搜索结果（含 title/url/publishedDate/snippet）喂给 LLM（`intel_summary` purpose），要求严格输出 JSON：

```json
{
  "writtenTests": [
    { "topic": "SQL 窗口函数", "summary": "...", "difficulty": "中", "sourceIndex": [2], "confidence": "高" }
  ],
  "interviews": {
    "round1": [{ "question": "...", "context": "...", "sourceIndex": [1,3], "confidence": "中" }],
    "round2": [], "round3": [], "hr": [], "other": []
  },
  "salary": {
    "range": "25-35K/月·16薪",
    "reviews": [{ "summary": "...", "sourceIndex": [5], "confidence": "低" }]
  }
}
```

**Step 4 — JSON 解析容错**

LLM 偶尔包 markdown fence 或输出非法 JSON：
1. 先尝试剥离 ````json ... ``` ` fence 后 `JSON.parse`
2. 失败则用正则抓第一个 `{ ... }` 块再尝试
3. 仍失败：追加"上次输出无法被 JSON.parse，请重新输出，只允许 JSON"纠错重试
4. 二次仍失败：返回空结构，前端提示"情报获取失败"

**Step 5 — 结果持久化**

将结构化情报写回 SQLite `applications.intel_json` + `intel_at`，用户下次打开直接展示，不重复搜索。

#### 5.2.2 关键设计决策

| 决策 | 理由 |
|------|------|
| 用 Tavily 而非直接 Google | Tavily 提供结构化 JSON（snippet/publishedDate/url），无需解析 HTML；支持 depth=advanced 提升召回质量 |
| 单条 query 失败不致命 | Promise.all 并发，error 降级为 `{ items: [], error }`，避免单点失败影响整体返回 |
| sourceIndex 来源引用 | 要求 LLM 标注每条情报来自哪个搜索结果，用户可核实来源，防止幻觉 |
| confidence 置信度字段 | 证据弱时标 low，用户知道信息可信度，不盲信 AI 总结 |
| intel 与用户面经完全隔离 | `intel_json` 是对象型 JSON 列，与用户手填的 `interviews_json` 数组分开存储，互不干扰 |

### 5.3 招呼语 & 求职信生成

**设计思路**：求职前的文案撰写是高重复、个性化弱的工作，AI 生成后用户只需微调，节省每条投递 5–10 分钟的材料准备时间。

**招呼语**（Purpose: `greeting_message`）：
- 输入：格式化 JD + 简历文本 + 求职偏好
- 输出：50–100 字，符合 Boss直聘对话语境的个性化打招呼消息
- 持久化：`greeting_message` + `greeting_message_at` 字段

**求职信**（Purpose: `cover_letter`）：
- 输入：格式化 JD + 简历文本 + 求职偏好
- 输出：300–500 字结构化求职信（自我介绍 / 匹配点 / 期望）
- 持久化：`cover_letter` + `cover_letter_at` 字段

**求职偏好自动注入**：用户在设置页填写一次偏好（目标城市/薪资/公司类型/紧迫度），`buildPreferencesContext()` 自动附加到 5 个 AI purpose 的 prompt 末尾（greeting_message / cover_letter / match_score / interview_analysis / company_research），不需要在每次生成时重复填写。

### 5.4 AI 多 Provider 配置界面

**设置 → 模型配置 Tab**：每家 Provider 一张卡片，可独立配置：
- API Key（填写后后端持久化到 SQLite，前端只展示脱敏 preview，如 `sk-p****07ae`）
- Base URL（支持自定义中转代理，解决网络访问问题）
- 文本模型名（如 `deepseek-chat`、`gpt-4o`、`claude-opus-4-7`）
- 视觉模型名（如 `qwen-vl-plus`）

**Purpose 路由表**：11 个 AI 功能，下拉框各自指定 Provider，视觉 purpose（`jd_ocr`）只展示支持视觉的 Provider。

**连接测试**：「测试连接」按钮强制指定该 Provider（`noFallback=true`），不走降级，直接返回成功/失败。

### 5.5 Webhook 通知系统

#### 通知事件

| 事件 | 触发时机 | 默认开启 |
|------|---------|---------|
| `status_changed` | 用户切换投递状态时，fire-and-forget（不阻塞主流程）| ✅ |
| `daily_digest` | 每天 09:00–10:00 窗口，调度器首次 tick 发送；`notify_state.lastDailyAt` 去重防重发 | ✅ |

**每日摘要内容**：今日有面试的投递列表 + 超过 7 天未跟进的投递列表。

#### 通知渠道

| 渠道 | 格式 | 适用场景 |
|------|------|---------|
| 通用 JSON Webhook | `{ event, payload, timestamp }` POST | 飞书/钉钉/自建服务 |
| 企业微信群机器人 | Markdown 正文 | 企业微信群实时追踪 |

**安全设计**：Webhook URL 脱敏返回前端（host + 后 6 位）；前端用 `__CLEAR__` 哨兵值表示清除，空串表示保留现有值，防止表单提交时误清。

### 5.6 数据统计（SQL 全量聚合）

v2 统计数据通过 `GET /api/stats/overview` 一次返回，全部在 SQLite 中聚合：

| 统计项 | SQL 逻辑 |
|--------|---------|
| 漏斗各阶段数量 | `GROUP BY status COUNT(*)` |
| 月度投递趋势（近 6 月）| `strftime('%Y-%m', application_date)` 分组 |
| 渠道进面率 | `source` 字段 + 面试/Offer 状态占比 |
| 投递→面试平均天数 | `julianday` 差值平均 |

---

## 6. AI 系统设计

### 6.1 总体架构

```
前端 callTextAI(system, user, purpose)
    ↓
POST /api/ai/text { system, user, purpose, [provider?], [noFallback?] }
    ↓
resolveCallTarget(purpose)
  → 读 SQLite ai_routing[purpose]  →  取 providerKey
  → 读 SQLite ai_providers[providerKey]  →  取 { apiKey, baseUrl, model }
    ↓
callWithFallback(purpose, payload, kind='text'|'vision', opts)
  → services/ai-{deepseek|qwen|openai|anthropic}.js
  → AbortController 90s 超时
  → 失败 → 遍历其他有 Key 的 Provider（视觉任务限 supportsVision=true）
    ↓
返回 { content, provider, fallback? }
```

### 6.2 四家 Provider 技术差异

| Provider | 接入协议 | 特殊处理 |
|---------|---------|---------|
| DeepSeek | OpenAI-compatible | `temperature: 0.7`，标准兼容 |
| 阿里千问 | DashScope compatible-mode | 视觉用 `qwen-vl-plus`；`temperature: 0.7` |
| OpenAI (GPT) | 官方 API | **不传 temperature**（GPT-5/o 系列只接受默认值，传参会 400） |
| Anthropic (Claude) | Messages API（非 OpenAI 兼容）| 专用 header `anthropic-version`；`messages: [{role, content}]` 结构不同 |

**架构决策**：每个 Provider 独立文件（`services/ai-{name}.js`），统一导出 `callText(cfg, messages)` 和 `callVision(cfg, payload)` 接口。新增 Provider 只需新增一个文件，不改动 router 层。

### 6.3 AI Purpose 完整列表（11 个）

| Purpose Key | 功能名称 | Kind | 默认 Provider |
|------------|---------|------|--------------|
| `jd_format` | JD 格式化 | text | DeepSeek |
| `interview_analysis` | AI 面试建议 | text | DeepSeek |
| `ref_answer` | 面试参考答案 | text | DeepSeek |
| `match_score` | 简历匹配评分 | text | DeepSeek |
| `company_research` | AI 公司研究 | text | DeepSeek |
| `greeting_message` | 招呼语生成 | text | DeepSeek |
| `cover_letter` | 求职信生成 | text | DeepSeek |
| `jd_extract` | JD 结构提取（抓取后二次解析）| text | DeepSeek |
| `jd_ocr` | JD 截图识别 | **vision** | 千问-VL |
| `intel_summary` | 全网岗位情报总结 | text | DeepSeek |
| `connection_test` | 连接测试 | text | DeepSeek |

### 6.4 Prompt 工程策略

| 场景 | 关键设计 |
|------|---------|
| 求职偏好注入 | `buildPreferencesContext()` 在 5 个 purpose prompt 末尾追加偏好段落，有偏好才追加（不污染其他 purpose）|
| 匹配打分输出约束 | System prompt 要求返回 `{ score, summary, strengths[], gaps[], recommendation }` JSON；前端 `JSON.parse` 直接消费 |
| 情报总结 JSON schema | System prompt 包含完整 JSON 结构定义 + sourceIndex 规范 + "编造内容必须标 confidence=低" 规则 |
| 情报解析容错 | 两级：strip fence → 正则抽取；仍失败 → 纠错重试；再失败 → 空结构降级 |
| JD 格式化 | 要求固定 5 段（职位概述/岗位职责/任职要求/加分项/薪资福利）；原文缺某段则跳过，不补充虚假内容 |
| 上下文复用 | 面试建议/匹配打分直接复用 `jdFormatted`，不重传原始 JD，节约 token 并保证分析一致性 |

### 6.5 限流与安全

```
/api/ai/* → express-rate-limit
  windowMs: 60_000
  max: AI_RATE_LIMIT_PER_MIN（默认 60，.env 可调）

进程绑 127.0.0.1（默认）
  → 防止 AI 代理端点被局域网其他设备无认证调用

Key 安全：
  → GET /api/settings 返回 { hasKey, keyPreview }，永不返回明文
  → .env DEEPSEEK_API_KEY 等作兜底，DB 中用户设置优先级更高
```

---

## 7. 数据模型

### 7.1 数据库 Schema（4 张表）

#### applications 表（主表）

| 字段组 | 关键字段 |
|--------|---------|
| 基础信息 | `id`, `company_name`, `position`, `work_city`, `application_date`, `status`, `source` |
| JD | `jd_raw`, `jd_formatted` |
| AI 生成内容 | `ai_analysis`, `company_research`, `greeting_message`, `cover_letter`（各含 `_at` 时间戳）|
| 匹配评分 | `match_score`（0–100 REAL）, `match_summary`, `match_strengths_json`, `match_gaps_json`, `match_recommendation`, `match_resume_id` |
| 全网情报 | `intel_json`（对象型 JSON：writtenTests/interviews/salary/sources/fetchedAt）, `intel_at` |
| 面经 | `interviews_json`（数组型 JSON，含 round/date/notes/questions）|
| 时间节点 | `exam_date`, `next_interview_date`, `offer_deadline` |
| 排序 | `display_order`（REAL，拖拽排序）|
| 复盘 | `post_mortem`, `post_mortem_updated_at` |
| 时间戳 | `created_at`, `updated_at` |

**JSON 列处理规则**：
- 数组型字段（interviews/tasks/matchStrengths/matchGaps）：`JSON.parse` 失败 fallback `[]`
- 对象型字段（intel）：`JSON.parse` 失败 fallback `null`，前端按 null 渲染"未获取"状态

#### status_history 表

`(id, application_id [FK 级联删], status, round, changed_at)`

独立建表原因：状态历史是天然时间序列，独立存储支持未来「全局看板」视图；级联删除比在 JSON 数组中维护更干净；启动时 `dedupHistory()` 幂等去重，防止历史脏数据积累。

#### resumes 表

`(id, label, file_name, text [纯文本], created_at, updated_at)`

#### settings 表（KV 结构）

| Key | Value | 说明 |
|-----|-------|------|
| `ai_providers` | JSON 对象 | 4 家 Provider 的 { apiKey, baseUrl, textModel, visionModel } |
| `ai_routing` | JSON 对象 | 11 个 purpose → providerKey 映射 |
| `job_preferences` | JSON 对象 | targetPositions/targetCities/salaryMin/salaryMax/companyTypes/urgency |
| `notify_settings` | JSON 对象 | { webhookUrl, channel, events } |
| `notify_state` | JSON 对象 | { lastDailyAt: 'YYYY-MM-DD' }，调度器去重 |
| `tavily_key` | 字符串 | Tavily Search API Key（.env TAVILY_API_KEY 兜底）|
| `default_resume_id` | 字符串 | 默认简历 ID |
| `custom_statuses` | JSON 数组 | 用户扩展状态 |
| `data_migrations` | JSON 数组 | 已执行的迁移 key（幂等保护）|

### 7.2 Schema 演进机制

每次启动调用 `runMigrations()`，检查 `PRAGMA table_info(applications)` 的列集合，对缺失列执行幂等 `ALTER TABLE ADD COLUMN`。新增字段三步流程：① `schema.sql` 加列（fresh install）；② `runMigrations.additions` 追加（existing DB）；③ `mappers.js` 的 `APPLICATION_COLUMNS` 添加映射（camel ↔ snake）。

### 7.3 前端 → 后端数据同步流

```
用户修改 application → Vue watch（deep）
  ↓ diff：序列化对比 lastSentByAppId[id]，无变化跳过
  ↓ 加入 dirtySet → 500ms debounce → flushDirty()
  ↓ PUT /api/applications/:id（逐个发送）
  ↓ mappers：camelCase → snake_case + JSON.stringify
  ↓ SQLite WAL 落盘
```

显式操作（新建/删除/状态切换）绕过 debounce，走专用 endpoint，确保实时性。

---

## 8. 非功能需求

### 8.1 性能

| 指标 | 目标 |
|------|------|
| 服务启动时间 | ≤ 2 秒（含 SQLite 初始化）|
| API 列表响应（100条） | ≤ 50ms |
| 岗位情报全流程 | ≤ 60s（7 query × 20s 超时并发）|
| AI 文本调用（含降级） | ≤ 15s |

### 8.2 安全

| 措施 | 实现 |
|------|------|
| AI Key 不出前端 | GET /api/settings 返回 `{ hasKey, keyPreview }`，绝无明文 |
| 仅本机访问 | 默认绑 `127.0.0.1` |
| AI 接口限流 | express-rate-limit，60 req/min（.env 可调）|
| Webhook URL 脱敏 | 返回 host + 后 6 位 |

### 8.3 可靠性

| 故障场景 | 处理方式 |
|---------|---------|
| 单 AI Provider 宕机 | callWithFallback 自动降级，遍历所有有 Key 的 Provider |
| Tavily 单 query 超时 | 20s AbortController，超时返回空 items，不阻断其他 query |
| LLM 输出非 JSON | 两级降级 + 纠错重试；最终返回空结构，不 crash |
| Webhook 失败 | fire-and-forget，不影响主业务，只 console.error |
| Schema 升级 | `runMigrations()` 幂等 ALTER TABLE，启动自动补列 |

### 8.4 兼容性

- Node.js ≥ 22.5（`node:sqlite` 内置模块要求）
- 前端：Chrome 100+、Edge 100+、Firefox 100+
- v1 localStorage 数据可一键迁移（首次启动弹窗 + `/api/backup/import`）

---

## 9. 度量指标

### 9.1 指标体系说明

v2 是本地部署工具，无法收集服务端埋点。以**功能可用性**和**信息质量**作代理指标：

| 类别 | 指标 | 期望值 |
|------|------|-------|
| AI 可用性 | 11 个 Purpose 均可路由 | 100% |
| 降级速度 | 主 Provider 宕机后 ≤ 30s 切换 | ≥ 95% |
| 情报召回率 | 热门公司+岗位返回 ≥ 1 条面试情报 | ≥ 80% |
| 情报置信度 | confidence=高 条目占比 | ≥ 40%（热门公司）|
| JD 抓取成功率 | Boss直聘 URL 非反爬状态下 | ≥ 70% |

### 9.2 用户体验目标

| 场景 | 目标 |
|------|------|
| 首次配置完成（npm start → 第一条投递）| ≤ 3 分钟 |
| Boss URL → 完整 JD 可用 | ≤ 30 秒 |
| 岗位情报搜索到展示 | ≤ 60 秒 |
| 招呼语/求职信生成 | ≤ 10 秒 |

### 9.3 北极星指标（如增加遥测）

若未来加入可选匿名统计：
- **AI 功能使用深度**：每活跃会话平均触发的 AI purpose 数（越高说明 AI 价值被感知）
- **情报查看率**：有面试的投递中查看过岗位情报的比例（衡量 Tavily 情报对面试准备的渗透）
- **数据导出频率**：代理"用户是否有长期使用意愿"

---

## 10. 迭代规划

### Phase 1：核心架构（已完成）

- [x] Node.js + Express + SQLite 前后端分离架构
- [x] 4 家 AI Provider + 11 Purpose 独立路由 + 自动降级
- [x] 投递管理全套（CRUD + 状态机 + 时间轴 + 拖拽排序）
- [x] AI 功能全集：JD格式化/OCR/匹配打分/公司研究/面试建议/参考答案/招呼语/求职信
- [x] JSON 导入导出（v1 格式兼容）+ v1 → v2 一键迁移

### Phase 2：情报 + 通知 + 深度复盘（已完成）

- [x] 全网岗位情报（Tavily × 7 query + LLM 结构化 + 来源引用）
- [x] Boss直聘 URL 一键抓取 JD
- [x] Webhook 通知（status_changed + daily_digest 调度器）
- [x] 企业微信群机器人适配
- [x] 面试题库 AI 批量提取 + 三级自测模式
- [x] 归档复盘 + 失败漏斗
- [x] 数据统计 SQL 聚合（漏斗/趋势/渠道效果）

### Phase 3：计划方向

| 优先级 | 功能 | 核心价值 |
|--------|------|---------|
| P0 | AI 模拟面试（对话式，v1 有，v2 待移植）| 深度面试彩排 |
| P0 | 更多平台 JD 抓取（实习僧/BOSS通用解析）| 降低录入摩擦 |
| P1 | PWA 桌面通知 | 面试/笔试日前 1 天提醒，防漏场 |
| P1 | 情报增量更新（与上次结果对比 diff）| 提升情报时效性 |
| P2 | 情报质量反馈（标记"有用/无用"）| 用户反馈闭环，优化 Prompt |
| P2 | 多设备支持（可选 WebDAV 同步）| 手机端查阅当日面试信息 |

---

## 11. 风险与依赖

| 风险 | 影响 | 缓解策略 |
|------|------|---------|
| Tavily API 额度耗尽 | 岗位情报不可用 | 前端清晰提示并引导配置；情报是增值功能，不影响核心使用 |
| LLM Provider 不稳定 | AI 功能响应慢或失败 | 多 Provider 降级链路；设置页可手动切换首选 Provider |
| Boss直聘反爬升级 | JD 抓取成功率下降 | 失败时 `blocked` 标志 + 手动填写引导；定期检测更新抓取逻辑 |
| Node.js 22.5 版本门槛 | 旧版 Node 用户无法启动 | 启动时检测版本，低于要求时输出清晰错误和升级链接 |
| SQLite WAL 文件残留 | 极少数情况下 Windows 锁文件未释放 | WAL 模式成熟，正常关闭进程自动 checkpoint；文档注明正确关闭方式 |
| Webhook URL 配置错误 | 通知全部静默失败 | `/api/notify/test` 接口发测试消息验证；通知失败 fire-and-forget 不影响主业务 |

---

*文档结束。本机运行：`npm install && npm start`，打开 http://127.0.0.1:3000。*
