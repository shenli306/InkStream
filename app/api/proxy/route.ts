import { lookup } from 'node:dns/promises';
import { isIP } from 'node:net';
import http from 'node:http';
import https from 'node:https';
import zlib from 'node:zlib';
import { NextRequest } from 'next/server';

// 由原 api/proxy.js 直接移植：SSRF 校验 + 重定向跟随 + 反爬检测 +
// HTML 相对 URL 改写。保持逻辑与注释原样。喵~
export const runtime = 'nodejs';
export const maxDuration = 30;
export const dynamic = 'force-dynamic';

const TIMEOUT_MS = 12000;
const MAX_BODY_SIZE = 1024 * 1024;
const MAX_REDIRECTS = 5;

function isPrivateIp(address: string): boolean {
  const normalized = address.toLowerCase().replace(/^::ffff:/, '');
  if (isIP(normalized) === 4) {
    const [a, b] = normalized.split('.').map(Number);
    return a === 0 || a === 10 || a === 127 ||
      (a === 100 && b >= 64 && b <= 127) ||
      (a === 169 && b === 254) ||
      (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && (b === 0 || b === 168)) ||
      (a === 198 && (b === 18 || b === 19)) ||
      a >= 224;
  }
  return normalized === '::' || normalized === '::1' ||
    normalized.startsWith('fc') || normalized.startsWith('fd') ||
    /^fe[89ab]/.test(normalized);
}

async function validateTarget(url: URL): Promise<void> {
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) {
    throw new Error('Invalid target URL');
  }
  const hostname = url.hostname.toLowerCase();
  if (hostname === 'localhost' || hostname.endsWith('.localhost') || isPrivateIp(hostname)) {
    throw new Error('Target host is not allowed');
  }
  const addresses = await lookup(hostname, { all: true, verbatim: true });
  if (!addresses.length || addresses.some(({ address }) => isPrivateIp(address))) {
    throw new Error('Target host is not allowed');
  }
}

/**
 * 用 node:http / node:https 发请求，而不是全局 fetch 喵~
 *
 * 为什么不用 fetch：undici（Node 内置的 fetch 实现）的客户端指纹
 * 会被部分站点的 WAF 识别。实测 bqgicq.cc 对 undici 无论带什么 header
 * 都只返回 1 字节 "1"，而同样 IP、同样 header 用 node:https 就能拿到
 * 55700 字节的正常 JSON。换成 node:https 后恢复正常。
 */
const requestWithTimeout = (
  target: URL,
  options: RequestInit,
  timeout: number
): Promise<Response> =>
  new Promise((resolve, reject) => {
    const isHttps = target.protocol === 'https:';
    const transport = isHttps ? https : http;

    const req = transport.request(
      {
        protocol: target.protocol,
        hostname: target.hostname,
        port: target.port || (isHttps ? 443 : 80),
        path: `${target.pathname}${target.search}`,
        method: options.method || 'GET',
        headers: (options.headers as Record<string, string>) || {},
        timeout,
      },
      res => {
        const chunks: Buffer[] = [];
        res.on('data', (chunk: Buffer) => chunks.push(chunk));
        res.on('end', () => {
          const raw = Buffer.concat(chunks);
          const encoding = String(res.headers['content-encoding'] || '').toLowerCase();

          // node 的 http/https 不会自动解压，需要手动处理喵~
          let body: Buffer;
          try {
            if (encoding === 'gzip') body = zlib.gunzipSync(raw);
            else if (encoding === 'br') body = zlib.brotliDecompressSync(raw);
            else if (encoding === 'deflate') body = zlib.inflateSync(raw);
            else body = raw;
          } catch {
            body = raw;
          }

          const headers = new Headers();
          Object.entries(res.headers).forEach(([key, value]) => {
            if (value === undefined) return;
            // content-encoding 已手动解压，必须移除，否则下游会二次解压喵~
            if (key.toLowerCase() === 'content-encoding') return;
            if (Array.isArray(value)) value.forEach(v => headers.append(key, v));
            else headers.set(key, String(value));
          });

          resolve(
            new Response(body, {
              status: res.statusCode || 502,
              statusText: res.statusMessage,
              headers,
            })
          );
        });
      }
    );

    req.on('timeout', () => req.destroy(new Error('Request timeout')));
    req.on('error', reject);

    const body = options.body;
    if (body && typeof (body as any).pipe === 'function') {
      (body as any).pipe(req);
    } else if (body) {
      req.write(body);
      req.end();
    } else {
      req.end();
    }
  });

/**
 * 证书过期的站点降级到 http 重试喵~
 *
 * 实例：www.shukuge.com 的 https 证书 2021-12-24 就过期了，
 * 但同一路径的 http 完全可用。很多老牌小说站都有这个问题。
 */
const isCertError = (e: unknown): boolean => {
  const msg = String((e as Error)?.message || e || '');
  return /certificate|CERT_|SSL|TLS|self.signed|expired/i.test(msg);
};

async function fetchWithTimeout(url: string, options: RequestInit, timeout = TIMEOUT_MS): Promise<Response> {
  let currentUrl = new URL(url);
  let currentOptions: RequestInit = { ...options };

  for (let redirectCount = 0; redirectCount <= MAX_REDIRECTS; redirectCount++) {
    await validateTarget(currentUrl);
    let response: Response;
    try {
      response = await requestWithTimeout(currentUrl, currentOptions, timeout);
    } catch (e) {
      // https 证书异常 → 降级到 http 再试一次喵~
      if (currentUrl.protocol === 'https:' && isCertError(e)) {
        const fallback = new URL(currentUrl.toString());
        fallback.protocol = 'http:';
        console.warn(`[Proxy] TLS failed for ${currentUrl.hostname}, retrying over http`);
        await validateTarget(fallback);
        response = await requestWithTimeout(fallback, currentOptions, timeout);
      } else {
        throw e;
      }
    }

    if (![301, 302, 303, 307, 308].includes(response.status)) return response;
    if (redirectCount === MAX_REDIRECTS) throw new Error('Too many redirects');

    const location = response.headers.get('location');
    if (!location) return response;
    currentUrl = new URL(location, currentUrl);
    if (response.status === 303 || ((response.status === 301 || response.status === 302) && currentOptions.method === 'POST')) {
      currentOptions = { ...currentOptions, method: 'GET', body: undefined };
    }
  }

  throw new Error('Too many redirects');
}

async function getRequestBody(req: NextRequest): Promise<Buffer | undefined> {
  if (req.method !== 'POST') return undefined;
  const ab = await req.arrayBuffer();
  if (ab.byteLength === 0) return undefined;
  const body = Buffer.from(ab);
  if (body.length > MAX_BODY_SIZE) throw new Error('Request body too large');
  return body;
}

const CORS: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, User-Agent, Referer',
};

export async function OPTIONS() {
  return new Response(null, { status: 204, headers: CORS });
}

export async function GET(req: NextRequest) {
  return handle(req);
}

export async function POST(req: NextRequest) {
  return handle(req);
}

async function handle(req: NextRequest): Promise<Response> {
  const sp = req.nextUrl.searchParams;
  try {
    const targetUrl = sp.get('url');
    const customReferer = sp.get('referer');

    if (!targetUrl) {
      return Response.json({ error: 'Invalid url parameter' }, { status: 400, headers: CORS });
    }

    const urlStr = String(targetUrl);
    const urlObj = new URL(urlStr);
    await validateTarget(urlObj);
    const requestBody = await getRequestBody(req);

    // 构造浏览器化的请求头喵~
    let finalReferer = customReferer;
    const finalOrigin = urlObj.origin;
    const isMobileUA = urlStr.includes('jizai22.com') || urlStr.includes('b.faloo.com');

    if (!finalReferer) finalReferer = urlObj.origin + '/';

    const desktopUA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36';
    const mobileUA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1';

    // 只有真实浏览器的 UA 才透传喵~
    // curl / node-fetch 这类 UA 会被被代理站点当成爬虫直接挡掉
    // （实测 bqgicq.cc 对 "curl/8.22.0" 只返回 1 字节 "1"，对浏览器 UA 返回 55KB JSON）。
    const clientUA = req.headers.get('user-agent') || '';
    const isBrowserUA = /Mozilla\/5\.0/.test(clientUA);
    const effectiveUA = isBrowserUA ? clientUA : (isMobileUA ? mobileUA : desktopUA);

    const headers: Record<string, string> = {
      'User-Agent': effectiveUA,
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
      'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8,en-US;q=0.7',
      'Accept-Encoding': 'gzip, deflate, br',
      'Referer': finalReferer,
      'Cache-Control': 'no-cache',
      'Pragma': 'no-cache',
      'Upgrade-Insecure-Requests': '1',
      'Sec-Fetch-Dest': 'document',
      'Sec-Fetch-Mode': 'navigate',
      'Sec-Fetch-Site': 'same-origin',
      'Sec-Fetch-User': '?1',
    };

    if (finalOrigin) headers['Origin'] = finalOrigin;
    const ct = req.headers.get('content-type');
    if (req.method === 'POST' && ct) headers['Content-Type'] = ct;

    let lastError: Error | null = null;
    let finalResponse: Response | null = null;
    let finalBuffer: Buffer | null = null;

    try {
      const response = await fetchWithTimeout(urlStr, {
        headers,
        method: req.method,
        body: requestBody as any,
      });

      if (!response.ok) throw new Error(`HTTP ${response.status}`);

      const buffer = Buffer.from(await response.arrayBuffer());

      // 反爬启发式只适用于 HTML 文档喵~
      // JSON / 纯文本接口常常只有几个字节（例如笔趣阁的 /user/search.html
      // 在无会话时返回 "1"），按 HTML 的最小体积门槛会被误杀成 502。
      const contentType = response.headers.get('content-type') || '';
      const looksHtml = contentType.includes('html') || contentType === '';
      if (looksHtml) {
        if (buffer.length < 50) throw new Error('Response too small');

        const textSample = buffer.toString('utf-8', 0, 2000).toLowerCase();
        if (
          textSample.includes('just a moment') ||
          textSample.includes('attention required') ||
          textSample.includes('cloudflare') ||
          textSample.includes('verification') ||
          textSample.includes('请完成安全验证') ||
          textSample.includes('正在检测') ||
          textSample.includes('error 403') ||
          textSample.includes('forbidden') ||
          textSample.includes('blocked')
        ) {
          throw new Error('Anti-bot page detected');
        }
      }

      finalResponse = response;
      finalBuffer = buffer;
    } catch (e: any) {
      lastError = e;
      console.log(`[Proxy] Attempt failed for ${urlStr.substring(0, 80)}: ${e.message}`);
    }

    if (lastError || !finalResponse || !finalBuffer) {
      const msg = lastError?.message || 'Proxy failed';
      console.error(`[Proxy] All attempts failed for ${urlStr.substring(0, 80)}: ${msg}`);
      return Response.json({ error: `Proxy failed: ${msg}` }, { status: 502, headers: CORS });
    }

    const contentType = String(finalResponse.headers.get('content-type') || '');
    const contentTypeLower = contentType.toLowerCase();
    const isImage = contentTypeLower.startsWith('image/');
    const isHtml = contentTypeLower.includes('text/html') || contentTypeLower.includes('application/xhtml');

    // 重要：把 HTML 中的相对 URL 转换为原始域的绝对 URL
    // 否则前端 DOMParser 解析时会把相对 URL 解析成我们的 Vercel 域，导致后续 fetch 详情页失败喵~
    if (isHtml && finalBuffer) {
      try {
        const htmlText = finalBuffer.toString('utf-8');
        if (htmlText.includes('//' + urlObj.host + '/') || htmlText.includes('="/') || htmlText.includes("='/")) {
          const targetOrigin = urlObj.protocol + '//' + urlObj.host; // 跟随原始协议：http 站点不能被改写成 https（书库阁 https 是 404）喵~
          const fixedHtml = htmlText
            .replace(/src="\/([^"]*?)"/g, `src="${targetOrigin}/$1"`)
            .replace(/src='\/([^']*?)'/g, `src='${targetOrigin}/$1'`)
            .replace(/href="\/([^"]*?)"/g, `href="${targetOrigin}/$1"`)
            .replace(/href='\/([^']*?)'/g, `href='${targetOrigin}/$1'`)
            .replace(/srcset="\/([^"]*?)"/g, `srcset="${targetOrigin}/$1"`)
            .replace(/srcset='\/([^']*?)'/g, `srcset='${targetOrigin}/$1'`)
            .replace(/action="\/([^"]*?)"/g, `action="${targetOrigin}/$1"`)
            .replace(/action='\/([^']*?)'/g, `action='${targetOrigin}/$1'`);
          if (fixedHtml !== htmlText) finalBuffer = Buffer.from(fixedHtml, 'utf-8');
        }
      } catch {
        // URL 重写失败不影响正常返回
      }
    }

    const outHeaders = new Headers(CORS);
    if (contentType) outHeaders.set('Content-Type', contentType);
    if (isImage) outHeaders.set('Cache-Control', 'public, max-age=604800, immutable');

    finalResponse.headers.forEach((value, key) => {
      const lowerKey = key.toLowerCase();
      if (
        lowerKey === 'content-encoding' ||
        lowerKey === 'content-length' ||
        lowerKey === 'transfer-encoding' ||
        lowerKey === 'connection' ||
        lowerKey === 'keep-alive' ||
        lowerKey === 'upgrade' ||
        lowerKey === 'content-security-policy' ||
        lowerKey === 'strict-transport-security' ||
        lowerKey === 'x-frame-options'
      ) return;
      if (lowerKey.startsWith('access-control-')) return;
      if (lowerKey === 'content-type' || lowerKey === 'cache-control') return;
      outHeaders.set(key, value);
    });

    return new Response(new Uint8Array(finalBuffer), {
      status: finalResponse.status || 200,
      headers: outHeaders,
    });
  } catch (error: any) {
    console.error('[Proxy] Final error:', error.message);
    return Response.json({ error: error.message }, { status: 500, headers: CORS });
  }
}
