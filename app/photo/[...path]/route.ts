import fs from 'node:fs';
import path from 'node:path';

// 原 vite.config.ts 中间件：静态提供 'Photo album/' 下的图片。
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const MIME: Record<string, string> = {
  jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', gif: 'image/gif',
  webp: 'image/webp', avif: 'image/avif', bmp: 'image/bmp',
};
const PHOTO_DIR = 'Photo album';

export async function GET(_req: Request, ctx: { params: Promise<{ path: string[] }> }) {
  const { path: segs } = await ctx.params;
  const rawPath = decodeURIComponent(segs.join('/'));
  const safeSegs = rawPath.split('/').map((s) => s.replace(/[\\:*?"<>|]/g, '_')).filter((s) => s !== '..');
  const filePath = path.join(process.cwd(), PHOTO_DIR, ...safeSegs);
  try {
    const stats = await fs.promises.stat(filePath);
    if (!stats.isFile()) return new Response('Not found', { status: 404 });
    const ext = (filePath.split('.').pop() || '').toLowerCase();
    const stream = fs.createReadStream(filePath);
    return new Response(stream as any, {
      status: 200,
      headers: { 'Content-Type': MIME[ext] || 'application/octet-stream', 'Content-Length': String(stats.size) },
    });
  } catch {
    return new Response('Not found', { status: 404 });
  }
}
