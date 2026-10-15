# 📚 InkStream

> 全网搜书 · 智能分章 · EPUB 打包

小说 / 音乐 / 漫画 / 视频聚合下载器。多书源并行搜索，抓取目录与正文，前端直接打包成 EPUB 下载。
**Next.js 15 App Router** 全栈，部署在 Vercel。

![InkStream](https://github.com/user-attachments/assets/468d2aa8-0e89-4e6e-9f25-cef8a8b9e707)

## ✨ 功能

| 模块 | 说明 |
|---|---|
| 📖 **小说** | 多书源并行搜索 → 详情预览 → 抓目录 → 抓正文 → 打包 EPUB 下载 |
| 🎵 **音乐** | 六源聚合搜索（汽水 / 网易云 / 歌曲客 / QQ / 咪咕 / 酷我），解析播放地址 |
| 🖼️ **漫画** | 漫画搜索与图片浏览 |
| 🎬 **视频 / 相册** | 本地媒体库浏览（`video/`、`Photo album/`） |
| 💬 **弹幕** | 基于 Vercel KV 的弹幕存储与叠加显示 |
| 🎨 **UI** | iOS 灵动岛动效、玻璃拟态、粒子加载动画、深浅自适应阅读器 |

## 🚀 快速开始

需要 **Node.js 22.x**（`package.json` 的 `engines` 声明；Vercel 已停用 Node 20）。

```bash
# 1. 安装依赖
npm install

# 2. 配置环境变量（可选，仅弹幕功能需要）
cp .env.example .env.local
# 编辑 .env.local 填入 KV_REST_API_URL / KV_REST_API_TOKEN

# 3. 启动开发服务器
npm run dev
```

打开 **http://localhost:3000**。

> 改端口：`npx next dev -p 4000`

## 📜 脚本

| 命令 | 作用 |
|---|---|
| `npm run dev` | 开发服务器，热更新 |
| `npm run build` | 生产构建 |
| `npm run start` | 运行生产构建产物（需先 build） |
| `npm run lint` | `next lint` |

> 📌 **Node 版本要求 22.x。** 见 `package.json` 的 `engines` 字段，Vercel 20.x 已停用。

## 🗂️ 项目结构

```
app/                        Next.js App Router
├── layout.tsx              根布局（字体、全局样式）
├── page.tsx                首页入口
├── globals.css             Tailwind 指令 + 提取自原 index.html 的全局样式
└── api/
    ├── proxy/              CORS 代理（SSRF 校验、重定向、HTML 相对 URL 改写）
    ├── gbk-search/         GBK 编码搜索（书源站点多为 GBK）
    ├── browser-search/     多书源浏览器式抓取 + 各源解析器
    ├── browser-details/    书籍详情抓取
    ├── browser-cover/      封面查询（best-effort）
    ├── danmaku/            弹幕读写（Vercel KV）
    ├── migu|kuwo|gequke/   音乐源搜索
    ├── list-*/             下载 / 视频 / 相册列表
    ├── save-epub/          EPUB 落盘
    ├── cover/[...file]/    从 EPUB 中提取封面
    └── scraper/            自适应抓取（proxy / extract / gbk-search）
app/downloads|video|photo/  静态媒体服务（video 支持 Range 请求）
components/                 UI 组件（DynamicIsland / Reader / MusicSearch / …）
services/                   业务逻辑
├── source.ts               书源 Provider（完本阁 / 书库阁 / 顶点 / 笔趣阁 / 爱丽丝 / 本地）
├── musicSource.ts          六个音乐源聚合
├── epub.ts                 纯前端 EPUB 生成（JSZip）
└── legadoConverter.ts      阅读（Legado）书源规则转换
scrapling/                  自适应选择器（SmartSelector / AdaptiveFetcher）
lib/                        工具（下载目录解析等）
```

## 🔌 书源

**小说**（`services/source.ts` 的 `PROVIDERS`）：

完本阁 · 书库阁 · 顶点小说网 · 笔趣阁(GUI) · 爱丽丝书屋 · 本地书库
（支持通过 `SourceSelector` 开关，也支持导入 Legado 书源规则）

**音乐**（`services/musicSource.ts`）：汽水音乐 · 网易云 · 歌曲客 · QQ音乐 · 咪咕 · 酷我

## ⚙️ 环境变量

| 变量 | 必要性 | 说明 |
|---|---|---|
| `KV_REST_API_URL` | 弹幕功能必需 | Upstash Redis REST 端点 |
| `KV_REST_API_TOKEN` | 弹幕功能必需 | 对应 token |

未配置时 `/api/danmaku` 返回 500，**其余功能不受影响**。Vercel 上建 KV/Upstash 数据库会自动注入。

## ☁️ 部署到 Vercel

1. 把仓库推到 GitHub。
2. Vercel 新建项目，框架选 **Next.js**（会自动识别）。
3. 在 Project → Settings → Environment Variables 配置 `KV_REST_API_URL` / `KV_REST_API_TOKEN`。
4. 部署。

`vercel.json` 已配置 CORS 与安全响应头，无需额外改动。

> 📌 **Serverless 文件系统是只读的。** Vercel 上只有 `/tmp` 可写，所以 `save-epub` /
> `list-downloads` 这类落盘接口在云端是**临时**的（实例重启即丢）；本地开发没有此限制。
> EPUB 生成本身在前端完成，用户下载不受影响。

## 📖 文档

- `docs/git-auth.md` — 本机 Git / GitHub 认证方式
- `docs/source-vercel-options.md` — 书源在 Vercel 上可用的方案对比
- `docs/lightpillar-analysis.md` — LightPillar 光柱组件技术分析
- `CLAUDE.md` — 项目 agent 技能与约定
- `CONTEXT.md` — 项目领域术语表

## 📄 License

见 [LICENSE](./LICENSE)。
