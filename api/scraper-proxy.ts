/**
 * Scraper Proxy — 增强型反向代理中间件（Vercel 兼容）
 *
 * 使用 AdaptiveFetcher 替代原生的简单 fetch，提供：
 *   - TLS 指纹伪装
 *   - 自动编码检测（GBK/UTF-8）
 *   - 智能重试 + 指数退避
 *   - Vercel Serverless 兼容（零原生依赖，使用 fetch API）
 *
 * 同时提供 SmartSelector 预处理能力，在服务端完成 DOM 解析，
 * 减轻浏览器端负担。
 */

import { AdaptiveFetcher, SmartSelector, ElementTracker } from '../scrapling';
import type { FetcherOptions, SelectorGroup, ExtractionResult } from '../scrapling';

// ==================== 类型定义 ====================

export interface ProxyResult {
  /** 状态码 */
  status: number;
  /** 响应体（文本） */
  body: string;
  /** 响应头 */
  headers: Record<string, string>;
  /** 检测到的编码 */
  encoding: string;
  /** 最终 URL */
  finalUrl: string;
  /** 耗时（毫秒） */
  elapsedMs: number;
}

export interface ExtractionRequest {
  url: string;
  selectorGroups: SelectorGroup[];
  encoding?: string;
  options?: FetcherOptions;
}

export interface ExtractionResponse {
  url: string;
  results: ExtractionResult[];
  elapsedMs: number;
  error?: string;
}

// ==================== 代理核心 ====================

export class ScraperProxy {
  /**
   * 通用代理：抓取 URL 并返回原始内容
   */
  static async fetch(url: string, options?: FetcherOptions): Promise<ProxyResult> {
    const response = await AdaptiveFetcher.get(url, options);

    return {
      status: response.status,
      body: response.text,
      headers: response.headers,
      encoding: response.encoding,
      finalUrl: response.finalUrl,
      elapsedMs: response.elapsedMs,
    };
  }

  /**
   * 智能提取代理：抓取 URL 并在服务端完成 DOM 提取
   * 大幅减少传输数据量，适合 Vercel Serverless 场景
   */
  static async extract(req: ExtractionRequest): Promise<ExtractionResponse> {
    const startTime = Date.now();

    try {
      const response = await AdaptiveFetcher.get(req.url, {
        ...req.options,
        autoDetectEncoding: true,
      });

      const tracker = new ElementTracker(response.text, req.url);
      const results = tracker.extractAll(req.selectorGroups);

      return {
        url: req.url,
        results,
        elapsedMs: Date.now() - startTime,
      };
    } catch (err: any) {
      return {
        url: req.url,
        results: [],
        elapsedMs: Date.now() - startTime,
        error: err.message,
      };
    }
  }

  /**
   * GBK 搜索代理：专门处理 GBK 编码的搜索请求
   */
  static async gbkSearch(
    searchUrl: string,
    selectorGroups: SelectorGroup[],
    referer?: string
  ): Promise<ExtractionResponse> {
    return ScraperProxy.extract({
      url: searchUrl,
      selectorGroups,
      options: {
        stealthyHeaders: true,
        headers: referer ? { Referer: referer } : undefined,
        maxRetries: 2,
      },
    });
  }

  /**
   * 章节内容代理：抓取章节正文
   */
  static async fetchChapter(
    url: string,
    contentSelector: SelectorGroup,
    options?: FetcherOptions
  ): Promise<{ content: string | null; elapsedMs: number }> {
    const startTime = Date.now();

    try {
      const response = await AdaptiveFetcher.get(url, {
        ...options,
        stealthyHeaders: true,
        autoDetectEncoding: true,
      });

      const selector = new SmartSelector(response.text, url);
      const result = selector.extract(contentSelector);

      return {
        content: typeof result.value === 'string' ? result.value : null,
        elapsedMs: Date.now() - startTime,
      };
    } catch {
      return {
        content: null,
        elapsedMs: Date.now() - startTime,
      };
    }
  }
}

// ==================== Vite/Vercel 中间件适配 ====================

/**
 * 为 Vite configureServer 创建增强型代理路由
 * 兼容 Vercel Serverless Functions 的请求格式
 */
export function createScraperRoutes(): Array<{
  method: string;
  path: string;
  handler: (req: any, res: any) => Promise<void>;
}> {
  return [
    {
      method: 'GET',
      path: '/api/scraper/proxy',
      handler: async (req, res) => {
        try {
          const url = req.query?.url;
          if (!url) {
            res.statusCode = 400;
            res.end(JSON.stringify({ error: 'Missing url parameter' }));
            return;
          }

          const result = await ScraperProxy.fetch(url);
          res.setHeader('Content-Type', 'application/json; charset=utf-8');
          res.end(JSON.stringify(result));
        } catch (err: any) {
          res.statusCode = 500;
          res.end(JSON.stringify({ error: err.message }));
        }
      },
    },
    {
      method: 'POST',
      path: '/api/scraper/extract',
      handler: async (req, res) => {
        try {
          let body = '';
          req.on('data', (chunk: string) => { body += chunk; });
          req.on('end', async () => {
            try {
              const extractionReq: ExtractionRequest = JSON.parse(body);
              const result = await ScraperProxy.extract(extractionReq);
              res.setHeader('Content-Type', 'application/json; charset=utf-8');
              res.end(JSON.stringify(result));
            } catch (err: any) {
              res.statusCode = 400;
              res.end(JSON.stringify({ error: err.message }));
            }
          });
        } catch (err: any) {
          res.statusCode = 500;
          res.end(JSON.stringify({ error: err.message }));
        }
      },
    },
    {
      method: 'POST',
      path: '/api/scraper/gbk-search',
      handler: async (req, res) => {
        try {
          let body = '';
          req.on('data', (chunk: string) => { body += chunk; });
          req.on('end', async () => {
            try {
              const { url, selectors, referer } = JSON.parse(body);
              const result = await ScraperProxy.gbkSearch(url, selectors, referer);
              res.setHeader('Content-Type', 'application/json; charset=utf-8');
              res.end(JSON.stringify(result));
            } catch (err: any) {
              res.statusCode = 400;
              res.end(JSON.stringify({ error: err.message }));
            }
          });
        } catch (err: any) {
          res.statusCode = 500;
          res.end(JSON.stringify({ error: err.message }));
        }
      },
    },
  ];
}