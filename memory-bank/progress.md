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
