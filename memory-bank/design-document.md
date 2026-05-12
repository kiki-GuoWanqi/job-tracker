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
- 不支持实时爬取 JD
- 不支持日历提醒 / 邮件通知
- 不支持移动端 App

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
  companyBrief: string      // 公司简介，纯文本
  jdRaw: string             // 原始粘贴的 JD
  jdFormatted: string       // AI 格式化后的 Markdown
  aiAnalysis: string        // AI 面试建议 Markdown
  interviews: Interview[]
  createdAt: string         // ISO timestamp
  updatedAt: string
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
}

// 存储 key：jobtracker_settings
type Settings = {
  deepseekApiKey: string
  resumeText: string        // PDF/Word 提取后的纯文本
  resumeFileName: string
  customStatuses: string[]
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
