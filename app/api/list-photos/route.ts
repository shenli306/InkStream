import fs from 'node:fs';
import path from 'node:path';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const CORS = { 'Access-Control-Allow-Origin': '*' };
const PHOTO_DIR = 'Photo album';

export async function OPTIONS() {
  return new Response(null, { status: 204, headers: CORS });
}

export async function GET(req: Request) {
  const folder = new URL(req.url).searchParams.get('folder');
  if (!folder) {
    return Response.json({ error: 'Folder parameter is required' }, { status: 400, headers: CORS });
  }
  const targetDir = path.join(process.cwd(), PHOTO_DIR, folder.replace(/[\\/:*?"<>|]/g, '_'));
  try {
    if (!fs.existsSync(targetDir)) {
      return Response.json({ list: [], total: 0, hasMore: false, page: 1, limit: 50 }, { headers: CORS });
    }
    const files = (await fs.promises.readdir(targetDir)).filter((f) =>
      /\.(jpg|jpeg|png|gif|webp|avif|bmp)$/i.test(f)
    );
    const items = await Promise.all(
      files.map(async (f) => {
        const stats = await fs.promises.stat(path.join(targetDir, f));
        return { name: f, url: `/photo/${encodeURIComponent(folder)}/${encodeURIComponent(f)}`, size: stats.size, time: stats.mtime };
      })
    );
    items.sort((a, b) => +new Date(b.time) - +new Date(a.time));
    return Response.json(
      { list: items, total: items.length, hasMore: false, page: 1, limit: 50 },
      { headers: { ...CORS, 'Content-Type': 'application/json; charset=utf-8' } }
    );
  } catch {
    return Response.json({ error: 'Failed to list photos喵~' }, { headers: CORS });
  }
}
