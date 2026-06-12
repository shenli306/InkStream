
export const config = {
  runtime: 'nodejs',
  maxDuration: 30,
};

const RETRY_ATTEMPTS = 2;
const TIMEOUT_MS = 25000;

async function fetchWithTimeout(url, options, timeout = TIMEOUT_MS) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeout);

  try {
    const response = await fetch(url, {
      ...options,
      signal: controller.signal,
    });
    clearTimeout(timeoutId);
    return response;
  } catch (error) {
    clearTimeout(timeoutId);
    throw error;
  }
}

async function fetchWithRetry(url, options, retries = RETRY_ATTEMPTS) {
  let lastError;

  for (let i = 0; i <= retries; i++) {
    try {
      const response = await fetchWithTimeout(url, options);

      if (!response.ok && response.status >= 500 && i < retries) {
        console.log(`[Proxy] Attempt ${i + 1} failed with status ${response.status}, retrying...`);
        await new Promise((resolve) => setTimeout(resolve, 1000 * (i + 1)));
        continue;
      }

      return response;
    } catch (error) {
      lastError = error;
      console.log(`[Proxy] Attempt ${i + 1} failed: ${error.message}, retrying...`);

      if (i < retries) {
        await new Promise((resolve) => setTimeout(resolve, 1000 * (i + 1)));
      }
    }
  }

  throw lastError;
}

export default async function handler(req, res) {
  try {
    const targetUrl = req.query.url;
    const customReferer = req.query.referer;

    if (!targetUrl) {
      return res.status(400).send('Missing url parameter');
    }

    const headers = {};
    const clientUA = req.headers['user-agent'];

    if (String(targetUrl).includes('m.music.migu.cn')) {
      headers['User-Agent'] = 'Mozilla/5.0 (iPhone; CPU iPhone OS 14_0 like Mac OS X) AppleWebKit/605.1.15 (HTML, like Gecko) Version/14.0 Mobile/15E148 Safari/604.1';
      headers['Referer'] = 'https://m.music.migu.cn/';
    } else if (String(targetUrl).includes('www.kuwo.cn')) {
      headers['User-Agent'] = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';
      headers['Referer'] = 'http://www.kuwo.cn/';
      headers['Cookie'] = 'kw_token=1234567890';
    } else {
      headers['User-Agent'] = clientUA || 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';
      if (customReferer) {
        headers['Referer'] = customReferer;
      } else {
        try {
          const urlObj = new URL(String(targetUrl));
          headers['Referer'] = urlObj.origin + '/';
        } catch (e) {}
      }
    }

    try {
      const urlObj = new URL(String(targetUrl));
      headers['Origin'] = urlObj.origin;
      headers['Accept'] = '*/*';
      headers['Accept-Language'] = 'zh-CN,zh;q=0.9,en;q=0.8';
    } catch (e) {}

    const response = await fetchWithRetry(targetUrl, {
      headers: headers,
      method: req.method,
      redirect: 'follow',
    });

    const contentType = String(response.headers.get('content-type') || '').toLowerCase();

    // 复制响应头
    response.headers.forEach((value, key) => {
      // 移除可能引起问题的头
      const lowerKey = key.toLowerCase();
      if (
        lowerKey === 'content-encoding' || lowerKey === 'content-length' || lowerKey === 'transfer-encoding' || lowerKey === 'connection' || lowerKey === 'keep-alive' || lowerKey === 'upgrade'
      ) {
        return;
      }
      res.setHeader(key, value);
    });

    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

    if (contentType.startsWith('image/')) {
      res.setHeader('Cache-Control', 'public, max-age=604800, immutable');
      res.removeHeader('pragma');
      res.removeHeader('expires');
    }

    res.status(response.status);

    const arrayBuffer = await response.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    res.send(buffer);
  } catch (error) {
    console.error('[Proxy] Final error:', error.message);
    res.setHeader('Access-Control-Allow-Origin', '*');
    if (error.name === 'AbortError') {
      return res.status(504).send('Request timeout. Please try again.');
    }
    res.status(500).send(`Proxy error: ${error.message}`);
  }
}
