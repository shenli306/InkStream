
import { lookup } from 'node:dns/promises';
import { isIP } from 'node:net';

export const config = {
  runtime: 'nodejs',
  maxDuration: 30,
};

const TIMEOUT_MS = 12000;
const MAX_BODY_SIZE = 1024 * 1024;
const MAX_REDIRECTS = 5;

function isPrivateIp(address) {
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

async function validateTarget(url) {
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

async function fetchWithTimeout(url, options, timeout = TIMEOUT_MS) {
  let currentUrl = new URL(url);
  let currentOptions = { ...options };

  for (let redirectCount = 0; redirectCount <= MAX_REDIRECTS; redirectCount++) {
    await validateTarget(currentUrl);
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeout);
    let response;
    try {
      response = await fetch(currentUrl, {
        ...currentOptions,
        redirect: 'manual',
        signal: controller.signal,
      });
    } finally {
      clearTimeout(timeoutId);
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

function getRequestBody(req) {
  if (req.method !== 'POST' || req.body == null) return undefined;
  const body = Buffer.isBuffer(req.body)
    ? req.body
    : typeof req.body === 'string'
      ? Buffer.from(req.body)
      : Buffer.from(JSON.stringify(req.body));
  if (body.length > MAX_BODY_SIZE) throw new Error('Request body too large');
  return body;
}

export default async function handler(req, res) {
  // 处理 CORS 预检请求
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, User-Agent, Referer');

  if (req.method === 'OPTIONS') {
    return res.status(204).end();
  }

  if (req.method !== 'GET' && req.method !== 'POST') {
    res.setHeader('Allow', 'GET, POST, OPTIONS');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const targetUrl = req.query.url;
    const customReferer = req.query.referer;

    if (!targetUrl || Array.isArray(targetUrl) || Array.isArray(customReferer)) {
      return res.status(400).json({ error: 'Invalid url parameter' });
    }

    const urlStr = String(targetUrl);
    const urlObj = new URL(urlStr);
    await validateTarget(urlObj);
    const requestBody = getRequestBody(req);

    // 构造浏览器化的请求头喵~
    let finalReferer = customReferer;
    let finalOrigin = urlObj.origin;
    const isMobileUA = urlStr.includes('jizai22.com') || urlStr.includes('b.faloo.com');

    if (!finalReferer) finalReferer = urlObj.origin + '/';

    const desktopUA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36';
    const mobileUA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1';
    const clientUA = req.headers['user-agent'];

    const headers = {
      'User-Agent': clientUA || (isMobileUA ? mobileUA : desktopUA),
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

    if (finalOrigin) {
      headers['Origin'] = finalOrigin;
    }
    if (req.method === 'POST' && req.headers['content-type']) {
      headers['Content-Type'] = req.headers['content-type'];
    }

    const proxiedUrls = [urlStr];

    let lastError = null;
    let finalResponse = null;
    let finalBuffer = null;
    let succeededUrl = '';

    for (let i = 0; i < proxiedUrls.length; i++) {
      const pUrl = proxiedUrls[i];
      try {
        // 通过公共代理时不要发送 Origin/Referer 头（可能被代理网站拦截）喵~
        const useHeaders = i === 0 ? headers : {
          'User-Agent': isMobileUA ? mobileUA : desktopUA,
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
          'Accept-Language': 'zh-CN,zh;q=0.9',
        };

        const response = await fetchWithTimeout(pUrl, {
          headers: useHeaders,
          method: req.method,
          body: requestBody,
        });

        if (!response.ok) {
          throw new Error(`HTTP ${response.status}`);
        }

        const buffer = Buffer.from(await response.arrayBuffer());

        if (buffer.length < 50) {
          throw new Error('Response too small');
        }

        // 检查是否是反爬页面
        const textSample = buffer.toString('utf-8', 0, 2000).toLowerCase();
        if (i === 0 && (
          textSample.includes('just a moment') ||
          textSample.includes('attention required') ||
          textSample.includes('cloudflare') ||
          textSample.includes('verification') ||
          textSample.includes('请完成安全验证') ||
          textSample.includes('正在检测') ||
          textSample.includes('error 403') ||
          textSample.includes('forbidden') ||
          textSample.includes('blocked')
        )) {
          throw new Error('Anti-bot page detected');
        }

        finalResponse = response;
        finalBuffer = buffer;
        succeededUrl = pUrl;
        lastError = null;
        break;
      } catch (e) {
        lastError = e;
        console.log(`[Proxy] Attempt ${i + 1} failed for ${urlStr.substring(0, 80)}: ${e.message}`);
      }
    }

    if (lastError) {
      console.error(`[Proxy] All attempts failed for ${urlStr.substring(0, 80)}: ${lastError.message}`);
      return res.status(502).json({ error: `Proxy failed: ${lastError.message}` });
    }

    // 传递响应头（排除会干扰的头）喵~
    const contentType = String(finalResponse.headers.get('content-type') || '');
    const contentTypeLower = contentType.toLowerCase();
    const isImage = contentTypeLower.startsWith('image/');
    const isHtml = contentTypeLower.includes('text/html') || contentTypeLower.includes('application/xhtml');

    // 重要：把 HTML 中的相对 URL 转换为原始域的绝对 URL
    // 否则前端 DOMParser 解析时会把相对 URL 解析成我们的 Vercel 域，导致后续 fetch 详情页失败喵~
    if (isHtml && finalBuffer) {
      try {
        const htmlText = finalBuffer.toString('utf-8');
        // 如果 HTML 中包含协议相对 URL（//host/path），替换为原始域的绝对 URL
        if (htmlText.includes('//' + urlObj.host + '/') || htmlText.includes('="/') || htmlText.includes("='/")) {
          const httpsOrigin = 'https://' + urlObj.host;
          // 替换 src="/", href="/", srcset 中的相对 URL
          let fixedHtml = htmlText
            .replace(/src="\/([^"]*?)"/g, `src="${httpsOrigin}/$1"`)
            .replace(/src='\/([^']*?)'/g, `src='${httpsOrigin}/$1'`)
            .replace(/href="\/([^"]*?)"/g, `href="${httpsOrigin}/$1"`)
            .replace(/href='\/([^']*?)'/g, `href='${httpsOrigin}/$1'`)
            .replace(/srcset="\/([^"]*?)"/g, `srcset="${httpsOrigin}/$1"`)
            .replace(/srcset='\/([^']*?)'/g, `srcset='${httpsOrigin}/$1'`)
            // 处理 action="/path" 表单提交目标
            .replace(/action="\/([^"]*?)"/g, `action="${httpsOrigin}/$1"`)
            .replace(/action='\/([^']*?)'/g, `action='${httpsOrigin}/$1'`);
          // 仅在确实有修改时才更新 buffer
          if (fixedHtml !== htmlText) {
            finalBuffer = Buffer.from(fixedHtml, 'utf-8');
          }
        }
      } catch (e) {
        // URL 重写失败不影响正常返回
      }
    }

    if (contentType) {
      res.setHeader('Content-Type', contentType);
    }

    if (isImage) {
      res.setHeader('Cache-Control', 'public, max-age=604800, immutable');
    }

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
      ) {
        return;
      }
      if (lowerKey.startsWith('access-control-')) return;
      res.setHeader(key, value);
    });

    res.status(finalResponse.status || 200);
    res.send(finalBuffer);
  } catch (error) {
    console.error('[Proxy] Final error:', error.message);
    res.status(500).json({ error: error.message });
  }
}
