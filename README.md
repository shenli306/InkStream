# 📚 InkStream

> 全网搜书 · 智能分章 · EPUB 打包

小说下载器：多书源并行搜索 → 详情预览 → 抓目录与正文 → 分章 → 前端打包成 EPUB。**Next.js 15 App Router** 全栈，可部署在 Vercel。

![InkStream 首页](docs/screenshots/home.png)

## ✨ 功能

| 模块 | 说明 |
|---|---|
| 🔍 **搜索** | `auto` 模式并行聚合多个书源，跨源去重、按相关度过滤，搜索进度实时播报 |
| 📖 **详情预览** | 封面、作者、简介、章节数量、数据来源与可用状态 |
| 📚 **抓取与打包** | 抓目录 → 按源限流并行抓正文 → 分章 → 纯前端 EPUB 打包（JSZip） |
| ⏹ **随时取消** | 下载中可中断，`AbortSignal` 一路传到抓取循环与限流闸门 |
| 📱 **灵动岛** | 按状态形变（空闲 / 搜索 / 下载 / 打包 / 完成），进度环 + 百分比，点击展开面板看进度并可取消 |
| 📕 **阅读器** | 内置阅读，主题（暗 / 米黄 / 纯黑 / 护眼绿）、栏宽、字号、行距、段距可调并本地持久化 |
| 🎨 **视觉** | 黑穹顶 + 底部双角紫辉背景（令牌驱动）、玻璃胶囊、水墨装饰层 |

## 🚀 快速开始

需要 **Node.js 22.x**（见 `package.json` 的 `engines`）。无需任何环境变量，书源抓取都走服务端路由。

```bash
npm install
npm run dev
```

打开 **http://localhost:3000**。改端口：`npx next dev -p 4000`。

## 📜 脚本

| 命令 | 作用 |
|---|---|
| `npm run dev` | 开发服务器，热更新 |
| `npm run build` | 生产构建 |
| `npm run start` | 运行生产构建产物（需先 build） |
| `npm run lint` | `next lint` |

> ⚠️ `next.config.ts` 里设了 `typescript.ignoreBuildErrors` 与 `eslint.ignoreDuringBuilds`（迁移历史代码时不希望被 strict 报错挡住构建），所以 **`npm run build` 不会报类型错误**。改完代码请单独跑一次 `npx tsc --noEmit`。

## 🗂️ 项目结构

```
app/
├── layout.tsx               根布局（字体 / metadata）
├── page.tsx                 入口 → components/AppShell
├── tokens.css               设计令牌：色板 / 背景氛围 / 语义变量
├── globals.css              Tailwind 指令 + 全局样式 + 阅读主题类
├── reader.css               阅读器排版样式
├── api/                     Route Handlers（见下表）
├── downloads|video|photo/   本机媒体文件的静态读取路由
App.tsx                      主应用：搜索 / 预览 / 下载状态机
components/
├── AppShell.tsx             客户端挂载壳（原 SPA 只在浏览器渲染）
├── DynamicIsland.tsx        灵动岛：状态 → 尺寸档 / 进度环 / 展开面板
├── BookCard.tsx             搜索结果卡片
├── ChapterDrawer.tsx        章节目录抽屉
├── CuteProgress.tsx         取书进度条
├── Reader.tsx               阅读器
├── ReaderSettingsPanel.tsx  阅读设置面板
├── SourceSelector.tsx       书源开关（localStorage 持久化）
├── LightPillar.tsx          Three.js 光柱实验组件（当前未挂载，见 docs/lightpillar-analysis.md）
├── LightPillar.css          光柱组件样式（同上，当前未挂载）
├── reactbits/               react-bits 移植组件（AnimatedContent / ClickSpark / SpotlightCard）
dynamic-island.css           灵动岛样式（@property --island-progress 驱动进度环）
source-selector.css          书源选择器样式
services/
├── source.ts                书源统一出口（re-export ./sources）
├── epub.ts                  纯前端 EPUB 生成（JSZip）
├── gemini.ts                预留空壳，当前无引用
└── sources/
    ├── index.ts             聚合出口（调用方 from "./source" 无需改动）
    ├── registry.ts          书源注册表 / 启用配置 / 不可用原因
    ├── api.ts               搜索 / 详情 / 下载聚合：限流、重试、可取消
    ├── smart.ts             规则驱动的智能抓取（走 scrapling）
    ├── cover.ts             封面获取与占位图
    ├── providers/           七个书源实现
    └── shared/              常量、类型、DOM、抓取、限流、缓存、文本清洗
scrapling/                    自适应抓取基础设施（SmartSelector / AdaptiveFetcher / SelectorRegistry / ElementTracker）
hooks/useReaderSettings.ts    阅读设置（localStorage 持久化）
lib/paths.ts                  downloads 目录定位（Vercel 只读时回退 /tmp）
utils/cover.ts                封面 URL 解析
types.ts                      Novel / Chapter / AppState
sources/huanmengacg.json      Legado 书源规则样例
```

### API 路由

| 路由 | 作用 |
|---|---|
| `/api/proxy` | 跨域代理：SSRF 私网校验、重定向跟随、按**原始协议**改写 HTML 相对 URL |
| `/api/browser-search` | 服务端抓搜索页 + 各书源解析（GBK / GB18030 编码判定） |
| `/api/browser-details` | 书籍详情抓取（反爬检测 + 编码判定） |
| `/api/browser-cover` | 封面查询（best-effort） |
| `/api/gbk-search` | 关键词 GBK 编码后转发搜索 |
| `/api/list-downloads` | 列出 `downloads/` 下的 EPUB —— 本地书库的数据源 |
| `/api/save-epub` | EPUB 落盘 |
| `/api/cover/[...file]` | 从已下载的 EPUB 中提取封面 |
| `/api/scraper/proxy` · `/api/scraper/extract` · `/api/scraper/gbk-search` | AdaptiveFetcher + SmartSelector 的自适应抓取三件套 |

## 🔌 书源

**默认参与聚合搜索**（`services/sources/registry.ts` 的 `PROVIDERS`）：

| 书源 | 站点 | 备注 |
|---|---|---|
| 书库阁 | http://www.shukuge.com | 章节页 `#content` 有嵌套导航，已做残渣清洗 |
| 笔趣阁(GUI) | https://www.bqgicq.cc | 多域名备份（`BQGUI_HOSTS`） |
| 全本文学 | https://www.qbwx.org | 正则解析，不做 DOM |
| 本地书库 | `downloads/` | 只搜已下载文件，数据来自 `/api/list-downloads` |

**代码保留但默认置灰**（`SOURCE_UNAVAILABLE_REASONS`）：完本阁（`.jizai22.com` 域名不可达）、顶点小说网（原域名 DNS 失效）、爱丽丝书屋（连接持续超时）。它们仍可通过 `getProviderByName` 单独调用。

书源开关存在 `localStorage` 的 `inkstream_source_config`；新增书源：在 `services/sources/providers/` 写实现 → 在 `registry.ts` 的 `PROVIDERS` 注册 → 在 `services/sources/index.ts` 按需导出。

## 🛡️ 抓取层

- **统一出口**：浏览器端一律经 `/api/proxy` 取页，避开 CORS；带 UA / Referer、15s 超时、Cloudflare 拦截页过滤。
- **限流**：`services/sources/shared/ratelimit.ts` —— 按 host 串行 + 全局并发闸门，不同书源不同并发参数。
- **可取消**：`AbortSignal` 从 UI 传到 `fetchText` 与限流队列（`registerAbortSignal` / `DownloadCancelledError`）。
- **文本清洗**：`services/sources/shared/textClean.ts` 清掉站点导航残渣（`←` `→`、上一页 / 加入书签一类），只保留正文。

## 🌌 视觉

- **背景**：`app/tokens.css` 的 `--bg-atmosphere` —— 纯黑底 + 左右下角紫辉 + 底部紫晕，参数是按设计稿做数值拟合（不是手调）出来的，实测区域 MAE 1.4~2.9 / 255。
- **灵动岛**：状态驱动的尺寸分档 + `@property --island-progress` 平滑进度环 + 展开面板；玻璃底色用 `color-mix` 真半透明（74%），带内高光描边与噪点层。
- 移动端：

<img src="docs/screenshots/mobile.png" width="260" alt="移动端首页">

## 📖 文档

- `docs/git-auth.md` — Git / GitHub 认证方式
- `docs/source-vercel-options.md` — 书源在 Vercel 上的可用方案对比
- `docs/lightpillar-analysis.md` — LightPillar 光柱组件技术分析
- `docs/legado-source-converter.md` — Legado 书源规则转换
- `docs/agents/` — issue tracker / triage 标签 / 领域文档约定
- `CLAUDE.md` — agent 技能与仓库约定
- `CONTEXT.md` — 领域术语表（注：仍写着漫画 / 弹幕，待更新）

## ☁️ 部署到 Vercel

1. 把仓库推到 GitHub。
2. Vercel 新建项目，框架选 **Next.js**（自动识别）。
3. 部署即可 —— 不需要配置任何环境变量。

`vercel.json` 已配好 CORS 与安全响应头。

> 📌 **Serverless 文件系统只读**：只有 `/tmp` 可写，`lib/paths.ts` 会自动回退。所以 `/api/save-epub` 与 `/api/list-downloads` 在云端是**临时**的（实例重启即丢）；EPUB 自身在前端生成，用户下载不受影响。

## 📄 License

见 [LICENSE](./LICENSE)。
