
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
      signal: controller.signal
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
        await new Promise(resolve => setTimeout(resolve, 1000 * (i + 1)));
        continue;
      }
      
      return response;
    } catch (error) {
      lastError = error;
      console.log(`[Proxy] Attempt ${i + 1} failed: ${error.message}, retrying...`);
      
      if (i < retries) {
        await new Promise(resolve => setTimeout(resolve, 1000 * (i + 1)));
      }
    }
  }
  
  throw lastError;
}

export default async function handler(req) {
  const url = new URL(req.url);
  const targetUrl = url.searchParams.get('url');
  const customReferer = url.searchParams.get('referer');

  if (!targetUrl) {
    return new Response('Missing url parameter', { status: 400 });
  }

  try {
    const headers = new Headers();
    const clientUA = req.headers.get('user-agent');
    
    if (targetUrl.includes('m.music.migu.cn')) {
      headers.set('User-Agent', 'Mozilla/5.0 (iPhone; CPU iPhone OS 14_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/14.0 Mobile/15E148 Safari/604.1');
      headers.set('Referer', 'https://m.music.migu.cn/');
    } else if (targetUrl.includes('www.kuwo.cn')) {
      headers.set('User-Agent', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');
      headers.set('Referer', 'http://www.kuwo.cn/');
      headers.set('Cookie', 'kw_token=1234567890');
    } else {
      headers.set('User-Agent', clientUA || 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');
      if (customReferer) {
        headers.set('Referer', customReferer);
      } else {
        try {
          const urlObj = new URL(targetUrl);
          headers.set('Referer', urlObj.origin + '/');
        } catch (e) {}
      }
    }
    
    try {
      const urlObj = new URL(targetUrl);
      headers.set('Origin', urlObj.origin);
      headers.set('Accept', '*/*');
      headers.set('Accept-Language', 'zh-CN,zh;q=0.9,en;q=0.8');
    } catch (e) {}

    const response = await fetchWithRetry(targetUrl, {
      headers: headers,
      method: req.method,
      redirect: 'follow'
    });

    const newHeaders = new Headers(response.headers);
    newHeaders.set('Access-Control-Allow-Origin', '*');
    newHeaders.set('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    newHeaders.set('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    newHeaders.delete('Content-Security-Policy');
    newHeaders.delete('X-Frame-Options');

    const contentType = (newHeaders.get('content-type') || '').toLowerCase();
    if (contentType.startsWith('image/')) {
      newHeaders.set('Cache-Control', 'public, max-age=604800, immutable');
      newHeaders.delete('Pragma');
      newHeaders.delete('Expires');
    }

    return new Response(response.body, {
      status: response.status,
      statusText: response.statusText,
      headers: newHeaders
    });
  } catch (error) {
    console.error('[Proxy] Final error:', error.message);
    
    if (error.name === 'AbortError') {
      return new Response('Request timeout. Please try again.', { 
        status: 504,
        headers: { 'Access-Control-Allow-Origin': '*' }
      });
    }
    
    return new Response(`Proxy error: ${error.message}`, { 
      status: 500,
      headers: { 'Access-Control-Allow-Origin': '*' }
    });
  }
}
