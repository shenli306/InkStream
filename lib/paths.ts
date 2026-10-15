import fs from 'node:fs';
import path from 'node:path';

/**
 * 统一定位可写的 downloads 目录：
 *  - 本地开发 / 可写自托管：<cwd>/downloads
 *  - Vercel serverless（只读）：/tmp/downloads
 * 读写双方都用这个函数，避免写进 /tmp 却在 cwd 里列不出。喵~
 */
export function getDownloadsDir(): string {
  const cwdDir = path.join(process.cwd(), 'downloads');
  try {
    if (!fs.existsSync(cwdDir)) fs.mkdirSync(cwdDir, { recursive: true });
    fs.accessSync(cwdDir, fs.constants.W_OK);
    return cwdDir;
  } catch {
    const tmpDir = path.join('/tmp', 'downloads');
    try {
      fs.mkdirSync(tmpDir, { recursive: true });
    } catch {}
    return tmpDir;
  }
}
