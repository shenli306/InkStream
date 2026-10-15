import fs from 'node:fs';
import path from 'node:path';

// 原 vite.config.ts 中间件：带 Range 支持的视频流。喵~
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const MIME: Record<string, string> = {
  mp4: 'video/mp4', webm: 'video/webm', mkv: 'video/x-matroska',
  avi: 'video/x-msvideo', mov: 'video/quicktime', m4v: 'video/x-m4v',
};

export async function GET(req: Request, ctx: { params: Promise<{ file: string[] }> }) {
  const { file } = await ctx.params;
  const rawPath = decodeURIComponent(file.join('/'));
  const safeName = rawPath.replace(/\.\./g, '').replace(/^\.+/, '');
  const filePath = path.join(process.cwd(), 'video', safeName);
  try {
    const stats = await fs.promises.stat(filePath);
    if (!stats.isFile()) return new Response('Not found', { status: 404 });
    const fileSize = stats.size;
    const ext = (safeName.split('.').pop() || '').toLowerCase();
    const contentType = MIME[ext] || 'application/octet-stream';

    const range = req.headers.get('range');
    if (range) {
      const m = range.match(/bytes=(\d*)-(\d*)/);
      if (m) {
        let start = m[1] ? parseInt(m[1], 10) : 0;
        let end = m[2] ? parseInt(m[2], 10) : fileSize - 1;
        if (isNaN(start) || start < 0) start = 0;
        if (isNaN(end) || end >= fileSize) end = fileSize - 1;
        if (start > end) {
          return new Response(null, { status: 416, headers: { 'Content-Range': `bytes */${fileSize}` } });
        }
        const stream = fs.createReadStream(filePath, { start, end });
        return new Response(stream as any, {
          status: 206,
          headers: {
            'Content-Type': contentType,
            'Content-Length': String(end - start + 1),
            'Content-Range': `bytes ${start}-${end}/${fileSize}`,
            'Accept-Ranges': 'bytes',
          },
        });
      }
    }

    const stream = fs.createReadStream(filePath);
    return new Response(stream as any, {
      status: 200,
      headers: { 'Content-Type': contentType, 'Content-Length': String(fileSize), 'Accept-Ranges': 'bytes' },
    });
  } catch {
    return new Response('Not found', { status: 404 });
  }
}
