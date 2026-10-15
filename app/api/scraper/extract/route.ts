import { AdaptiveFetcher, SmartSelector } from '@/scrapling';

// 原 vite.config.ts 中间件 /api/scraper/extract：服务端 DOM 提取。
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 30;

export async function POST(req: Request) {
  try {
    const { url: targetUrl, selectors } = await req.json();
    if (!targetUrl || !selectors) {
      return Response.json({ error: 'Missing url or selectors' }, { status: 400 });
    }

    const response = await AdaptiveFetcher.get(targetUrl, {
      stealthyHeaders: true,
      autoDetectEncoding: true,
      timeout: 20000,
    });

    const selector = new SmartSelector(response.text, targetUrl);
    const results = selectors.map((sg: any) => selector.extract(sg));

    return Response.json({
      success: true,
      url: targetUrl,
      results,
      encoding: response.encoding,
      elapsedMs: response.elapsedMs,
    });
  } catch (err: any) {
    return Response.json({ success: false, error: err.message }, { status: 500 });
  }
}
