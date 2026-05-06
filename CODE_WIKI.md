# InkStream Code Wiki

## 一、项目概述

**InkStream** 是一个基于 React + TypeScript 的小说下载器应用，支持全网小说搜索、智能分章解析和 EPUB 文件打包下载。项目采用现代化的 UI 设计，集成了灵动岛（Dynamic Island）交互体验，同时支持音乐搜索、视频管理和相册浏览等扩展功能。

### 1.1 项目定位

- **核心功能**：小说搜索、章节抓取、EPUB 生成
- **扩展功能**：音乐搜索、本地视频管理、相册浏览
- **技术亮点**：多源代理轮换、智能内容解析、蓝粉渐变美学设计

### 1.2 技术栈

| 分类 | 技术 | 版本 |
|------|------|------|
| 框架 | React | ^19.2.0 |
| 语言 | TypeScript | ~5.8.2 |
| 构建工具 | Vite | ^6.2.0 |
| 样式 | TailwindCSS | - |
| 图标 | lucide-react | ^0.555.0 |
| 压缩 | jszip | ^3.10.1 |
| 并发控制 | p-limit | ^7.2.0 |
| 浏览器自动化 | puppeteer | ^24.33.0 |

---

## 二、项目架构

### 2.1 目录结构

```
InkStream/
├── api/                    # 服务端 API 接口
│   ├── browser-details.js   # 浏览器详情抓取
│   ├── browser-search.js    # 浏览器搜索
│   ├── danmaku.js           # 弹幕系统
│   ├── gbk-search.js        # GBK 编码搜索代理
│   ├── gequke.js            # 歌曲库 API
│   ├── kuwo.js              # 酷我音乐 API
│   ├── migu.js              # 咪咕音乐 API
│   └── proxy.js             # 通用代理
├── components/              # React 组件
│   ├── BookCard.tsx         # 书籍卡片组件
│   ├── CuteProgress.tsx     # 可爱进度条
│   ├── DanmakuOverlay.tsx   # 弹幕覆盖层
│   ├── DynamicIsland.tsx    # 灵动岛组件
│   ├── LightPillar.tsx/css  # 光柱特效
│   ├── MangaSearch.tsx      # 漫画搜索
│   ├── MusicSearch.tsx      # 音乐搜索
│   ├── Reader.tsx           # 阅读器组件
│   ├── SourceSelector.tsx   # 书源选择器
│   ├── VideoCard.tsx        # 视频卡片
│   └── VideoModal.tsx       # 视频弹窗
├── services/                # 业务服务层
│   ├── epub.ts              # EPUB 生成服务
│   ├── gemini.ts            # Gemini AI 服务
│   ├── musicSource.ts       # 音乐源服务
│   └── source.ts            # 小说源服务
├── types.ts                 # 类型定义
├── App.tsx                  # 主应用组件
├── index.tsx               # 入口文件
├── vite.config.ts          # Vite 配置
└── package.json            # 依赖配置
```

### 2.2 模块职责

| 模块 | 职责 | 核心功能 |
|------|------|----------|
| **api/** | 服务端接口代理 | 浏览器渲染、GBK编码转换、音乐API代理 |
| **components/** | UI 组件层 | 灵动岛、书籍卡片、阅读器、进度条等 |
| **services/** | 业务逻辑层 | 小说源管理、EPUB生成、音乐搜索 |
| **types.ts** | TypeScript 类型定义 | 小说、章节、应用状态等类型 |

### 2.3 核心数据流

```
用户搜索 → searchNovel() → 多源并发搜索 → 结果聚合 → 展示搜索结果
    ↓
选择小说 → getNovelDetails() → 获取章节列表 → 展示详情页
    ↓
点击下载 → downloadAndParseNovel() → 抓取章节内容 → generateEpub() → 下载EPUB
```

---

## 三、核心类型定义

### 3.1 主要接口

```typescript
// types.ts
export interface Chapter {
  number: number;        // 章节序号
  title: string;         // 章节标题
  url?: string;          // 章节URL
  content?: string;      // 章节内容
}

export interface Novel {
  id: string;            // 唯一标识
  title: string;         // 小说标题
  author: string;        // 作者
  description: string;   // 简介
  coverUrl?: string;     // 封面URL
  tags: string[];        // 标签列表
  status: 'Serializing' | 'Completed' | 'Unknown';  // 状态
  detailUrl: string;     // 详情页URL
  downloadUrl?: string;  // 下载链接
  chapters: Chapter[];   // 章节列表
  sourceName?: string;   // 来源名称
  sources?: NovelSource[];
}

export interface NovelSource {
  name: string;          // 源名称
  url: string;           // 源URL
}

export enum AppState {
  IDLE,           // 空闲
  SEARCHING,      // 搜索中
  PREVIEW,        // 预览状态
  ANALYZING,      // 分析中
  DOWNLOADING,    // 下载中
  PARSING,        // 解析中
  PACKING,        // 打包中
  COMPLETE,       // 完成
  ERROR           // 错误
}
```

---

## 四、核心服务详解

### 4.1 小说源服务 (source.ts)

#### 4.1.1 服务架构

`source.ts` 是核心业务服务，负责小说搜索、详情获取和章节抓取。采用**策略模式**设计，支持多书源扩展。

#### 4.1.2 书源提供器接口

```typescript
interface SourceProvider {
  key: SourceKey;                                   // 书源标识
  name: string;                                     // 书源名称
  baseUrl: string;                                  // 基础URL
  search: (keyword: string) => Promise<Novel[]>;    // 搜索方法
  getDetails: (novel: Novel) => Promise<Novel>;     // 获取详情
  getChapterContent?: (chapter: Chapter) => Promise<string>;  // 获取章节内容
}
```

#### 4.1.3 支持的书源

| 书源 | Key | 基础URL | 编码 |
|------|-----|---------|------|
| 完本阁 | wanbenge | https://www.jizai22.com | GBK |
| 顶点小说 | dingdian | https://www.23ddw.net | UTF-8/GBK |
| 夜读集 | yeduji | https://www.yeduji.com | UTF-8 |
| 书库阁 | shukuge | http://www.shukuge.com | UTF-8 |
| 笔趣阁 | bqgui | https://www.bqgui.cc | UTF-8 |
| 本地书库 | local | - | - |

#### 4.1.4 关键函数

**searchNovel()** - 统一搜索入口

```typescript
export const searchNovel = async (keyword: string, sourceKey: string): Promise<Novel[]>
```

- **功能**：根据关键词搜索小说，支持多源聚合
- **参数**：
  - `keyword`: 搜索关键词
  - `sourceKey`: 书源标识，`auto` 表示自动选择最优源
- **返回**：小说列表

**downloadAndParseNovel()** - 下载并解析小说

```typescript
export const downloadAndParseNovel = async (
  novel: Novel, 
  onProgress?: (msg: string, percent: number) => void
): Promise<Novel>
```

- **功能**：批量下载章节内容并填充到小说对象
- **参数**：
  - `novel`: 小说对象
  - `onProgress`: 进度回调函数
- **返回**：填充完整内容的小说对象

**fetchText()** - 带代理轮换的文本获取

```typescript
const fetchText = async (url: string, options?: RequestInit, encoding?: string): Promise<string>
```

- **功能**：通过多级代理获取网页内容，自动处理编码转换
- **代理优先级**：
  1. Vercel API 代理
  2. 本地 Vite 代理
  3. 公共代理（codetabs、corsproxy）
  4. 直接请求

**isRelevant()** - 搜索结果相关性判断

```typescript
export const isRelevant = (title: string, author: string, keyword: string): boolean
```

- **功能**：智能判断搜索结果与关键词的相关性
- **匹配策略**：
  - 完全匹配（最高优先级）
  - 包含匹配
  - 多关键词拆分匹配
  - 拼音首字母匹配
  - 权重评分（≥30分为相关）

### 4.2 EPUB 生成服务 (epub.ts)

#### 4.2.1 EPUB 结构

```
EPUB 文件结构：
├── mimetype                    # MIME类型标识
├── META-INF/
│   └── container.xml           # 容器描述
└── OEBPS/
    ├── content.opf             # 元数据和目录
    ├── toc.ncx                 # NCX格式目录（兼容旧版阅读器）
    ├── cover.jpg/png           # 封面图片（可选）
    └── chapter_1.xhtml         # 章节内容
    └── chapter_2.xhtml
    └── ...
```

#### 4.2.2 核心函数

**generateEpub()** - 生成 EPUB 文件

```typescript
export const generateEpub = async (novel: Novel, coverBlob?: Blob): Promise<Blob>
```

- **功能**：将小说数据打包为标准 EPUB 文件
- **参数**：
  - `novel`: 完整的小说对象（含章节内容）
  - `coverBlob`: 封面图片 Blob（可选）
- **返回**：EPUB 文件 Blob

**escapeXml()** - XML 转义

```typescript
const escapeXml = (unsafe: string): string
```

- **功能**：处理 XML 特殊字符，防止注入攻击
- **转义规则**：`<` → `&lt;`, `>` → `&gt;`, `&` → `&amp;` 等

---

## 五、核心组件详解

### 5.1 DynamicIsland（灵动岛组件）

**位置**：`components/DynamicIsland.tsx`

**功能**：实现类似 iOS 灵动岛的交互效果，展示应用状态和操作进度

#### 5.1.1 状态展示

| 应用状态 | 显示内容 | 动画效果 |
|----------|----------|----------|
| IDLE | 呼吸指示灯 | 脉冲动画 |
| SEARCHING | "正在全网搜索..." | 旋转加载 |
| DOWNLOADING | "正在抓取章节内容" | 圆形进度条 |
| PARSING | "正在解析章节..." | 进度更新 |
| PACKING | "正在打包 EPUB..." | 脉冲图标 |
| COMPLETE | "打包完成" | 缩放成功图标 |

#### 5.1.2 长按交互

支持长按展开三个功能入口（小说/漫画/音乐），带进度条反馈和图标分离动画。

#### 5.1.3 音乐状态集成

当切换到音乐界面时，灵动岛会显示当前播放歌曲信息，支持专辑封面旋转动画。

### 5.2 BookCard（书籍卡片组件）

**位置**：`components/BookCard.tsx`

**功能**：展示小说搜索结果的卡片组件，包含封面、标题、作者、标签等信息

#### 5.2.1 主要特性

- 悬停动画效果（上浮、阴影增强）
- 状态标签（连载中/已完结）
- 章节数量显示
- 简介展开/收起
- 封面占位图自动生成

### 5.3 Reader（阅读器组件）

**位置**：`components/Reader.tsx`

**功能**：内置章节阅读器，支持前后翻页

---

## 六、API 接口层

### 6.1 本地 API（Vite Middleware）

#### 6.1.1 文件管理接口

| 接口 | 方法 | 功能 |
|------|------|------|
| `/api/save-epub` | POST | 保存 EPUB 文件到服务器 |
| `/api/list-downloads` | GET | 获取已下载文件列表 |
| `/api/list-videos` | GET | 获取本地视频列表 |
| `/api/list-photo-folders` | GET | 获取相册文件夹列表 |
| `/api/list-photos` | GET | 获取指定文件夹照片 |

#### 6.1.2 代理接口

| 接口 | 方法 | 功能 |
|------|------|------|
| `/api/proxy?url=xxx` | GET | 通用 URL 代理 |
| `/api/gbk-search` | GET | GBK 编码搜索代理 |
| `/api/browser-search` | GET | 浏览器渲染搜索 |
| `/api/browser-details` | GET | 浏览器渲染详情页 |

#### 6.1.3 音乐接口

| 接口 | 方法 | 功能 |
|------|------|------|
| `/api/migu?keyword=xxx` | GET | 咪咕音乐搜索 |
| `/api/kuwo?keyword=xxx` | GET | 酷我音乐搜索 |
| `/api/gequke?keyword=xxx` | GET | 歌曲库搜索 |

### 6.2 安全特性

#### 6.2.1 SSRF 防护

```typescript
// vite.config.ts 中的安全检查
const blockedHosts = ['localhost', '127.0.0.1', '0.0.0.0', '::1'];
const isPrivate = (host: string) => {
  return blockedHosts.includes(host) || 
         host.startsWith('192.168.') || 
         host.startsWith('10.') || 
         /^172\.(1[6-9]|2[0-9]|3[0-1])\./.test(host);
};
```

#### 6.2.2 路径穿越防护

```typescript
// 安全的文件名过滤
const safeName = filename.replace(/[\\/:*?"<>|]/g, "_").replace(/^\.+/, "");
```

---

## 七、配置与运行

### 7.1 环境变量

项目使用 `.env.local` 文件管理环境变量：

```bash
# .env.local 示例
GEMINI_API_KEY=your-api-key
```

### 7.2 启动命令

| 命令 | 描述 |
|------|------|
| `npm run dev` | 启动开发服务器（端口 3000） |
| `npm run build` | 构建生产版本 |
| `npm run preview` | 预览构建结果 |

### 7.3 Vite 代理配置

`vite.config.ts` 配置了多个书源的反向代理，解决跨域问题：

- `/proxy/wanbenge` → `https://www.jizai22.com`
- `/proxy/yeduji` → `https://www.yeduji.com`
- `/proxy/shukuge` → `http://www.shukuge.com`
- `/proxy/dingdian` → `https://www.23ddw.net`

---

## 八、特殊功能

### 8.1 隐藏功能触发

| 关键词 | 功能 |
|--------|------|
| `3068` | 打开书源选择器（带收缩动画） |
| `zyd` | 打开本地视频库 |
| `shenli` | 打开相册浏览 |

### 8.2 搜索缓存机制

```typescript
// source.ts
const searchCache = new Map<string, { results: Novel[]; timestamp: number }>();
const CACHE_DURATION = 5 * 60 * 1000; // 5分钟过期
```

- 自动清理过期缓存
- 缓存大小限制（最多 100 条）
- 防止内存泄漏

### 8.3 封面生成

当小说没有封面时，自动生成蓝粉渐变封面：

```typescript
export const generatePlaceholderCover = (title: string, author: string): string
```

---

## 九、依赖关系图

```
┌─────────────────────────────────────────────────────────────────┐
│                        App.tsx                                 │
│          (主应用组件，状态管理、界面切换)                        │
└─────────────────────────────────────────────────────────────────┘
                              │
        ┌─────────────────────┼─────────────────────┐
        ▼                     ▼                     ▼
┌───────────────┐    ┌───────────────┐    ┌───────────────┐
│ DynamicIsland │    │   BookCard   │    │    Reader     │
│   (灵动岛)    │    │  (书籍卡片)  │    │   (阅读器)    │
└───────────────┘    └───────────────┘    └───────────────┘
        │                     │                     │
        └─────────────────────┼─────────────────────┘
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                       services/source.ts                        │
│          (小说源服务：搜索、详情、章节抓取)                        │
└─────────────────────────────────────────────────────────────────┘
                              │
        ┌─────────────────────┼─────────────────────┐
        ▼                     ▼                     ▼
┌───────────────┐    ┌───────────────┐    ┌───────────────┐
│  wanbenge     │    │   dingdian    │    │    yeduji     │
│   (完本阁)    │    │  (顶点小说)   │    │   (夜读集)    │
└───────────────┘    └───────────────┘    └───────────────┘
        │                     │                     │
        └─────────────────────┼─────────────────────┘
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                       services/epub.ts                          │
│              (EPUB 生成服务：JSZip 压缩打包)                      │
└─────────────────────────────────────────────────────────────────┘
```

---

## 十、代码规范与风格

项目遵循**猫娘专属版代码规范**，主要特点：

### 10.1 命名规则

- 变量/函数：小驼峰命名（如 `pinkBlueGradient`）
- 类/接口：大驼峰命名（如 `GradientThemeGenerator`）
- 常量：全大写+下划线（如 `MAX_GRADIENT_STEP`）

### 10.2 安全规范

- 输入校验：所有外部输入必须做类型+范围+格式校验
- SQL 参数化：禁止字符串拼接
- XSS 防护：输出用户内容时使用 `encodeHTML` 转义
- 敏感数据：密码使用 `bcrypt` 哈希，Token 设置过期时间

### 10.3 前端规范

- 蓝粉渐变配色主题
- CSS 变量定义：`--cat-pink`, `--cat-blue`, `--gradient-main`
- Flex/Grid 布局适配移动端

---

## 十一、部署说明

### 11.1 Vercel 部署

项目已配置 `vercel.json`，支持一键部署到 Vercel：

```json
{
  "builds": [{ "src": "index.html", "use": "@vercel/static" }],
  "routes": [{ "src": "/(.*)", "dest": "/index.html" }]
}
```

### 11.2 本地运行

```bash
# 安装依赖
npm install

# 启动开发服务器
npm run dev

# 访问地址：http://localhost:3000
```

---

## 十二、总结

InkStream 是一个功能完整的小说下载器应用，具有以下特点：

1. **多源聚合**：支持多个小说网站的搜索和抓取
2. **智能解析**：自动提取章节、清理广告内容
3. **优雅界面**：蓝粉渐变美学设计，灵动岛交互体验
4. **扩展功能**：音乐搜索、视频管理、相册浏览
5. **安全可靠**：SSRF 防护、路径穿越防护、输入校验

项目结构清晰，代码规范，具有良好的扩展性和维护性。