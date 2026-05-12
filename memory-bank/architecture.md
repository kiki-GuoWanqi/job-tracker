# 架构地图 — JobTracker

## 部署信息
- **在线地址**：`https://kiki-guoWanqi.github.io/job-tracker/`
- **GitHub 仓库**：`https://github.com/kiki-GuoWanqi/job-tracker`
- **部署方式**：GitHub Pages，main 分支自动部署
- **状态**：v1.0 已完成并上线

---

## 文件结构（当前态）

```
D:\vibecoding_seekjob\
├── index.html                      ← 唯一应用文件，全部 HTML/CSS/JS（~1860 行）
├── README.md                       ← 仓库门面，面向 HR 的项目展示
├── PRD.md                          ← 完整产品需求文档
├── .gitignore                      ← 排除 .claude/settings*.json
├── CLAUDE.md                       ← Agent 工作流配置
└── memory-bank/
    ├── design-document.md           ← 功能设计、数据模型、验收标准
    ├── tech-stack.md                ← 技术选型与理由
    ├── implementation-plan.md       ← 11 步实施计划（全部完成）
    ├── progress.md                  ← 执行日志
    └── architecture.md              ← 本文件，当前架构地图
```

---

## index.html 内部结构

```
<html>
  <head>
    CDN: Tailwind CSS, Vue 3, marked.js, PDF.js, mammoth.js
    <style> prose 样式、v-cloak </style>
  </head>
  <body>
    <div id="app" v-cloak>
      <!-- 全局遮罩层 -->
      <!-- 顶部导航栏（列表 / 设置） -->
      <!-- Hash 路由容器：list / add / edit / detail / review / settings -->
    </div>
    <script>
      // 1. 常量定义（状态预设、轮次选项、颜色映射）
      // 2. 数据层 — localStorage 读写（纯函数）
      //    - STORAGE.APPS / STORAGE.SETTINGS
      //    - loadApplications / saveApplications
      //    - loadSettings / saveSettings
      // 3. PDF.js / mammoth.js 文字提取
      // 4. AI 调用层
      //    - callDeepSeek / callTextAI（DeepSeek 优先，千问降级）
      //    - extractJDFromImage（千问 VL 优先，DeepSeek 降级）
      //    - JD 格式化 / AI 面试分析 / 参考答案生成
      // 5. Vue 3 createApp（单实例，全部响应式状态 + 方法）
      //    - Hash 路由解析
      //    - 列表筛选（状态 / 轮次 / 搜索）
      //    - 状态徽章 picker（状态 + 轮次 + Offer 薪资）
      //    - 面经 CRUD（内联表单，动态题目增删）
      //    - 设置页（API Key / 简历上传 / 自定义状态 / 数据备份）
      //    - 面试前浏览（自测模式）
      //    - 表单校验 + 保存 / 编辑 / 删除
    </script>
  </body>
</html>
```

## localStorage Keys
- `jobtracker_applications` — Application[] JSON（投递列表 + 嵌套面经）
- `jobtracker_settings` — Settings JSON（API Key、简历文本、文件名、自定义状态）

## CDN 依赖（版本锁定）
| 库 | 版本 | 用途 |
|---|------|------|
| tailwindcss | CDN play | 原子化样式 |
| vue | 3.4.21 | 响应式框架 |
| marked | 9.1.6 | Markdown 渲染 |
| pdf.js | 3.11.174 | PDF 文字提取 |
| mammoth | 1.6.0 | Word .docx 文字提取 |

## AI 降级策略
```
文本任务：DeepSeek API → 千问 qwen-plus（降级）
图片任务：千问 qwen-vl-plus → DeepSeek（降级）
均未配置 → 引导用户前往设置页
```
