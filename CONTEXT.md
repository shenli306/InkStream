# Ubiquitous Language

## 项目领域术语

| Term | Definition | Aliases to avoid |
|------|------------|------------------|
| **InkStream** | 网络小说下载器：跨书源搜索 → 抓取分章 → 纯前端打包 EPUB | 流媒体应用, 漫画阅读器, 浏览器 |
| **Source** | 书源（小说来源站点，如书库阁 / 笔趣阁 / 全本文学 / 爱丽丝书屋），实现在 `services/sources/providers/` | 源, 来源, 动漫源 |
| **Provider** | 单个书源的抓取实现，固定四件事：搜索 / 详情 / 目录 / 正文 | 插件, 适配器 |
| **Novel** | 一本书（搜索结果或详情页拿到的对象） | 书籍, 小说对象 |
| **Chapter** | 章节（小说的第 N 章） | 话, 卷 |
| **EPUB** | 打包产物格式，由 `services/epub.ts` 在浏览器里用 JSZip 生成 | 电子书 |
| **Reader** | 阅读器组件（正文渲染 + 排版设置） | 阅读界面 |
| **Search** | 跨书源聚合搜索（`auto` 并发 + 跨源去重 + 相关度过滤） | 查找 |
| **DynamicIsland** | 顶部灵动岛：搜索 / 下载 / 打包 / 完成的状态与进度载体 | 灵动岛, 状态条 |

## 技术术语

| Term | Definition | Aliases to avoid |
|------|------------|------------------|
| **Component** | React 组件 | 部件 |
| **Service** | 业务逻辑服务层 | 服务 |
| **API** | 外部接口 | 接口 |
| **State** | 组件状态 | 状态管理 |
| **Props** | React 属性 | 参数 |
