# 技术栈 — JobTracker

## 决策原则
单 HTML 文件，直接浏览器打开，零构建步骤，零服务器依赖。

---

## 各层选型

### 应用框架
**Vue 3（CDN）**
- 通过 `<script src="https://unpkg.com/vue@3/dist/vue.global.js">` 引入，无需 npm
- 比原生 JS 更易维护响应式状态，比 React CDN 体积小
- 单文件内用 `createApp` 挂载

### UI 组件 / 样式
**Tailwind CSS（CDN Play）**
- `<script src="https://cdn.tailwindcss.com">` 一行引入
- 无需构建，直接用 class 排版
- 不引入额外组件库，保持轻量

### Markdown 渲染
**marked.js（CDN）**
- 渲染 JD 格式化结果和 AI 建议
- 轻量，无依赖

### PDF 解析
**PDF.js（CDN，Mozilla 官方）**
- `pdfjsLib` 从 CDN 加载
- 提取 PDF 文字层内容为纯文本
- 扫描件降级提示手动粘贴

### Word（.docx）解析
**mammoth.js（CDN）**
- 将 .docx 转为纯文本
- 与 PDF.js 并存，根据文件类型分支处理

### 存储
**localStorage**
- key `jobtracker_applications`：Application[] 序列化为 JSON
- key `jobtracker_settings`：Settings 对象
- 导出 / 导入：JSON 文件，通过 `<a download>` 触发下载，通过 `<input type="file">` 读取

### AI 接口
**DeepSeek API**
- 直接从浏览器 fetch 调用（CORS 已开放）
- Base URL：`https://api.deepseek.com/v1/chat/completions`
- 模型：`deepseek-chat`
- API Key 存 localStorage，每次请求从内存读取，不硬编码

### 路由
**Hash 路由（手写，无依赖）**
- `#list` — 投递列表（默认）
- `#add` — 添加投递
- `#detail/{id}` — 公司详情（信息 + JD + 面经）
- `#review/{id}` — 面试前浏览（只读聚合页）
- `#settings` — 设置

### 唯一 ID 生成
**`crypto.randomUUID()`**
- 浏览器原生，无需库

---

## 文件结构

```
D:\vibecoding_seekjob\
├── index.html          ← 唯一入口，包含全部 HTML / CSS / JS
├── memory-bank/
│   ├── design-document.md
│   ├── tech-stack.md
│   ├── implementation-plan.md
│   ├── progress.md
│   └── architecture.md
└── PRD.md
```

> 所有代码在 `index.html` 一个文件内实现，方便分发和备份。

---

## 关键约束

- 不使用 npm / node_modules
- 不使用任何构建工具（Vite、webpack 等）
- 所有 CDN 依赖均带版本锁定，避免未来 CDN 更新破坏功能
- DeepSeek API Key 仅存 localStorage，不出现在代码里
