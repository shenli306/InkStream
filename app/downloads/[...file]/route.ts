import fs from 'node:fs';
import path from 'node:path';
import { getDownloadsDir } from '@/lib/paths';

// 原 vite.config.ts 中间件：静态提供 ./downloads 下的 EPUB。
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(_req: Request, ctx: { params: Promise<{ file: string[] }> }) {
  const { file } = await ctx.params;
  const rawPath = decodeURIComponent(file.join('/'));
  const safeName = rawPath.replace(/\.\./g, '').replace(/^\.+/, '');
  const filePath = path.join(getDownloadsDir(), safeName);
  try {
    const stats = await fs.promises.stat(filePath);
    if (!stats.isFile()) return new Response('Not found', { status: 404 });
    const stream = fs.createReadStream(filePath);
    return new Response(stream as any, {
      status: 200,
      headers: { 'Content-Type': 'application/epub+zip', 'Content-Length': String(stats.size) },
    });
  } catch {
    return new Response('Not found', { status: 404 });
  }
}
