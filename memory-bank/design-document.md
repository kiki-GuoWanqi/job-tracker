# 设计文档 — 大学生求职助手（JobTracker）

## 1. 范围与非目标

### 范围
- 投递记录的增删改查与状态流转
- 公司信息（简介 + JD）管理与 AI 格式化
- 基于简历 + JD 的 AI 面试建议
- 面经记录（按面试场次 → 题目列表）
- 面试前一键浏览页（公司信息 + AI 分析 + 面经汇总）
- 数据导出 / 导入（JSON）
- 简历上传（PDF / Word），提取文本后存储

### 非目标
- 不支持多用户 / 登录注册
- 不支持完整自动投递（浏览器自动化 / 模拟登录）
- 不支持移动端 App

### 范围扩展（get_jobs 借鉴阶段，2026-05-15 起）
- AI 打招呼语 / 求职信生成（基于 JD + 简历 + 求职偏好）
- 求职偏好配置（注入所有 AI 功能的 prompt）
- Webhook 通知（投递状态变更实时 + 每日摘要：明天面试 / 7+ 天未跟进）
- 投递统计面板（漏斗 / 月度趋势 / Top 公司响应率 / 平均周转）
- 半自动 JD 抓取（Boss MVP + 通用 fallback；抓不到时由现有截图 OCR 兜底）

---

## 2. 用户旅程

### 旅程 A：添加一条新投递
1. 打开工具，点击「添加投递」
2. 填写：公司名、岗位、投递日期、初始状态
3. 粘贴 JD 原文，点击「AI 格式化」→ 自动整理为结构化 Markdown
4. 填写公司简介（可选）
5. 点击「AI 分析」→ 结合已上传简历，生成「面试表现建议」
6. 保存，回到列表

### 旅程 B：更新投递状态
1. 在列表找到对应公司 → 点击状态标签
2. 从下拉菜单选择新状态（或输入自定义状态）
3. 自动保存

### 旅程 C：面试后记录面经
1. 进入某公司详情 → 切换到「面经」Tab
2. 点击「添加面试记录」
3. 填写：日期、轮次（一面 / 二面 / HR 面 / 自定义）
4. 逐条添加题目 + 自己的回答
5. 保存

### 旅程 D：面试前快速浏览
1. 在列表点击某公司的「面试前浏览」按钮
2. 进入只读聚合页，从上到下看到：
   - 公司名 + 岗位 + 状态
   - 公司简介
   - 格式化后的 JD
   - AI 面试建议
   - 全部面经（按时间倒序，每场含轮次 + 题目列表）

### 旅程 E：首次配置
1. 进入「设置」页
2. 粘贴 DeepSeek API Key（存 localStorage）
3. 上传简历文件（PDF / Word）→ 客户端提取文本 → 存 localStorage
4. 后续所有 AI 功能自动使用此配置

---

## 3. 功能行为细节

### 3.1 投递状态
**预设状态**（有序，反映招聘流程）：
- 待投递
- 已投递待回复
- 待笔试
- 笔试完待通知
- 面试中
- 已 Offer
- 已挂

**自定义状态**：用户可在设置页添加任意字符串，出现在下拉菜单末尾。

**状态颜色**（用于列表标签）：
| 状态 | 颜色 |
|------|------|
| 待投递 | 灰色 |
| 已投递待回复 | 蓝色 |
| 待笔试 | 橙色 |
| 笔试完待通知 | 靛蓝色 |
| 面试中 | 黄色 |
| 已 Offer | 绿色 |
| 已挂 | 红色 |
| 自定义 | 紫色 |

### 3.2 JD 格式化（AI）
- 输入：用户粘贴的原始 JD 文本
- 操作：点击「AI 格式化」按钮
- 输出：结构化 Markdown，固定包含以下段落（如原文有）：
  - 职位概述
  - 岗位职责
  - 任职要求
  - 加分项
  - 薪资福利
- 原始 JD 保留（隐藏，可展开查看）

### 3.3 AI 面试建议
- 输入：格式化后的 JD + 用户简历文本
- 操作：点击「AI 分析」按钮（需 JD 已格式化）
- 输出：Markdown 报告，包含：
  - 岗位核心匹配点（我的简历哪些经历最相关）
  - 潜在短板与准备方向
  - 面试中应重点强调的 2-3 个亮点
  - 可能被问到的问题方向

### 3.4 面经记录数据结构
每条面试记录包含：
- 日期（日期选择器）
- 轮次（预设：一面、二面、三面、HR 面；可自定义）
- 题目列表（每道题：题目文本 + 我的回答文本，均为多行输入）
- 备注（整场面试的补充说明）

### 3.5 面试前浏览页
- 独立路由（`#review/{id}`）
- 只读，不可编辑
- 打印友好（可选，后续迭代）
- 内容顺序：基本信息 → 公司简介 → JD → AI 建议 → 面经（倒序）

---

## 4. 数据模型

```typescript
// 存储 key：jobtracker_applications
type Application = {
  id: string                // uuid
  companyName: string
  position: string
  applicationDate: string   // ISO 日期 YYYY-MM-DD
  status: string            // 预设或自定义
  interviewRound: string    // 当前面试轮次（一面/二面/三面/其他面），仅 status=面试中 时有意义
  workCity?: string         // 工作城市
  companyBrief?: string     // 公司简介手写笔记，纯文本
  notes?: string            // 备注
  offerSalary?: string      // Offer 薪资（已 Offer 时填写）
  jdRaw?: string            // 原始粘贴的 JD
  jdFormatted?: string      // AI 格式化后的 Markdown

  // 关键时间
  examDate?: string         // 笔试日期
  nextInterviewDate?: string
  offerDeadline?: string    // Offer 截止时间

  // AI 相关
  resumeId?: string         // 关联到 Settings.resumes 中某份简历
  aiAnalysis?: string       // AI 面试建议 Markdown
  matchScore?: number       // 0-100 整数，AI 简历×JD 匹配度
  matchSummary?: string
  matchStrengths?: string[]
  matchGaps?: string[]
  matchRecommendation?: string
  matchScoreAt?: string     // ISO timestamp
  matchResumeId?: string    // 评分时所用简历 id（用于失效判断）
  companyResearch?: string  // AI 公司研究 Markdown（6 维度）
  companyResearchAt?: string

  // 子集合
  interviews: Interview[]
  tasks?: Task[]            // 任务清单（截止+完成）
  statusHistory?: StatusChange[]  // 状态变更时间轴（自动维护）
  createdAt: string         // ISO timestamp
  updatedAt: string
}

type StatusChange = {
  status: string            // 变更后的状态
  round: string             // 当时的面试轮次（仅 status=面试中 时有值）
  changedAt: string         // ISO timestamp
}

type Interview = {
  id: string
  date: string              // YYYY-MM-DD
  round: string             // 一面 / 二面 / 自定义
  questions: Question[]
  notes: string
}

type Question = {
  id: string
  question: string
  answer: string
  refAnswer?: string        // AI 生成的参考答案
}

type Task = {
  id: string
  content: string           // 任务内容
  dueAt: string             // YYYY-MM-DD，空字符串表示无截止
  done: boolean
  createdAt: string         // ISO timestamp
}

// 存储 key：jobtracker_settings
type Settings = {
  deepseekApiKey: string
  qwenApiKey: string

  // 多简历
  resumes: Resume[]
  defaultResumeId: string

  // 兼容字段（旧版本单简历，仅迁移用）
  resumeText: string
  resumeFileName: string

  customStatuses: string[]
}

type Resume = {
  id: string
  label: string             // 用户命名，如「算法岗版」「前端岗版」
  fileName: string
  text: string              // 提取后的纯文本
  createdAt: string
  updatedAt: string
}
```

---

## 5. 边界情况

| 场景 | 处理方式 |
|------|----------|
| 未配置 API Key 时点击 AI 功能 | 提示「请先在设置页填写 DeepSeek API Key」 |
| 未上传简历时点击 AI 分析 | 提示「请先上传简历」，或允许无简历模式（只基于 JD 分析） |
| JD 未格式化时点击 AI 分析 | 按钮置灰，提示先格式化 JD |
| AI 请求失败 / 超时 | 显示错误信息，不清空已有内容 |
| localStorage 超出限制（约 5MB） | 提示用户导出备份并清理旧数据 |
| 上传非 PDF/Word 文件 | 拒绝，提示支持的格式 |
| PDF 文字层缺失（扫描件） | 提取失败时提示「无法提取文字，请粘贴简历文本」，降级为手动粘贴 |

---

## 6. 验收标准

- [ ] 可添加 / 编辑 / 删除投递记录
- [ ] 状态可切换，含 6 个预设 + 自定义
- [ ] JD 可粘贴并触发 AI 格式化，结果展示为 Markdown
- [ ] AI 分析生成面试建议，需已有 JD 和简历
- [ ] 面经可按场次添加题目 + 回答
- [ ] 面试前浏览页聚合全部信息
- [ ] 数据可导出为 JSON，可从 JSON 导入恢复
- [ ] 设置页可保存 API Key + 上传简历
- [ ] 所有数据持久化到 localStorage，刷新不丢失
