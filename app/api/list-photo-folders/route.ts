import fs from 'node:fs';
import path from 'node:path';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const CORS = { 'Access-Control-Allow-Origin': '*' };
const PHOTO_DIR = 'Photo album';

export async function OPTIONS() {
  return new Response(null, { status: 204, headers: CORS });
}

export async function GET() {
  const photoDir = path.join(process.cwd(), PHOTO_DIR);
  try {
    if (!fs.existsSync(photoDir)) return Response.json({ list: [] }, { headers: CORS });
    const entries = await fs.promises.readdir(photoDir, { withFileTypes: true });
    const folders = await Promise.all(
      entries
        .filter((e) => e.isDirectory())
        .map(async (e) => {
          const stats = await fs.promises.stat(path.join(photoDir, e.name));
          return { name: e.name, time: stats.mtime };
        })
    );
    folders.sort((a, b) => +new Date(b.time) - +new Date(a.time));
    return Response.json({ list: folders }, { headers: { ...CORS, 'Content-Type': 'application/json; charset=utf-8' } });
  } catch {
    return Response.json({ list: [], error: 'Failed to list photo folders喵~' }, { headers: CORS });
  }
}
