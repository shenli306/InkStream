import { AdaptiveFetcher } from '@/scrapling';

// 原 vite.config.ts 中间件 /api/scraper/proxy：增强型抓取（TLS 伪装/编码检测/重试）。
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 30;

export async function GET(req: Request) {
  const targetUrl = new URL(req.url).searchParams.get('url');
  if (!targetUrl) {
    return Response.json({ error: 'Missing url parameter' }, { status: 400 });
  }
  try {
    const result = await AdaptiveFetcher.get(targetUrl, {
      stealthyHeaders: true,
      autoDetectEncoding: true,
      timeout: 20000,
      maxRetries: 2,
    });
    return Response.json({
      success: true,
      body: result.text,
      status: result.status,
      encoding: result.encoding,
      finalUrl: result.finalUrl,
      elapsedMs: result.elapsedMs,
    });
  } catch (err: any) {
    return Response.json({ success: false, error: err.message }, { status: 502 });
  }
}
