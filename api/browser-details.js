
export const config = {
  runtime: 'nodejs',
  maxDuration: 30,
};

import iconv from 'iconv-lite';

async function fetchWithTimeout(url, options, timeout = 20000) {
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
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(204).end();
  }

  try {
    const url = req.query.url;
    if (!url) {
      return res.status(200).json({ success: false, html: '', message: 'Missing url' });
    }

    const targetUrl = String(url);
    console.log(`[Browser-Details] Fetching: ${targetUrl.substring(0, 80)}`);

    const mobileUA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1';
    const desktopUA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36';

    const isMobile = targetUrl.includes('jizai22.com') || targetUrl.includes('b.faloo.com');
    const ua = isMobile ? mobileUA : desktopUA;

    let origin = 'https://www.google.com';
    try {
      const u = new URL(targetUrl);
      origin = u.origin;
    } catch (e) {}

    const headers = {
      'User-Agent': ua,
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
      'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8',
      'Referer': origin + '/',
      'Cache-Control': 'no-cache',
    };

    // 依次尝试：直接请求 → codetabs → corsproxy → allorigins
    const tryUrls = [
      targetUrl,
      `https://api.codetabs.com/v1/proxy?quest=${encodeURIComponent(targetUrl)}`,
      `https://corsproxy.io/?${encodeURIComponent(targetUrl)}`,
      `https://api.allorigins.win/raw?url=${encodeURIComponent(targetUrl)}`,
    ];

    let lastError = null;
    let finalHtml = null;

    for (let i = 0; i < tryUrls.length; i++) {
      try {
        const useHeaders = i === 0 ? headers : {
          'User-Agent': ua,
          'Accept-Language': 'zh-CN,zh;q=0.9',
        };

        const response = await fetchWithTimeout(tryUrls[i], {
          method: 'GET',
          headers: useHeaders,
          redirect: 'follow',
        });

        if (!response.ok) throw new Error(`HTTP ${response.status}`);

        const arrayBuf = await response.arrayBuffer();
        const buf = Buffer.from(arrayBuf);

        if (buf.length < 200) throw new Error('Response too small');

        // 反爬检测（仅直接请求）
        if (i === 0) {
          const sample = buf.toString('utf-8', 0, 1500).toLowerCase();
          if (
            sample.includes('just a moment') ||
            sample.includes('attention required') ||
            sample.includes('cloudflare') ||
            sample.includes('verification')
          ) {
            throw new Error('Anti-bot detected');
          }
        }

        // 编码检测
        const ct = String(response.headers.get('content-type') || '').toLowerCase();
        let useGBK = targetUrl.includes('jizai22.com');
        if (ct.includes('gbk') || ct.includes('gb2312') || ct.includes('gb18030')) useGBK = true;
        if (!useGBK) {
          const m = buf.toString('utf-8', 0, 2000).toLowerCase().match(/charset\s*=\s*["']?\s*([a-z0-9-]+)/i);
          if (m && (m[1].includes('gbk') || m[1].includes('gb2312') || m[1].includes('gb18030'))) useGBK = true;
        }

        finalHtml = useGBK ? iconv.decode(buf, 'gbk') : buf.toString('utf-8');
        lastError = null;
        break;
      } catch (e) {
        lastError = e;
        console.log(`[Browser-Details] Attempt ${i + 1} failed: ${e.message}`);
      }
    }

    if (!finalHtml || finalHtml.length < 200) {
      return res.status(200).json({
        success: false,
        html: '',
        message: lastError ? lastError.message : 'Failed to fetch',
      });
    }

    console.log(`[Browser-Details] Success: ${finalHtml.length} chars`);

    return res.status(200).json({
      success: true,
      html: finalHtml,
      message: 'OK',
    });
  } catch (error) {
    console.error('[Browser-Details] Final error:', error.message);
    return res.status(200).json({
      success: false,
      html: '',
      message: error.message,
    });
  }
}
