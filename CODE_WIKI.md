# InkStream Code Wiki

## 项目概述

**InkStream** 是一个全栈 Web 应用，集成了小说搜索下载、音乐搜索播放和本地视频/相册管理功能。采用 React + TypeScript + Vite 构建，支持多书源小说下载为 EPUB 格式。

- **技术栈**: React 19, TypeScript, Vite 6, TailwindCSS
- **功能模块**: 小说搜索下载、音乐搜索播放、本地视频/相册浏览
- **部署方式**: Vercel (vercel.json)

---

## 项目架构

```
/workspace
├── api/                    # Vercel Serverless API
│   ├── proxy.js           # 通用代理服务 (CORS 解决)
│   ├── gequke.js          # 歌曲客音乐搜索API
│   ├── migu.js            # 咪咕音乐搜索API
│   ├── kuwo.js            # 酷我音乐搜索API
│   ├── danmaku.js         # 弹幕服务API
│   ├── browser-search.js  # 浏览器端搜索代理
│   └── browser-details.js # 浏览器端详情获取
├── components/            # React UI 组件
│   ├── App.tsx            # 主应用入口
│   ├── BookCard.tsx       # 小说卡片组件
│   ├── Reader.tsx          # 阅读器组件
│   ├── MusicSearch.tsx     # 音乐搜索组件
│   ├── VideoCard.tsx       # 视频卡片组件
│   ├── DynamicIsland.tsx    # 灵动岛组件
│   ├── CuteProgress.tsx    # 可爱进度条组件
│   ├── SourceSelector.tsx   # 书源选择器组件
│   └── ...
├── services/               # 业务逻辑服务
│   ├── source.ts           # 小说搜索/下载核心服务
│   ├── epub.ts             # EPUB 生成服务
│   ├── musicSource.ts       # 音乐搜索/播放服务
│   └── gemini.ts           # AI 服务
├── types.ts               # TypeScript 类型定义
├── index.tsx              # React 入口
├── index.html             # HTML 入口
├── vite.config.ts         # Vite 配置
├── tsconfig.json          # TypeScript 配置
└── package.json           # 项目依赖
```

---

## 核心类型定义 (types.ts)

### AppState 枚举

表示应用状态的有限状态机：

| 状态 | 值 | 说明 |
|------|-----|------|
| IDLE | 0 | 空闲状态 |
| SEARCHING | 1 | 搜索中 |
| PREVIEW | 2 | 预览搜索结果/书籍信息 |
| ANALYZING | 3 | 获取下载链接 |
| DOWNLOADING | 4 | 下载TXT文件 |
| PARSING | 5 | 解析TXT章节 |
| PACKING | 6 | 打包EPUB |
| COMPLETE | 7 | 完成 |
| ERROR | 8 | 错误 |

### Novel 接口

```typescript
interface Novel {
  id: string;                    // 小说唯一标识
  title: string;                 // 小说标题
  author: string;               // 作者
  description: string;          // 简介
  coverUrl?: string;            // 封面URL
  tags: string[];               // 标签数组
  status: 'Serializing' | 'Completed' | 'Unknown';  // 连载状态
  detailUrl: string;            // 详情页URL
  downloadUrl?: string;         // 下载链接
  chapters: Chapter[];          // 章节列表
  sourceName?: string;         // 来源名称
  sources?: NovelSource[];      // 多来源
}
```

### Chapter 接口

```typescript
interface Chapter {
  number: number;    // 章节序号
  title: string;     // 章节标题
  url?: string;      // 章节URL
  content?: string;  // 章节内容
}
```

### Music 接口 (musicSource.ts)

```typescript
interface Music {
  id: string;        // 歌曲ID
  name: string;      // 歌曲名
  artist: string;    // 艺术家
  album: string;     // 专辑
  cover: string;     // 封面
  duration: number;  // 时长(秒)
  url: string;       // 播放URL
  source: string;    // 来源: qishui/netease/gequke/qq/migu/kuwo
  isVip?: boolean;   // 是否VIP
}
```

---

## 主要模块详解

### 1. App.tsx - 主应用组件

**职责**: 应用状态管理、界面路由（小说/音乐/漫画切换）、核心业务流程控制

**关键状态**:
- `query`: 搜索关键词
- `state`: AppState 应用状态机
- `searchResults`: 搜索结果列表
- `selectedNovel`: 选中查看的小说
- `activeView`: 当前界面 ('novel' | 'music' | 'manga')

**核心流程**:

```
用户输入关键词
    ↓
handleSearch()
    ↓
searchNovel() → API调用
    ↓
显示搜索结果 (BookCard 网格)
    ↓
用户选择小说 → handleSelectNovel()
    ↓
getNovelDetails() → 获取详情
    ↓
startDownloadProcess()
    ↓
1. getNovelDetails() → 获取下载链接
2. downloadAndParseNovel() → 下载并解析
3. generateEpub() → 生成EPUB
4. 触发浏览器下载
```

**特殊功能**:
- 输入 `3068` → 打开书源选择器
- 输入 `zyd` → 查看本地视频库
- 输入 `shenli` → 查看相册

### 2. services/source.ts - 小说服务核心

**核心函数**:

#### searchNovel(keyword: string, sourceKey: string)
- 多源并行搜索小说
- 使用 p-limit 控制并发数
- 返回 Novel[] 数组

#### getNovelDetails(novel: Novel)
- 获取小说详细信息
- 抓取章节列表
- 返回完整 Novel 对象

#### downloadAndParseNovel(novel: Novel, onProgress?: (msg: string, percent: number) => void)
- 下载小说内容
- 按规则分章
- 返回带完整章节内容的 Novel

#### isRelevant(title, author, keyword)
- 智能搜索结果相关性检查
- 支持多关键词、拼音模糊匹配
- 返回 boolean

**书源 Provider 列表**:

| Key | 名称 | Base URL |
|-----|------|----------|
| wanbenge | 完本阁 | jizai22.com |
| local | 本地书库 | - |
| yeduji | 叶子辑 | yeduji.com |
| shukuge | 书库阁 | shukuge.com |
| dingdian | 顶点小说网 | 23ddw.net |
| bqgui | 笔趣阁 | bqgui.cc |
| xpxs | 新平小说 | xpxs.net |
| alicesw | 艾莉丝小说 | alicesw.com |

**代理策略** (PROXY_LIST):
1. 直接请求
2. 本地 Vite 代理 (开发环境)
3. api.codetabs.com 代理
4. corsproxy.io 代理
5. thingproxy.freeboard.io 代理
6. /api/proxy (Vercel API)

**缓存机制**:
- 5分钟搜索缓存
- 自动清理过期缓存
- 最大缓存 100 条

### 3. services/epub.ts - EPUB 生成

**核心函数**: generateEpub(novel: Novel, coverBlob?: Blob)

**生成流程**:
1. 创建 JSZip 实例
2. 生成 mimetype (STORE 压缩)
3. 生成 META-INF/container.xml
4. 生成封面 (可选)
5. 生成章节 XHTML 文件
6. 生成 content.opf (包文档)
7. 生成 toc.ncx (目录)
8. 返回 Blob

**XML 转义**: escapeXml() 处理特殊字符

### 4. services/musicSource.ts - 音乐服务

**核心函数**:

#### searchMusic(keyword: string)
- 并行调用 6 个音乐源
- 使用 Promise.allSettled
- 返回 MusicSearchResult

**音乐源**:

| 源 | 函数 | API |
|----|------|-----|
| qishui | searchQishuiMusic | api-v2.cenguigui.cn |
| netease | searchNeteaseMusic | api.xingzhige.com |
| gequke | searchGequkeMusic | /api/gequke |
| qq | searchQQMusic | cyapi.top |
| migu | searchMiguMusic | /api/migu |
| kuwo | searchKuwoMusic | /api/kuwo |

#### getMusicUrl(music: Music)
- 智能获取播放链接
- 按优先级尝试各源
- 包含 fallback 逻辑

#### downloadMusic(url: string, filename: string)
- 处理流式URL (.m4a, .m3u8)
- 通过代理下载
- 触发浏览器下载

---

## API 层详解

### /api/proxy (proxy.js)

通用代理服务，解决 CORS 问题。

**参数**:
- `url`: 目标URL (必需)
- `referer`: 自定义 Referer

**特性**:
- 自动设置 User-Agent
- 特殊网站 (咪咕、酷我) 使用专用 Headers
- 自动添加 CORS Headers
- 重试机制 (最多2次)
- 超时控制 (25秒)

### /api/gequke (gequke.js)

歌曲客音乐搜索 API。

**参数**:
- `keyword`: 搜索关键词

**返回值**: `{ code: 200, results: Music[] }`

### /api/migu (migu.js)

咪咕音乐搜索 API。

**功能**:
- 搜索歌曲
- 获取播放 URL
- 获取歌词

### /api/kuwo (kuwo.js)

酷我音乐搜索 API。

**功能**:
- 搜索歌曲
- 获取播放 URL (需要 Referer)

---

## 组件详解

### BookCard.tsx

小说卡片展示组件。

**Props**:
```typescript
interface BookCardProps {
  novel: Novel;
  onSelect: (novel: Novel) => void;
}
```

**功能**:
- 封面图片展示 (占位图处理)
- 状态标签 (已完结/连载中)
- 简介展开/收起
- 书源标签
- 章节数量统计

### Reader.tsx

阅读器模态框组件。

**Props**:
```typescript
interface ReaderProps {
  title: string;
  chapter: Chapter | null;
  onClose: () => void;
  onNext: () => void;
  onPrev: () => void;
  hasPrev: boolean;
  hasNext: boolean;
  isLoading: boolean;
}
```

**功能**:
- 全屏阅读体验
- 章节导航 (上一章/下一章)
- Markdown 内容渲染
- 玻璃态设计

### MusicSearch.tsx

音乐搜索与播放组件。

**特性**:
- 多源搜索聚合
- 浮动歌词动画
- 播放历史记录
- 歌单管理
- 下载功能
- 进度条控制
- 音量控制

**暴露方法** (MusicSearchRef):
```typescript
interface MusicSearchRef {
  getState: () => MusicState;
}
```

### DynamicIsland.tsx

灵动岛组件，模拟 iOS Dynamic Island。

**状态**:
- idle: 空闲
- pressing: 长按中
- shrinking: 收缩中
- circle: 圆形
- separating: 分离中
- separated: 已分离
- expanding: 展开中

**功能**:
- 状态进度展示
- 长按触发界面切换
- 音乐播放信息
- 下载进度

### CuteProgress.tsx

可爱风格进度条组件。

**Props**:
```typescript
interface CuteProgressProps {
  state: AppState;
  progress: number;
  message: string;
}
```

**特性**:
- 状态相关颜色
- 动态背景光效
- 加载动画 GIF
- 粒子效果

### SourceSelector.tsx

书源配置选择器。

**Props**:
```typescript
interface SourceSelectorProps {
  onConfirm: () => void;
  onCancel: () => void;
}
```

**功能**:
- 书源启用/禁用切换
- 本地存储配置
- 动画效果 (光束、线条)

### VideoCard.tsx

视频卡片组件。

**特性**:
- 懒加载缩略图
- 视口检测
- 缩略图队列生成
- 元数据提取

---

## 依赖关系

### 生产依赖

| 包 | 版本 | 用途 |
|----|------|------|
| react | ^19.2.0 | UI 框架 |
| react-dom | ^19.2.0 | React DOM |
| lucide-react | ^0.555.0 | 图标库 |
| jszip | ^3.10.1 | EPUB 打包 |
| p-limit | ^7.2.0 | 并发控制 |
| react-markdown | ^10.1.0 | Markdown 渲染 |
| three | ^0.182.0 | 3D 图形 |
| @react-three/fiber | ^9.5.0 | React Three.js |
| @react-three/drei | ^10.7.7 | Three.js 工具集 |
| @vercel/kv | ^3.0.0 | Vercel KV |
| jsdom | ^27.4.0 | DOM 解析 |
| iconv-lite | ^0.7.0 | 编码转换 |
| puppeteer | ^24.33.0 | 浏览器自动化 |

### 开发依赖

| 包 | 版本 | 用途 |
|----|------|------|
| vite | ^6.2.0 | 构建工具 |
| @vitejs/plugin-react | ^5.0.0 | React 插件 |
| typescript | ~5.8.2 | 类型系统 |
| @types/node | ^22.14.0 | Node 类型 |
| shadcn | ^4.0.0 | UI 组件库 |

---

## 项目运行方式

### 开发环境

```bash
# 安装依赖
npm install

# 启动开发服务器
npm run dev

# 访问 http://localhost:5173
```

### 构建生产版本

```bash
npm run build
# 输出到 dist/ 目录
```

### 预览生产构建

```bash
npm run preview
```

### Windows 快速启动

```bash
run.bat
```

---

## Vite 配置 (vite.config.ts)

```typescript
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      '/api/proxy': '...',
      // 书源代理配置
    }
  }
});
```

---

## Vercel 部署配置

`vercel.json` 配置:
- rewrites: 所有路径指向 index.html
- headers: 静态资源缓存策略

---

## 注意事项

### CORS 代理优先级
1. 本地开发: Vite 代理
2. 生产环境: /api/proxy

### 编码处理
- GBK 编码网站使用 `gb18030` 解码
- XML 内容使用 escapeXml() 转义

### 缓存策略
- 搜索结果缓存 5 分钟
- 图片资源长缓存 (7天)

### 性能优化
- 使用 `useMemo` 缓存计算
- 组件懒加载
- 图片懒加载
- 视频缩略图队列生成

---

## 扩展指南

### 添加新书源

1. 在 `services/source.ts` 中定义新的 Provider
2. 实现 `search()` 和 `getDetails()` 方法
3. 在 `SourceProvider[]` 数组中注册

### 添加新音乐源

1. 在 `services/musicSource.ts` 中添加搜索函数
2. 在 `searchMusic()` 中调用
3. 在 `getMusicUrl()` 中添加 fallback 逻辑

### 添加新功能模块

1. 创建新组件 (components/)
2. 添加服务逻辑 (services/)
3. 在 App.tsx 中添加路由/切换逻辑

---

*Last Updated: 2026-05-13*
