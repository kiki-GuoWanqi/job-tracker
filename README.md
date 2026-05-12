# 🎯 求职助手 JobTracker

> 从投递到 Offer，一站式管理求职全流程。内置 AI 辅助，让每次面试准备有据可依。

**[🔗 在线体验](https://kiki-guoWanqi.github.io/job-tracker/)** | 无需注册，打开即用

---

## 解决的问题

校招季同时投递几十家公司，Excel 太笨重、Notion 要搭模板、聊天记录里的面经过几天就找不到了——JobTracker 把这些碎片整合成一个工作台：

- 📋 **投递进度一眼看清** — 状态标签一键切换，超过 7 天未跟进自动提醒
- 🤖 **AI 帮你读懂 JD** — 粘贴职位描述，自动整理为结构化要点；截图也能 OCR 识别
- 🧠 **AI 面试建议** — 上传简历后，AI 对比你的简历 × JD，输出匹配度分析 + 准备方向 + 可能被问的问题
- 📝 **面经系统沉淀** — 按场次记录题目和回答，每道题可让 AI 生成参考答案做对比
- 🧪 **面试前自测** — 隐藏参考答案，模拟真实问答节奏
- 💾 **数据完全由你掌控** — 纯本地存储，可导出 / 导入 JSON，换设备无忧

---

## 技术栈

| 层 | 选型 | 理由 |
|---|------|------|
| 框架 | Vue 3 (CDN) | 响应式状态管理，单文件无构建 |
| UI | Tailwind CSS (CDN) | 原子化样式，无需额外组件库 |
| Markdown | marked.js | 渲染 AI 输出和 JD 格式化结果 |
| PDF 解析 | PDF.js (Mozilla) | 客户端提取简历 / JD 文字 |
| Word 解析 | mammoth.js | 客户端提取 .docx 文字 |
| AI | DeepSeek / 千问 API | 文本分析 + 图片 OCR，客户端直连 |
| 存储 | localStorage | 无服务器，数据归用户所有 |
| 部署 | GitHub Pages | 零成本，HTTPS 自带 |

**架构决策**：纯静态单页应用，零构建步骤，零后端依赖。所有 AI 调用直接从浏览器发出，API Key 仅存本地。

---

## 项目结构

```
job-tracker/
├── index.html              # 唯一应用文件（HTML + CSS + Vue SFC ≈ 1800 行）
├── PRD.md                  # 产品需求文档
├── memory-bank/
│   ├── design-document.md   # 功能设计、数据模型、验收标准
│   ├── tech-stack.md        # 技术选型与理由
│   ├── implementation-plan.md # 分步实施计划
│   ├── progress.md          # 执行日志
│   └── architecture.md      # 架构地图
└── README.md
```

---

## 产品设计亮点

- **状态机驱动**：投递状态非简单标签，而是有向流转（待投递 → 已投递 → 笔试 → 面试 → Offer / 挂），减少误操作
- **降级策略**：AI 能力设计了完整的 fallback 链路（DeepSeek ↔ 千问），单一服务不可用时不影响使用
- **渐进式复杂度**：核心功能（添加投递、改状态）零门槛使用；AI 功能需配置 Key 后按需开启
- **隐私优先**：无服务器、无埋点、无第三方数据上报，API Key 和简历数据不出浏览器

---

## 快速开始

1. 打开 [在线地址](https://kiki-guoWanqi.github.io/job-tracker/)
2. 点击「+ 添加投递」录入第一条记录
3. （可选）进入「设置」配置 DeepSeek 或千问 API Key，解锁 AI 功能
4. （可选）上传简历 PDF，获得个性化面试建议

**本地运行**：直接用浏览器打开 `index.html` 即可，无需安装任何依赖。
