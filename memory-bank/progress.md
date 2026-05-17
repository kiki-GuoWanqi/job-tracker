# 执行日志 — JobTracker

## Bootstrap 阶段
- [2026-05-10] 完成 PRD、设计文档、技术栈、实施计划
- [2026-05-10] Step 1 完成：index.html 骨架 + Hash 路由，5 个占位页，CDN 全部引入
- [2026-05-10] Step 2 完成：localStorage 数据层，loadApplications/saveApplications/loadSettings/saveSettings，watch 自动持久化，导出/导入 JSON
- [2026-05-10] Step 3 完成：投递列表页，状态彩色徽章，状态筛选下拉，按日期倒序，空状态引导，查看详情/面试前浏览入口
- [2026-05-10] Step 4 完成：添加/编辑表单（#add/#edit/{id}），字段校验，保存/取消/删除，表单初始化 watch，详情页临时编辑入口
- [2026-05-10] Step 5 完成：详情页基本信息Tab+面经Tab占位，可点击徽章切换状态，JD原文/Markdown渲染，prose CSS
- [2026-05-10] Step 6 完成：面经Tab，内联表单，日期/轮次/备注/题目动态增删，记录卡片展示Q&A，编辑/删除
- [2026-05-10] Step 7 完成：设置页，DeepSeek API Key，PDF/docx简历上传提取+手动粘贴降级，自定义状态增删，数据备份移至末尾
- [2026-05-10] Step 8 完成：AI JD格式化，callDeepSeek全局函数，formatJDForm（表单内格式化+预览），formatJD（详情页直接格式化），错误提示，未配置Key时引导至设置页
- [2026-05-11] Step 9 完成：AI 面试建议分析，analyzeWithAI函数，详情页基本信息Tab新增"AI 面试建议"卡片，需JD已格式化+简历已上传，结果存aiAnalysis字段，Markdown渲染，重新分析有确认弹窗
- [2026-05-11] Step 10 完成：面试前浏览页（#review/{id}），公司&岗位头部、公司简介、格式化JD、AI建议、面经记录（按日期倒序，展开题目+回答+参考答案），记录不存在时友好提示
- [2026-05-11] Step 11 完成：收尾打磨——列表卡片新增JD预览（前100字+展开/收起toggle），移除测试按钮，全功能收尾

## 部署与文档阶段
- [2026-05-12] Git 初始化，配置 .gitignore，关联远程仓库 `kiki-GuoWanqi/job-tracker`
- [2026-05-12] 推送到 GitHub 并开启 GitHub Pages，在线地址 `https://kiki-guoWanqi.github.io/job-tracker/`
- [2026-05-12] 重写 PRD.md — 从草稿升级为完整产品需求文档（竞品对比、状态机、数据模型、版本路线）
- [2026-05-12] 新增 README.md — 仓库门面，面向 HR 的项目展示（产品价值、技术栈、架构亮点、快速开始）
- [2026-05-12] memory-bank 同步更新，记录部署态与文档态变更

## 迭代记录
- [2026-05-13] 新增日历视图（#calendar）：5 类事件（投递/笔试/面试/Offer截止/面经记录）聚合到月历，类型筛选 chip + 选中日期详情面板 + 未来 7 天预览，导航栏增加「日历」入口与今日事件徽章。
- [2026-05-13] Kanban 拖拽：列表页 4 列看板支持 HTML5 native drag-and-drop，跨列拖拽即更新 status（面试中/已 Offer 落点不携带 round/salary，留给 badge picker 精修）；卡片拖拽时半透明，目标列虚线高亮。
- [2026-05-13] 任务/截止系统：Application 新增 tasks[]，详情页「任务清单」卡片支持增删/勾选/截止日期；列表页顶部「今日待办」聚合所有跨投递的「未完成 + 截止 ≤ 今天」任务，按紧急度排序，逾期红色高亮。
- [2026-05-13] AI 公司研究：详情页 + 面试浏览页新增「AI 公司研究」卡片，调用 COMPANY_RESEARCH_SYSTEM/USER 提示词，输出 6 维度结构化 Markdown（业务/动态/产品/竞品/文化/面试方向），与手写「公司简介」字段并存。
- [2026-05-13] 多简历管理：Settings.resumes[] + defaultResumeId，旧 resumeText 自动迁移为默认简历；每条投递可关联 resumeId，AI 分析/匹配评分时使用关联简历。
- [2026-05-13] 状态变更时间轴：Application 新增 statusHistory[]，每次 status/interviewRound 变化（selectStatus / selectRound / selectOfferSalary / Kanban 拖拽 / saveApp 编辑）自动追加一条记录；详情页 hero 标题与右侧按钮之间显示横向时间轴（含状态点 + 标签 + MM/DD），活动状态点带呼吸动画；loadApplications 含历史数据迁移（缺失字段时根据 createdAt + 当前状态补一条）。
- [2026-05-13] 详情页关键时间卡升级为始终显示 3 槽位（笔试 / 下次面试 / Offer 截止），透明 input[type=date] 覆盖整槽实现就地点击编辑，已填写槽位 hover 右上角显示 ✕ 单独清除；颜色按 daysUntil 分级（今天红/明天橙/一周内琥珀/远期与已过中性灰）。

## v2.0 前后端改造（2026-05-15）

- [2026-05-15] Step 1 完成：Node.js + Express 后端骨架，绑 127.0.0.1:3000，静态服务挂仓库根目录，express-rate-limit 限流 AI 端点
- [2026-05-15] Step 2 完成：因 better-sqlite3 在 Node 24 上需要 VS Build Tools 编译失败，改用 Node 22.5+ 内置 `node:sqlite`（DatabaseSync），零原生依赖；schema.sql 含 4 张表（applications / status_history / resumes / settings），启动开 WAL + foreign_keys
- [2026-05-15] Step 3 完成：`/api/applications` 全套 CRUD，mapper 层处理 snake↔camel + JSON 列序列化（interviews/tasks/matchStrengths/matchGaps），独立 `POST /:id/status` 端点同步追加 status_history
- [2026-05-15] Step 4 完成：`/api/resumes` CRUD 与 `/api/settings`（**只返回 hasDeepseekKey/hasQwenKey 布尔，永不暴露明文 Key**），cURL 测试通过
- [2026-05-15] Step 5 完成：`server/services/{ai-deepseek,ai-qwen}.js` 双通道，`/api/ai/text` DeepSeek 优先→qwen 降级，`/api/ai/vision` qwen-vl 优先→DeepSeek 降级，AbortController 90s 超时，purpose 字段供日志
- [2026-05-15] Step 6 完成：`/api/backup/export` 与 `/api/backup/import`（事务全清重建），格式与 v1 导出兼容
- [2026-05-15] Step 7 完成：把 index.html L2392-4195 的 `<script>` 块抽出到 `assets/app.js`，新增 `assets/api.js` fetch 封装层，index.html 只保留模板 + CDN + `<script src="/assets/{api,app}.js">`
- [2026-05-15] Step 8 完成：前端 STORAGE 层全部走 fetch；保留 deep watch + WeakMap 序列化对比 + 500ms debounced flushDirty，每个 dirty app 走 `PUT /api/applications/:id`；新建/删除/状态切换走显式 endpoint；首屏 splash + onMounted 异步加载 applications/settings/resumes
- [2026-05-15] Step 9 完成：前端 callTextAI / extractJDFromImage 改走后端代理；设置页 API Key 输入框替换为「已配置（服务器 .env）」/「未配置」彩色徽章；新增「测试连接」按钮（发 ping 到 /api/ai/text）
- [2026-05-15] Step 10 完成：localStorage 迁移弹窗（onMounted 检测 `jobtracker_applications` 非空且后端为空时弹），一键调 /api/backup/import；迁移后原 key 改名为 `*_migrated_<ts>` 保留；设置页常驻「从浏览器迁移旧数据」按钮兜底
- [2026-05-15] 端到端验证通过：Playwright 测试 splash 消失、设置页徽章正确显示、API 创建→刷新→数据仍在、PUT 整对象保存、状态切换 status_history 增长、DELETE 后 UI 消失，全程无 page error
- [2026-05-15] 多 provider 重做：新增 GPT (OpenAI) 与 Claude (Anthropic) 两家服务商；前端「设置 → AI 模型配置」可改写 Key/Base URL/文本模型/视觉模型；新增「AI 功能路由」表为 6 个 AI 功能独立指定服务商；后端 `ai-config.js` 统一管理 providers/routing，services 抽象为 `{ apiKey, baseUrl, model, ... }` 统一签名，`/api/ai/*` 按 purpose 路由并自动降级；API 永不返回 Key 明文，只返回 `keyPreview`（脱敏前 4 后 4）；`.env` 中已有 Key 作为初始默认值（自动加载，前端写入会覆盖）
- [2026-05-15] 测试连接严格化 + OpenAI 兼容：`/api/ai/text`、`/api/ai/vision` 新增 `provider`/`noFallback` 参数，前端「测试连接」不再临时改 routing，直接强制目标 provider 且失败不降级；OpenAI service 移除硬编码 `temperature` 以兼容 GPT-5 / o 系列只接受默认值的模型

## get_jobs 借鉴增强阶段（2026-05-15 起）

- [2026-05-15] **Phase 1.1 — AI 打招呼语 + 求职信生成**：新增 2 个 purpose（`greeting_message`、`cover_letter`）到 `ai-config.js`，默认走 deepseek；`applications` 表通过 `runMigrations()` 添加 4 列（`greeting_message`/`greeting_message_at`/`cover_letter`/`cover_letter_at`），`mappers.js` 同步映射；前端详情页 AI 公司研究下方新增两张卡片，配套 `generateGreeting` / `generateCoverLetter` 函数复用 `callTextAI` 通道；新增通用 `copyToClipboard(text, key)` 带 2 秒「✓ 已复制」反馈；设置页 AI 路由表自动多出 2 行（依赖现有 `v-for="purpose in settings.aiPurposes"`）；prompt 要求纯文本输出（无 markdown）便于直接粘贴到 Boss / 邮件场景
- [2026-05-15] **Phase 1.2 — 求职偏好配置 + Prompt 注入**：`settings` KV 新增 `job_preferences` 项（targetPositions/targetCities/salaryMin/Max/companyTypes/urgency），后端 `normalizePreferences` 规范化；前端 `EMPTY_PREFS()` + `buildPreferencesContext()` 把偏好渲染成 prompt 上下文（无内容时返回空串）；注入到 5 个 AI 功能 prompt 末尾：interview_analysis / company_research / greeting_message / cover_letter / match_score（JD 格式化与参考答案故意不注入）；设置页 AI 模型配置上方新增「求职偏好」卡片，目标岗位/城市用顿号或逗号分隔的文本输入（`arrayTextModel` computed 双向绑定），公司类型 chip 多选，紧迫度 chip 单选；改动经现有 settings flush 链路 0.5s debounce 自动保存
- [2026-05-15] **Phase 2.1 — Webhook 通知 + Scheduler**：新增 `server/services/notifier.js`（adapter 模式：`generic`/`wechat_work` 两个 channel），`notify(event, payload)` 主入口失败静默不阻塞业务；`server/scheduler.js` 每小时 tick 一次，09:00-10:00 窗口内发一次「每日摘要」（明天的面试 + 7+ 天未跟进、跳过已 Offer / 已挂），KV `notify_state.lastDailyAt` 去重；`applications.js` 的 `changeStatus` 在状态/轮次实际变化时 fire-and-forget 推送 `status_changed` 事件；settings KV 新增 `notify_settings`（webhookUrl/channel/events），返回前端时 URL 脱敏只保留 host + 后 6 位；`/api/notify/test` 强制发测试消息、`/api/notify/trigger-daily` 调试用绕过窗口；设置页加「Webhook 通知」卡片，URL 用 draft 单独管理避免脱敏值污染编辑（空字符串=保留旧值，`__CLEAR__` 哨兵值=清除），手动保存而非 debounce 以避免每个键击 PUT 一次
- [2026-05-15] **Phase 2.2 — 数据统计面板**：新增 `server/routes/stats.js` 的 `/api/stats/overview`，所有聚合在 SQL 完成（按 status 分组的 5 段漏斗、近 6 个月趋势补零、Top10 公司响应率、status_history 算两段平均周转）；自定义状态归到「已投递」桶，「响应」=状态脱离待投递/已投递待回复；前端新增 `#stats` 路由 + 导航入口「数据」；引入 Chart.js 4.4.1 CDN，画水平漏斗条形图 + 月度趋势折线图，Top 公司用表格、周转用 KPI 卡；首次进页或刷新都重新 fetch + destroy 旧 chart 实例
- [2026-05-15] **Phase 3 — 半自动 Boss JD 抓取**：新增 `server/services/scrapers/boss.js` 的 `scrapeJob(url)`（含通用 fallback），用浏览器 UA + regex 提取 `<title>` / `og:title` / `og:description` / `meta description`，按 Boss 标题常见格式（`岗位_公司_BOSS直聘`、`岗位 - 公司 - 25-40K - 直聘`）拆出 companyName/position/salary；检测「访问异常 / 安全验证」关键字和过短壳页面，置 `blocked` 标志并设清晰 `note` 引导用户切到截图 OCR；不引入 cheerio，保持零原生依赖原则；新增 `/api/scrape/job` 路由，15s 超时；前端 add 模式表单顶部加 Beta 抓取卡片，**只覆盖空字段不抢用户已有输入**；resetForm 联动清空抓取状态；Boss 反爬强，乐观情况能拿到标题，常见情况是空壳页面，兜底由现有 `jd_ocr` 截图流程承接

- [2026-05-17] **全网情报聚合 Agent**：新增 `intel_summary` AI purpose + 2 列（`intel_json`/`intel_at`，runMigrations 自动补）+ 新 KV `tavily_key`（沿用脱敏模式）；后端把 `routes/ai.js` 的 `callWithFallback` 抽到 `services/ai-router.js` 供内部复用；新增 `services/intel/{tavily,queries,index}.js` 与 `routes/intel.js`：用户在投递详情按按钮 → POST `/api/intel/search` → Tavily 并发跑 7 条 query（笔/面/薪 3 维度 × 2-3 变体，include_domains=牛客/看准/知乎等）→ 去重打编号 → 走 `intel_summary` 路由 LLM 输出结构化 JSON（writtenTests/interviews 按轮次/salary，每条带 sourceIndex + confidence）→ 写回 `applications.intel_json`；前端详情页加「全网情报」Tab，三块折叠面板 + 全部来源；设置页「模型配置」加 Tavily Key 卡片；`/api/intel/*` 复用现有 `aiLimiter`；mappers 加 `JSON_OBJECT_FIELDS` 区分对象型 JSON 列与数组型；runIntelSearch 用 `suppressWatch + lastSentByAppId` 模式避免 watch 把 intel 又 PUT 回后端

## 后续迭代待办
- [ ] 投递时间线可视化
- [x] 统计分析面板（转化率、通过率）— Phase 2.2 完成
- [ ] PWA 离线支持
- [ ] 多设备同步（WebDAV / Gist）
- [ ] AI Mock Interview / 题库
- [ ] 多平台 JD 抓取（拉勾 / 猎聘 / 智联），Phase 3 已留 adapter 扩展点
- [ ] 通知通道扩展（钉钉 / 飞书 / Slack），Phase 2.1 已留 adapter 扩展点
