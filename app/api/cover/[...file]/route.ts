import JSZip from 'jszip';
import fs from 'node:fs';
import path from 'node:path';
import { getDownloadsDir } from '@/lib/paths';

// 原 vite.config.ts 中间件 /api/cover/: 从 downloads 里的 EPUB 抽取封面图。
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const MIME: Record<string, string> = {
  jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png',
  gif: 'image/gif', webp: 'image/webp', svg: 'image/svg+xml',
};

export async function GET(_req: Request, ctx: { params: Promise<{ file: string[] }> }) {
  const { file } = await ctx.params;
  const filenameEncoded = file.join('/');
  try {
    const safeName = decodeURIComponent(filenameEncoded).replace(/[\\/:*?"<>|]/g, '_').replace(/^\.+/, '');
    const filePath = path.join(getDownloadsDir(), safeName);
    if (!fs.existsSync(filePath)) return new Response('File not found', { status: 404 });

    const data = await fs.promises.readFile(filePath);
    const zip = await JSZip.loadAsync(data);

    let opfPath = Object.keys(zip.files).find((k) => k.endsWith('.opf'));
    if (!opfPath) return new Response('OPF not found', { status: 404 });
    const opfContent = await zip.file(opfPath)!.async('string');

    // 找 cover-image 或 meta name="cover"
    let coverHref: string | null = null;
    const coverItem = opfContent.match(/<item[^>]+properties=["'][^"']*cover-image[^"']*["'][^>]*href=["']([^"']+)["']/i)
      || opfContent.match(/<item[^>]+href=["']([^"']+)["'][^>]*properties=["'][^"']*cover-image[^"']*["']/i);
    if (coverItem) coverHref = coverItem[1];

    if (!coverHref) {
      const metaCover = opfContent.match(/<meta[^>]+name=["']cover["'][^>]+content=["']([^"']+)["']/i);
      if (metaCover) {
        const id = metaCover[1];
        const itemById = opfContent.match(new RegExp(`<item[^>]+id=["']${id}["'][^>]+href=["']([^"']+)["']`, 'i'))
          || opfContent.match(new RegExp(`<item[^>]+href=["']([^"']+)["'][^>]+id=["']${id}["']`, 'i'));
        if (itemById) coverHref = itemById[1];
      }
    }

    if (!coverHref) return new Response('Cover not found in epub', { status: 404 });

    const opfDir = path.posix.dirname(opfPath);
    const coverPath = path.posix.normalize(path.posix.join(opfDir === '.' ? '' : opfDir, coverHref));
    const coverFile = zip.file(coverPath) || zip.file(coverHref);
    if (!coverFile) return new Response('Cover not found in epub', { status: 404 });

    const buf = await coverFile.async('nodebuffer');
    const ext = (coverPath.split('.').pop() || '').toLowerCase();
    const mime = MIME[ext] || 'application/octet-stream';
    return new Response(new Uint8Array(buf), {
      status: 200,
      headers: { 'Content-Type': mime, 'Cache-Control': 'public, max-age=86400' },
    });
  } catch (e: any) {
    console.error('[cover]', e);
    return new Response('Read error', { status: 500 });
  }
}
