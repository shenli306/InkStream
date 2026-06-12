
export const config = {
  runtime: 'nodejs',
  maxDuration: 30,
};

import iconv from 'iconv-lite';

async function fetchWithTimeout(url, options, timeout = 15000) {
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
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(204).end();
  }

  try {
    const target = req.query.target;
    const keyword = req.query.keyword;
    const method = (req.query.method || 'GET').toUpperCase();

    if (!target || !keyword) {
      return res.status(400).send('Missing parameters');
    }

    // 1. 将关键词编码为 GBK，然后 URL-encode 每个字节喵~
    const gbkBuffer = iconv.encode(String(keyword), 'gbk');
    let encodedKeyword = '';
    for (let i = 0; i < gbkBuffer.length; i++) {
      encodedKeyword += '%' + gbkBuffer[i].toString(16).toUpperCase().padStart(2, '0');
    }

    // 2. 替换目标 URL 中的 {keyword} 占位符（GET 方式）喵~
    let finalUrl = String(target).replace('{keyword}', encodedKeyword);

    // 3. 构造浏览器化的请求头喵~
    const mobileUA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1';
    const desktopUA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36';

    // 判断是否是完本阁（使用 GBK 编码）
    const isWanbenge = finalUrl.includes('jizai22.com');
    const ua = isWanbenge ? mobileUA : desktopUA;

    const headers = {
      'User-Agent': ua,
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
      'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8',
      'Referer': 'https://www.jizai22.com/',
      'Connection': 'keep-alive',
      'Cache-Control': 'max-age=0',
    };

    // 构造备选请求方式（直接请求 → 公共代理）喵~
    const tryUrls = [
      finalUrl, // 1. 直接请求
      `https://api.codetabs.com/v1/proxy?quest=${encodeURIComponent(finalUrl)}`, // 2. codetabs
      `https://corsproxy.io/?${encodeURIComponent(finalUrl)}`, // 3. corsproxy
      `https://api.allorigins.win/raw?url=${encodeURIComponent(finalUrl)}`, // 4. allorigins
    ];

    let lastError = null;
    let finalBuffer = null;
    let finalStatus = 200;

    for (let i = 0; i < tryUrls.length; i++) {
      const tUrl = tryUrls[i];
      try {
        let response;
        if (method === 'POST' && i === 0) {
          // 直接 POST 方式请求，body 中使用 GBK 编码的 keyword 喵~
          const postBody = `searchkey=${encodedKeyword}&action=search`;
          headers['Content-Type'] = 'application/x-www-form-urlencoded';
          response = await fetchWithTimeout(finalUrl, {
            method: 'POST',
            headers,
            body: postBody,
            redirect: 'follow',
          });
        } else {
          // GET 方式（公共代理通常不支持自定义 POST）喵~
          const useHeaders = i === 0 ? headers : {
            'User-Agent': ua,
            'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
            'Accept-Language': 'zh-CN,zh;q=0.9',
          };
          response = await fetchWithTimeout(tUrl, {
            method: 'GET',
            headers: useHeaders,
            redirect: 'follow',
          });
        }

        if (!response.ok) {
          throw new Error(`HTTP ${response.status}`);
        }

        const buffer = Buffer.from(await response.arrayBuffer());

        if (buffer.length < 100) {
          throw new Error('Response too small');
        }

        // 反爬检测（针对直接请求）喵~
        if (i === 0) {
          const sample = buffer.toString('utf-8', 0, 1500).toLowerCase();
          if (
            sample.includes('just a moment') ||
            sample.includes('attention required') ||
            sample.includes('cloudflare') ||
            sample.includes('verification') ||
            sample.includes('error 403') ||
            sample.includes('forbidden')
          ) {
            throw new Error('Anti-bot page');
          }
        }

        finalBuffer = buffer;
        finalStatus = response.status;
        lastError = null;
        break;
      } catch (e) {
        lastError = e;
        console.log(`[GBK-Search] Attempt ${i + 1} failed: ${e.message}`);
      }
    }

    if (lastError) {
      return res.status(502).send(`GBK search failed: ${lastError.message}`);
    }

    // 设置响应头为 GBK 编码的 HTML，让前端用 gb18030 解码喵~
    res.setHeader('Content-Type', 'text/html; charset=gbk');
    res.status(finalStatus);
    res.send(finalBuffer);
  } catch (e) {
    console.error('[GBK-Search] Final error:', e);
    res.status(500).send(e.message || 'Internal error');
  }
}
