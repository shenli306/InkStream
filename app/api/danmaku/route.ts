import { kv } from '@vercel/kv';

// 由原 api/danmaku.js 直接移植：@vercel/kv 持久化弹幕，
// 部署 SHA 变化时清空旧弹幕。喵~
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 30;

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

export async function OPTIONS() {
  return new Response(null, { status: 204, headers: CORS });
}

export async function GET() {
  try {
    const currentCommit = process.env.VERCEL_GIT_COMMIT_SHA || 'dev';
    const storedCommit = await kv.get('last_commit_sha');

    if (storedCommit && storedCommit !== currentCommit) {
      console.log(`[Danmaku] New deployment detected (${currentCommit}), clearing old danmaku...`);
      await kv.del('danmaku_list');
      await kv.set('last_commit_sha', currentCommit);
    } else if (!storedCommit) {
      await kv.set('last_commit_sha', currentCommit);
    }

    const data = await kv.get('danmaku_list');
    return Response.json(data || [], { headers: CORS });
  } catch (e: any) {
    console.error('[Danmaku API] Error:', e);
    return Response.json({ error: e.message }, { status: 500, headers: CORS });
  }
}

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => null);
    await kv.set('danmaku_list', body);
    return Response.json({ success: true }, { headers: CORS });
  } catch (e: any) {
    return Response.json({ error: e.message }, { status: 500, headers: CORS });
  }
}
