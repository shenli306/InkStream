import iconv from 'iconv-lite';

// 由原 api/browser-details.js 直接移植：纯 fetch（无 puppeteer），
// 带反爬检测与 GBK/GB18030 编码判定。喵~
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

async function fetchWithTimeout(url: string, options: RequestInit, timeout = 20000): Promise<Response> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeout);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } finally {
    clearTimeout(timeoutId);
  }
}

export async function OPTIONS() {
  return new Response(null, { status: 204, headers: CORS });
}

export async function GET(req: Request) {
  try {
    const url = new URL(req.url).searchParams.get('url');
    if (!url) {
      return Response.json({ success: false, html: '', message: 'Missing url' }, { headers: CORS });
    }

    const targetUrl = String(url);
    console.log(`[Browser-Details] Fetching: ${targetUrl.substring(0, 80)}`);

    const mobileUA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1';
    const desktopUA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36';

    const isMobile = targetUrl.includes('jizai22.com') || targetUrl.includes('b.faloo.com');
    const ua = isMobile ? mobileUA : desktopUA;

    let origin = 'https://www.google.com';
    try {
      origin = new URL(targetUrl).origin;
    } catch {}

    const headers: Record<string, string> = {
      'User-Agent': ua,
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
      'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8',
      'Referer': origin + '/',
      'Cache-Control': 'no-cache',
    };

    let lastError: Error | null = null;
    let finalHtml: string | null = null;

    try {
      const response = await fetchWithTimeout(targetUrl, { method: 'GET', headers, redirect: 'follow' });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);

      const buf = Buffer.from(await response.arrayBuffer());
      if (buf.length < 200) throw new Error('Response too small');

      const sample = buf.toString('utf-8', 0, 1500).toLowerCase();
      if (
        sample.includes('just a moment') ||
        sample.includes('attention required') ||
        sample.includes('cloudflare') ||
        sample.includes('verification')
      ) {
        throw new Error('Anti-bot detected');
      }

      const ct = String(response.headers.get('content-type') || '').toLowerCase();
      let useGBK = targetUrl.includes('jizai22.com');
      if (ct.includes('gbk') || ct.includes('gb2312') || ct.includes('gb18030')) useGBK = true;
      if (!useGBK) {
        const m = buf.toString('utf-8', 0, 2000).toLowerCase().match(/charset\s*=\s*["']?\s*([a-z0-9-]+)/i);
        if (m && (m[1].includes('gbk') || m[1].includes('gb2312') || m[1].includes('gb18030'))) useGBK = true;
      }

      finalHtml = useGBK ? iconv.decode(buf, 'gbk') : buf.toString('utf-8');
    } catch (e: any) {
      lastError = e;
      console.log(`[Browser-Details] Attempt failed: ${e.message}`);
    }

    if (!finalHtml || finalHtml.length < 200) {
      return Response.json(
        { success: false, html: '', message: lastError ? lastError.message : 'Failed to fetch' },
        { headers: CORS }
      );
    }

    console.log(`[Browser-Details] Success: ${finalHtml.length} chars`);
    return Response.json({ success: true, html: finalHtml, message: 'OK' }, { headers: CORS });
  } catch (error: any) {
    console.error('[Browser-Details] Final error:', error.message);
    return Response.json({ success: false, html: '', message: error.message }, { headers: CORS });
  }
}
