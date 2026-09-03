/**
 * SelectorRegistry — 选择器注册表
 * 集中管理所有书源的选择器规则，支持热更新和多级 fallback
 *
 * 核心思想：
 *   1. 每个书源的数据字段（标题/作者/章节等）配置多个备选选择器
 *   2. 网站改版时只需更新注册表，无需改动 Provider 业务逻辑
 *   3. 支持从远程/本地 JSON 动态加载（Vercel KV 或静态文件）
 */

import { SelectorGroup, SelectorRule } from './SmartSelector';

// ==================== 书源选择器配置 ====================

export interface SourceSelectorConfig {
  /** 书源 key */
  sourceKey: string;
  /** 书源基础 URL（用于相对路径拼接） */
  baseUrl: string;
  /** 搜索相关选择器 */
  search: {
    /** 搜索结果容器 */
    container: SelectorGroup;
    /** 书名 */
    title: SelectorGroup;
    /** 作者 */
    author: SelectorGroup;
    /** 封面图 */
    cover: SelectorGroup;
    /** 详情链接 */
    detailUrl: SelectorGroup;
    /** 最新章节 */
    latestChapter: SelectorGroup;
    /** 更新时间 */
    updateTime: SelectorGroup;
  };
  /** 详情页选择器 */
  detail: {
    /** 书名 */
    title: SelectorGroup;
    /** 作者 */
    author: SelectorGroup;
    /** 封面图 */
    cover: SelectorGroup;
    /** 简介 */
    description: SelectorGroup;
    /** 章节列表容器 */
    chapterContainer: SelectorGroup;
    /** 章节项（相对容器） */
    chapterItem: {
      /** 章节标题 */
      title: SelectorGroup;
      /** 章节链接 */
      url: SelectorGroup;
    };
  };
  /** 章节内容选择器 */
  content: {
    /** 正文内容 */
    body: SelectorGroup;
    /** 上一章 */
    prevChapter: SelectorGroup;
    /** 下一章 */
    nextChapter: SelectorGroup;
  };
}

// ==================== 预设书源配置 ====================

const createRule = (
  mode: 'css' | 'xpath' | 'text' | 'regex',
  expr: string,
  priority?: number,
  description?: string
): SelectorRule => ({ mode, expr, priority, description });

const createGroup = (
  name: string,
  rules: SelectorRule[],
  attribute?: string,
  multiple?: boolean,
  postProcess?: (v: string) => string
): SelectorGroup => ({ name, rules, attribute, multiple, postProcess });

// ==================== 完本阁 (wanbenge) ====================

const wanbengeConfig: SourceSelectorConfig = {
  sourceKey: 'wanbenge',
  baseUrl: 'https://www.jizai22.com',
  search: {
    container: createGroup('container', [
      createRule('css', '.library li', 0, '手机版搜索结果'),
      createRule('css', '.novelslist li', 1, '桌面版搜索结果'),
    ]),
    title: createGroup('title', [
      createRule('css', '.bookname a::text', 0),
      createRule('css', 'h3 a', 1),
    ]),
    author: createGroup('author', [
      createRule('css', '.author', 0),
      createRule('text', '作者：', 1),
    ]),
    cover: createGroup('cover', [
      createRule('css', 'img', 0, '封面图片'),
    ], 'src'),
    detailUrl: createGroup('detailUrl', [
      createRule('css', '.bookname a', 0),
    ], 'href'),
    latestChapter: createGroup('latestChapter', [
      createRule('css', '.lastchapter a', 0),
    ]),
    updateTime: createGroup('updateTime', [
      createRule('css', '.time', 0),
    ]),
  },
  detail: {
    title: createGroup('title', [
      createRule('css', 'h1', 0),
      createRule('css', '.book-title', 1),
    ]),
    author: createGroup('author', [
      createRule('css', '.author', 0),
    ]),
    cover: createGroup('cover', [
      createRule('css', '.cover img', 0),
    ], 'src'),
    description: createGroup('description', [
      createRule('css', '.intro', 0),
      createRule('css', '.description', 1),
    ]),
    chapterContainer: createGroup('chapterContainer', [
      createRule('css', '.chapterlist li', 0),
      createRule('css', '.chapter li', 1),
      createRule('css', '#list dd', 2),
    ]),
    chapterItem: {
      title: createGroup('title', [
        createRule('css', 'a::text', 0),
        createRule('css', '::text', 1),
      ]),
      url: createGroup('url', [
        createRule('css', 'a', 0),
      ], 'href'),
    },
  },
  content: {
    body: createGroup('body', [
      createRule('css', '#content', 0, '标准内容区'),
      createRule('css', '#chaptercontent', 1),
      createRule('css', '.content', 2),
      createRule('css', '.txt', 3),
      createRule('css', '.chapter-content', 4),
    ]),
    prevChapter: createGroup('prev', [
      createRule('css', '.prev a', 0),
    ], 'href'),
    nextChapter: createGroup('next', [
      createRule('css', '.next a', 0),
    ], 'href'),
  },
};

// ==================== 笔趣阁 (bqgui) ====================

const bqguiConfig: SourceSelectorConfig = {
  sourceKey: 'bqgui',
  baseUrl: 'https://www.bqgui.cc',
  search: {
    container: createGroup('container', [
      createRule('css', '.result-list .result-item', 0),
      createRule('css', '.search-list li', 1),
    ]),
    title: createGroup('title', [
      createRule('css', '.result-game-item-title a', 0),
      createRule('css', 'h3 a', 1),
    ]),
    author: createGroup('author', [
      createRule('css', '.result-game-item-info .result-game-item-info-tag:nth-child(1) span:nth-child(2)', 0),
      createRule('text', '作者：', 1),
    ]),
    cover: createGroup('cover', [
      createRule('css', '.result-game-item-pic img', 0),
    ], 'src'),
    detailUrl: createGroup('detailUrl', [
      createRule('css', '.result-game-item-title a', 0),
    ], 'href'),
    latestChapter: createGroup('latestChapter', [
      createRule('css', '.result-game-item-info .result-game-item-info-tag:nth-child(3) a', 0),
    ]),
    updateTime: createGroup('updateTime', [
      createRule('css', '.result-game-item-info .result-game-item-info-tag:nth-child(4) span', 0),
    ]),
  },
  detail: {
    title: createGroup('title', [
      createRule('css', '#info h1', 0),
      createRule('css', '.book-title', 1),
    ]),
    author: createGroup('author', [
      createRule('css', '#info p:nth-child(1)', 0),
    ]),
    cover: createGroup('cover', [
      createRule('css', '#fmimg img', 0),
    ], 'src'),
    description: createGroup('description', [
      createRule('css', '#intro', 0),
      createRule('css', '.intro', 1),
    ]),
    chapterContainer: createGroup('chapterContainer', [
      createRule('css', '#list dd', 0),
      createRule('css', '.chapterlist li', 1),
    ]),
    chapterItem: {
      title: createGroup('title', [
        createRule('css', 'a::text', 0),
      ]),
      url: createGroup('url', [
        createRule('css', 'a', 0),
      ], 'href'),
    },
  },
  content: {
    body: createGroup('body', [
      createRule('css', '#content', 0),
      createRule('css', '.content', 1),
      createRule('css', '.txt', 2),
      createRule('css', '#chaptercontent', 3),
    ]),
    prevChapter: createGroup('prev', [
      createRule('css', '.bottem1 a:nth-child(1)', 0),
    ], 'href'),
    nextChapter: createGroup('next', [
      createRule('css', '.bottem1 a:nth-child(3)', 0),
    ], 'href'),
  },
};

// ==================== 通用 fallback 选择器 ====================

const GENERIC_SEARCH_SELECTORS = {
  container: createGroup('container', [
    createRule('css', '.result-list .result-item', 0),
    createRule('css', '.search-list li', 1),
    createRule('css', '.novelslist li', 2),
    createRule('css', '.library li', 3),
  ]),
  title: createGroup('title', [
    createRule('css', 'h3 a::text', 0),
    createRule('css', '.bookname a::text', 1),
    createRule('css', 'a[href*="/book/"]::text', 2),
    createRule('css', 'a[href*="/novel/"]::text', 3),
  ]),
  author: createGroup('author', [
    createRule('css', '.author::text', 0),
    createRule('text', '作者', 1),
  ]),
};

// ==================== 注册表类 ====================

export class SelectorRegistry {
  private configs: Map<string, SourceSelectorConfig> = new Map();

  constructor() {
    // 注册内置配置
    this.register(wanbengeConfig);
    this.register(bqguiConfig);
  }

  /**
   * 注册书源配置
   */
  register(config: SourceSelectorConfig): void {
    this.configs.set(config.sourceKey, config);
  }

  /**
   * 获取书源配置
   */
  get(sourceKey: string): SourceSelectorConfig | undefined {
    return this.configs.get(sourceKey);
  }

  /**
   * 获取搜索选择器（指定书源或通用）
   */
  getSearchSelectors(sourceKey?: string): SourceSelectorConfig['search'] {
    if (sourceKey) {
      const config = this.configs.get(sourceKey);
      if (config) return config.search;
    }
    // 返回最后注册的书源配置，或通用 fallback
    const lastConfig = Array.from(this.configs.values()).pop();
    return (
      lastConfig?.search ?? {
        ...GENERIC_SEARCH_SELECTORS,
        cover: createGroup('cover', [createRule('css', 'img', 0)], 'src'),
        detailUrl: createGroup('detailUrl', [createRule('css', 'a', 0)], 'href'),
        latestChapter: createGroup('latestChapter', [createRule('css', '.lastchapter a', 0)]),
        updateTime: createGroup('updateTime', [createRule('css', '.time', 0)]),
      }
    );
  }

  /**
   * 获取所有已注册书源
   */
  getAllSources(): string[] {
    return Array.from(this.configs.keys());
  }

  /**
   * 从 JSON 导入配置
   */
  importFromJSON(json: string): void {
    try {
      const configs: SourceSelectorConfig[] = JSON.parse(json);
      configs.forEach(c => this.register(c));
    } catch (err) {
      console.error('SelectorRegistry: Failed to import JSON configs', err);
    }
  }

  /**
   * 导出所有配置为 JSON
   */
  exportToJSON(): string {
    const configs = Array.from(this.configs.values());
    return JSON.stringify(configs, null, 2);
  }
}

// 全局单例
export const selectorRegistry = new SelectorRegistry();