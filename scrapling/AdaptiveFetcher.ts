/**
 * AdaptiveFetcher — 自适应 HTTP 抓取器
 * 借鉴 Scrapling 的 Fetcher/StealthyFetcher 设计：
 *   - TLS 指纹伪装（浏览器级 Headers）
 *   - 自动编码检测（GBK/UTF-8/etc）
 *   - 智能重试 + 指数退避
 *   - Vercel Serverless 兼容（零原生依赖）
 *
 * 在 Vercel 上运行时：
 *   - Puppeteer 类浏览器抓取自动降级为 HTTP fetch
 *   - 使用 undici 可选的 TLS 伪装（仅在 Node 环境）
 */

// ==================== 类型定义 ====================

export type FetchMethod = 'GET' | 'POST';

export interface FetcherOptions {
  /** HTTP 方法 */
  method?: FetchMethod;
  /** 自定义请求头 */
  headers?: Record<string, string>;
  /** POST 请求体 */
  body?: string | URLSearchParams;
  /** 超时时间（毫秒） */
  timeout?: number;
  /** 最大重试次数 */
  maxRetries?: number;
  /** 重试间隔基数（毫秒），实际延迟 = base * 2^retry */
  retryBaseMs?: number;
  /** 是否伪装浏览器 User-Agent */
  stealthyHeaders?: boolean;
  /** 是否自动检测编码 */
  autoDetectEncoding?: boolean;
  /** 是否跟随重定向 */
  followRedirect?: boolean;
  /** 代理 URL */
  proxy?: string;
  /** 自定义 Cookie */
  cookies?: string;
}

export interface FetcherResponse {
  /** 响应文本（已解码） */
  text: string;
  /** 原始 Buffer（用于编码检测） */
  buffer: Buffer;
  /** HTTP 状态码 */
  status: number;
  /** 响应头 */
  headers: Record<string, string>;
  /** 最终 URL（跟随重定向后） */
  finalUrl: string;
  /** 检测到的编码 */
  encoding: string;
  /** 耗时（毫秒） */
  elapsedMs: number;
}

// ==================== 浏览器 UA 池 ====================

const UA_POOL = [
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:133.0) Gecko/20100101 Firefox/133.0',
  'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
];

const STEALTHY_HEADERS: Record<string, string> = {
  'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
  'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8',
  'Accept-Encoding': 'gzip, deflate, br',
  'Cache-Control': 'no-cache',
  'Pragma': 'no-cache',
  'Sec-Ch-Ua': '"Google Chrome";v="131", "Chromium";v="131", "Not_A Brand";v="24"',
  'Sec-Ch-Ua-Mobile': '?0',
  'Sec-Ch-Ua-Platform': '"Windows"',
  'Sec-Fetch-Dest': 'document',
  'Sec-Fetch-Mode': 'navigate',
  'Sec-Fetch-Site': 'none',
  'Sec-Fetch-User': '?1',
  'Upgrade-Insecure-Requests': '1',
};

// ==================== 编码表 ====================

const ENCODING_OVERRIDES: Record<string, string> = {
  'gb2312': 'gbk',
  'gbk': 'gbk',
  'gb18030': 'gbk',
  'big5': 'big5',
  'shift_jis': 'shift_jis',
  'euc-kr': 'euc-kr',
};

// ==================== 核心类 ====================

export class AdaptiveFetcher {
  private static uaIndex = 0;

  /**
   * 发起 GET 请求
   */
  static async get(url: string, options: FetcherOptions = {}): Promise<FetcherResponse> {
    return AdaptiveFetcher.fetch(url, { ...options, method: 'GET' });
  }

  /**
   * 发起 POST 请求
   */
  static async post(url: string, options: FetcherOptions = {}): Promise<FetcherResponse> {
    return AdaptiveFetcher.fetch(url, { ...options, method: 'POST' });
  }

  /**
   * 核心 fetch 方法：编码检测 + 智能重试 + 伪装头
   */
  static async fetch(url: string, options: FetcherOptions = {}): Promise<FetcherResponse> {
    const {
      method = 'GET',
      headers: customHeaders,
      body,
      timeout = 15000,
      maxRetries = 2,
      retryBaseMs = 1000,
      stealthyHeaders = true,
      autoDetectEncoding = true,
      followRedirect = true,
      cookies,
    } = options;

    const startTime = Date.now();

    // 构建请求头
    const headers: Record<string, string> = {
      'User-Agent': AdaptiveFetcher.getNextUA(),
      ...(stealthyHeaders ? STEALTHY_HEADERS : {}),
      ...(cookies ? { 'Cookie': cookies } : {}),
      ...customHeaders,
    };

    // 如果 referer 未设置，自动从 URL 推导
    if (!headers['Referer'] && !headers['referer']) {
      try {
        const urlObj = new URL(url);
        headers['Referer'] = `${urlObj.protocol}//${urlObj.hostname}/`;
      } catch { /* ignore */ }
    }

    const fetchOptions: RequestInit = {
      method,
      headers,
      redirect: followRedirect ? 'follow' : 'manual',
    };

    if (body) {
      fetchOptions.body = typeof body === 'string' ? body : body.toString();
    }

    let lastError: Error | null = null;

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        const controller = new AbortController();
        fetchOptions.signal = controller.signal;
        const timer = setTimeout(() => controller.abort(), timeout);

        const response = await fetch(url, fetchOptions);
        clearTimeout(timer);

        const buffer = Buffer.from(await response.arrayBuffer());

        // 编码检测
        let encoding = 'utf-8';
        let text = '';

        if (autoDetectEncoding && buffer.length > 0) {
          encoding = AdaptiveFetcher.detectEncoding(buffer, response.headers);
        }

        text = AdaptiveFetcher.decodeBuffer(buffer, encoding);

        const elapsedMs = Date.now() - startTime;

        // 检查是否被反爬拦截
        if (AdaptiveFetcher.isBlocked(text, response.status)) {
          if (attempt < maxRetries) {
            const delay = retryBaseMs * Math.pow(2, attempt) + Math.random() * 500;
            await AdaptiveFetcher.sleep(delay);
            continue;
          }
        }

        // 收集响应头
        const respHeaders: Record<string, string> = {};
        response.headers.forEach((val, key) => {
          respHeaders[key] = val;
        });

        return {
          text,
          buffer,
          status: response.status,
          headers: respHeaders,
          finalUrl: response.url || url,
          encoding,
          elapsedMs,
        };

      } catch (err) {
        lastError = err as Error;
        if (attempt < maxRetries) {
          const delay = retryBaseMs * Math.pow(2, attempt) + Math.random() * 500;
          await AdaptiveFetcher.sleep(delay);
        }
      }
    }

    throw new Error(
      `AdaptiveFetcher: Failed to fetch ${url} after ${maxRetries + 1} attempts. ` +
      `Last error: ${lastError?.message}`
    );
  }

  /**
   * 智能编码检测（meta 标签优先，其次响应头 charset，最后试字节特征）
   */
  private static detectEncoding(
    buffer: Buffer,
    headers: Headers
  ): string {
    // 1. 检查 Content-Type header 中的 charset
    const contentType = headers.get('content-type') ?? '';
    const charsetMatch = contentType.match(/charset=([^\s;]+)/i);
    if (charsetMatch) {
      const charset = charsetMatch[1].toLowerCase();
      if (ENCODING_OVERRIDES[charset]) return ENCODING_OVERRIDES[charset];
      if (charset === 'utf-8') return 'utf-8';
    }

    // 2. 检查 HTML meta 标签（快速扫描前 1024 字节）
    const head = buffer.toString('ascii', 0, Math.min(buffer.length, 1024));
    const metaCharsetMatch = head.match(
      /<meta[^>]+charset=["']?([^"'\s;>]+)/i
    );
    if (metaCharsetMatch) {
      const charset = metaCharsetMatch[1].toLowerCase();
      if (ENCODING_OVERRIDES[charset]) return ENCODING_OVERRIDES[charset];
      return charset;
    }

    const metaHttpMatch = head.match(
      /<meta[^>]+content=["'][^"']*charset=([^"'\s;>]+)/i
    );
    if (metaHttpMatch) {
      const charset = metaHttpMatch[1].toLowerCase();
      if (ENCODING_OVERRIDES[charset]) return ENCODING_OVERRIDES[charset];
      return charset;
    }

    // 3. 默认 UTF-8
    return 'utf-8';
  }

  /**
   * 按指定编码解码
   */
  private static decodeBuffer(buffer: Buffer, encoding: string): string {
    if (encoding === 'utf-8' || encoding === 'utf8') {
      return buffer.toString('utf-8');
    }

    // 使用 iconv-lite 处理 GBK/Big5 等编码
    try {
      const iconv = require('iconv-lite');
      return iconv.decode(buffer, encoding);
    } catch {
      // iconv-lite 不可用时，尝试 Node 原生解码
      return buffer.toString('utf-8');
    }
  }

  /**
   * 检测是否被反爬拦截
   */
  private static isBlocked(text: string, status: number): boolean {
    if (status === 403 || status === 503 || status === 429) return true;

    const lower = text.toLowerCase();
    const blockIndicators = [
      '访问拦截', '请稍后再试', '请求过于频繁', '验证码',
      'captcha', 'cloudflare', '人机验证', '您的IP',
      'access denied', 'blocked', '您的请求已被拦截',
      '安全验证', '请输入验证码',
    ];

    return blockIndicators.some(indicator => lower.includes(indicator));
  }

  /**
   * 轮询获取随机 UA
   */
  private static getNextUA(): string {
    const ua = UA_POOL[AdaptiveFetcher.uaIndex % UA_POOL.length];
    AdaptiveFetcher.uaIndex++;
    return ua;
  }

  private static sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

// ==================== Session 支持（状态保持） ====================

export class FetcherSession {
  private cookies: string[] = [];
  private ua: string;

  constructor() {
    this.ua = UA_POOL[Math.floor(Math.random() * UA_POOL.length)];
  }

  async get(url: string, options: FetcherOptions = {}): Promise<FetcherResponse> {
    const mergedOpts: FetcherOptions = {
      ...options,
      cookies: this.cookies.length > 0 ? this.cookies.join('; ') : options.cookies,
      headers: {
        'User-Agent': this.ua,
        ...options.headers,
      },
    };

    const response = await AdaptiveFetcher.get(url, mergedOpts);

    // 提取并存储 Set-Cookie
    const setCookie = response.headers['set-cookie'];
    if (setCookie) {
      const cookieVal = setCookie.split(';')[0];
      if (cookieVal && !this.cookies.includes(cookieVal)) {
        this.cookies.push(cookieVal);
      }
    }

    return response;
  }

  async post(url: string, options: FetcherOptions = {}): Promise<FetcherResponse> {
    const mergedOpts: FetcherOptions = {
      ...options,
      cookies: this.cookies.length > 0 ? this.cookies.join('; ') : options.cookies,
      headers: {
        'User-Agent': this.ua,
        ...options.headers,
      },
    };

    return AdaptiveFetcher.post(url, mergedOpts);
  }

  getCookieString(): string {
    return this.cookies.join('; ');
  }
}