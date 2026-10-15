import fs from 'node:fs';
import path from 'node:path';
import { getDownloadsDir } from '@/lib/paths';

// 原 vite.config.ts 中间件：把 EPUB 写入 ./downloads。
// Vercel serverless 文件系统只读，回退到 /tmp（写入仍成功，但不会持久化）。喵~
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 30;

export async function POST(req: Request) {
  const filenameHeader = req.headers.get('x-filename');
  if (!filenameHeader) {
    return new Response('Missing filename', { status: 400 });
  }
  const filename = decodeURIComponent(filenameHeader);
  const safeName = filename.replace(/[\\/:*?"<>|]/g, '_').replace(/^\.+/, '');

  const dir = getDownloadsDir();

  const filePath = path.join(dir, safeName);
  try {
    const buf = Buffer.from(await req.arrayBuffer());
    await fs.promises.writeFile(filePath, buf);
    return Response.json({ success: true, url: `/downloads/${safeName}` });
  } catch (err: any) {
    console.error('[save-epub]', err);
    return new Response(err.message, { status: 500 });
  }
}
