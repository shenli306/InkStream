
export const config = {
  runtime: 'nodejs',
  maxDuration: 30,
};

const TIMEOUT_MS = 12000;

async function fetchWithTimeout(url, options, timeout = TIMEOUT_MS) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeout);
  try {
    const response = await fetch(url, { ...options, signal: controller.signal });
    clearTimeout(timeoutId);
    return response;
  } catch (error) {
    clearTimeout(timeoutId);
    throw error;
  }
}

export default async function handler(req, res) {
  // 处理 CORS 预检请求
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS, PUT, DELETE');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, User-Agent, Referer');

  if (req.method === 'OPTIONS') {
    return res.status(204).end();
  }

  try {
    const targetUrl = req.query.url;
    const customReferer = req.query.referer;

    if (!targetUrl) {
      return res.status(400).json({ error: 'Missing url parameter' });
    }

    const urlStr = String(targetUrl);

    // 构造浏览器化的请求头喵~
    let finalReferer = customReferer;
    let finalOrigin = null;
    let isMobileUA = false;

    try {
      const urlObj = new URL(urlStr);
      if (!finalReferer) finalReferer = urlObj.origin + '/';
      finalOrigin = urlObj.origin;
      // 某些网站需要移动端 UA 才能访问喵~
      isMobileUA = urlStr.includes('jizai22.com') || urlStr.includes('b.faloo.com');
    } catch (e) {
      finalReferer = 'https://www.google.com/';
    }

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

    // 备选公共代理（当直接请求被拦截时使用）喵~
    const proxiedUrls = [
      urlStr, // 1. 直接请求
      `https://api.codetabs.com/v1/proxy?quest=${encodeURIComponent(urlStr)}`, // 2. codetabs
      `https://corsproxy.io/?${encodeURIComponent(urlStr)}`, // 3. corsproxy
      `https://api.allorigins.win/raw?url=${encodeURIComponent(urlStr)}`, // 4. allorigins
    ];

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
          method: req.method === 'GET' || req.method === 'HEAD' ? req.method : 'GET',
          redirect: 'follow',
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
    const isImage = contentType.toLowerCase().startsWith('image/');
    const isHtml = contentType.toLowerCase().includes('text/html') || contentType.toLowerCase().includes('application/xhtml');

    // 我们设置 content-type，但对于 HTML 页面不强制指定 charset，让浏览器自动检测喵~
    if (contentType) {
      res.setHeader('Content-Type', contentType);
    }

    if (isImage) {
      res.setHeader('Cache-Control', 'public, max-age=604800, immutable');
    }

    // 将目标响应头转发给客户端（但排除可能引起问题的头）喵~
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
      // 不覆盖我们已经设置的 CORS 头
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
