import { AdaptiveFetcher, SmartSelector } from '@/scrapling';

// 原 vite.config.ts 中间件 /api/scraper/gbk-search：GBK 搜索 + SmartSelector 提取。
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 30;

export async function POST(req: Request) {
  try {
    const { searchUrl, selectors, method, postData } = await req.json();
    if (!searchUrl) {
      return Response.json({ error: 'Missing searchUrl' }, { status: 400 });
    }

    const fetchOptions: any = {
      stealthyHeaders: true,
      autoDetectEncoding: true,
      timeout: 20000,
    };
    if (method === 'POST' && postData) {
      fetchOptions.method = 'POST';
      fetchOptions.body = postData;
    }

    const response = await AdaptiveFetcher.get(searchUrl, fetchOptions);
    const selector = new SmartSelector(response.text, searchUrl);
    const results = selectors ? selectors.map((sg: any) => selector.extract(sg)) : [];

    return Response.json({
      success: true,
      results,
      encoding: response.encoding,
      elapsedMs: response.elapsedMs,
    });
  } catch (err: any) {
    return Response.json({ success: false, error: err.message }, { status: 500 });
  }
}
