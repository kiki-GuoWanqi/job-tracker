# 架构地图 — JobTracker

## 文件结构（目标态）

```
D:\vibecoding_seekjob\
├── index.html                      ← 唯一应用文件，含全部 HTML/CSS/JS
└── memory-bank/
    ├── design-document.md          ← 功能设计、数据模型、验收标准
    ├── tech-stack.md               ← 技术选型与理由
    ├── implementation-plan.md      ← 11 步实施计划
    ├── progress.md                 ← 执行日志
    └── architecture.md             ← 本文件，当前架构地图
```

## 当前状态
Step 1 完成。`index.html` 已存在，路由和导航栏可用，各页为占位内容。

## index.html 内部结构（规划）

```
<html>
  <head>
    CDN: Vue 3, Tailwind, marked.js, PDF.js, mammoth.js
  </head>
  <body>
    <div id="app">
      <!-- 导航栏 -->
      <!-- 路由视图容器 -->
    </div>
    <script>
      // 1. 数据层（localStorage 读写）
      // 2. AI 调用层（DeepSeek API）
      // 3. PDF/Word 解析
      // 4. Hash 路由
      // 5. Vue 组件（List, Form, Detail, Review, Settings）
    </script>
  </body>
</html>
```

## localStorage Keys
- `jobtracker_applications` — Application[] JSON
- `jobtracker_settings` — Settings JSON
