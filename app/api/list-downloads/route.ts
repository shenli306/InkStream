import JSZip from 'jszip';
import fs from 'node:fs';
import path from 'node:path';
import { getDownloadsDir } from '@/lib/paths';

// 本地（next dev / 自托管）从 ./downloads 读取 EPUB 并解析元数据；
// serverless 上目录不存在则返回 []（与原 api/list-downloads.js 契约一致）。
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const CORS = { 'Access-Control-Allow-Origin': '*' };

export async function OPTIONS() {
  return new Response(null, { status: 204, headers: CORS });
}

export async function GET(req: Request) {
  const keyword = new URL(req.url).searchParams.get('keyword') || '';
  const dir = getDownloadsDir();
  try {
    if (!fs.existsSync(dir)) return Response.json([], { headers: CORS });
    const files = (await fs.promises.readdir(dir)).filter((f) => f.endsWith('.epub'));
    const matched = files.filter((f) => !keyword || f.toLowerCase().includes(keyword.toLowerCase()));

    const list = await Promise.all(
      matched.map(async (f) => {
        const filePath = path.join(dir, f);
        const decodedName = decodeURIComponent(f).replace('.epub', '');
        try {
          const stats = await fs.promises.stat(filePath);
          const data = await fs.promises.readFile(filePath);
          const zip = await JSZip.loadAsync(data);

          let opfFile = zip.file('OEBPS/content.opf') || zip.file('content.opf');
          if (!opfFile) {
            const opfPath = Object.keys(zip.files).find((k) => k.endsWith('.opf'));
            if (opfPath) opfFile = zip.file(opfPath);
          }

          let title = decodedName;
          let author = '未知';
          let description = '已下载文件';
          let coverUrl = '';
          let chapterCount = 0;

          if (opfFile) {
            const opfContent = await opfFile.async('string');
            const titleMatch = opfContent.match(/<dc:title[^>]*>([\s\S]*?)<\/dc:title>/i);
            if (titleMatch) title = titleMatch[1].replace(/<!\[CDATA\[/g, '').replace(/\]\]>/g, '').trim();
            const authorMatch = opfContent.match(/<dc:creator[^>]*>([\s\S]*?)<\/dc:creator>/i);
            if (authorMatch) author = authorMatch[1].replace(/<!\[CDATA\[/g, '').replace(/\]\]>/g, '').trim();
            const descMatch = opfContent.match(/<dc:description[^>]*>([\s\S]*?)<\/dc:description>/i);
            if (descMatch) description = descMatch[1].replace(/<!\[CDATA\[/g, '').replace(/\]\]>/g, '').trim();
            const spineMatch = opfContent.match(/<spine[^>]*>([\s\S]*?)<\/spine>/i);
            if (spineMatch) {
              const itemrefs = spineMatch[1].match(/<itemref/gi);
              if (itemrefs) chapterCount = itemrefs.length;
            }
            if (opfContent.includes('media-type="image/') || opfContent.includes('properties="cover-image"')) {
              coverUrl = `/api/cover/${encodeURIComponent(f)}`;
            }
          }

          const chapters = new Array(chapterCount).fill(null).map((_, i) => ({
            title: `第 ${i + 1} 章`,
            url: '',
            number: i + 1,
          }));

          return {
            title, author, filename: f, size: stats.size, time: stats.mtime,
            url: `/downloads/${f}`, description, coverUrl, chapters,
          };
        } catch {
          return {
            title: decodedName, filename: f, size: 0, time: new Date(),
            url: `/downloads/${f}`, description: '无法读取文件 (可能正在下载或被占用)', coverUrl: '',
          };
        }
      })
    );

    return Response.json(list, {
      headers: { ...CORS, 'Content-Type': 'application/json; charset=utf-8' },
    });
  } catch (err: any) {
    console.error('Error listing downloads:', err);
    return Response.json([], { headers: CORS });
  }
}
