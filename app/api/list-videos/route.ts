import fs from 'node:fs';
import path from 'node:path';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const CORS = { 'Access-Control-Allow-Origin': '*' };

export async function OPTIONS() {
  return new Response(null, { status: 204, headers: CORS });
}

export async function GET(req: Request) {
  const sp = new URL(req.url).searchParams;
  const page = parseInt(sp.get('page') || '1', 10);
  const limit = parseInt(sp.get('limit') || '20', 10);
  const sort = sp.get('sort') || 'desc';
  const videoDir = path.join(process.cwd(), 'video');

  try {
    if (!fs.existsSync(videoDir)) {
      return Response.json({ list: [], total: 0, hasMore: false }, { headers: CORS });
    }
    const files = (await fs.promises.readdir(videoDir)).filter((f) =>
      /\.(mp4|webm|mkv|avi|mov|m4v)$/i.test(f)
    );
    const items = await Promise.all(
      files.map(async (f) => {
        const stats = await fs.promises.stat(path.join(videoDir, f));
        return {
          name: f,
          url: `/video/${encodeURIComponent(f)}`,
          size: stats.size,
          time: stats.mtime,
        };
      })
    );
    items.sort((a, b) =>
      sort === 'asc' ? +new Date(a.time) - +new Date(b.time) : +new Date(b.time) - +new Date(a.time)
    );
    const total = items.length;
    const start = (page - 1) * limit;
    const list = items.slice(start, start + limit);
    return Response.json(
      { list, total, hasMore: start + limit < total, page, limit },
      { headers: { ...CORS, 'Content-Type': 'application/json; charset=utf-8' } }
    );
  } catch (err: any) {
    return Response.json({ list: [], total: 0, hasMore: false, error: 'Failed to list videos喵~' }, { headers: CORS });
  }
}
