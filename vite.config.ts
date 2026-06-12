import path from 'path';
import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, '.', '');
  return {
    server: {
      port: 3000,
      allowedHosts: ['www.306825.xyz'], // 新增这一行，解决主机访问限制
      host: '0.0.0.0',
      proxy: {
        '/proxy/wanbenge': {
          target: 'https://www.jizai22.com',
          changeOrigin: true,
          secure: false,
          rewrite: (path) => path.replace(/^\/proxy\/wanbenge/, ''),
          headers: {
            'Referer': 'https://www.jizai22.com/',
            'Origin': 'https://www.jizai22.com',
            'User-Agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.0 Mobile/15E148 Safari/604.1'
          }
        },
        '/proxy/shukuge': {
          target: 'http://www.shukuge.com',
          changeOrigin: true,
          secure: false,
          rewrite: (path) => path.replace(/^\/proxy\/shukuge/, ''),
          headers: {
            'Referer': 'http://www.shukuge.com/',
            'Origin': 'http://www.shukuge.com',
            'User-Agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.0 Mobile/15E148 Safari/604.1'
          }
        },
        '/proxy/dingdian': {
          target: 'https://www.23ddw.net',
          changeOrigin: true,
          secure: false,
          rewrite: (path) => path.replace(/^\/proxy\/dingdian/, ''),
          headers: {
            'Referer': 'https://www.23ddw.net/',
            'Origin': 'https://www.23ddw.net',
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
          }
        },
        '/proxy/alicesw': {
          target: 'https://www.alicesw.com',
          changeOrigin: true,
          secure: false,
          rewrite: (path) => path.replace(/^\/proxy\/alicesw/, ''),
          headers: {
            'Referer': 'https://www.alicesw.com/',
            'Origin': 'https://www.alicesw.com',
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
          }
        },
        // xpxs proxy removed - domain is for sale
      }
    },
    plugins: [
      react(),
      {
        name: 'configure-server',
        configureServer(server) {
          // 本地开发启动时，自动清理旧弹幕（模拟服务器重启）喵~
          import('fs').then(fs => {
             import('path').then(path => {
                const danmakuFile = path.join(__dirname, 'danmaku.json');
                if (fs.existsSync(danmakuFile)) {
                    console.log("[Vite Dev] Clearing danmaku on startup 喵~");
                    try {
                        fs.unlinkSync(danmakuFile);
                    } catch (e) {
                        console.warn("[Vite Dev] Failed to clear danmaku:", e);
                    }
                }
             });
          });

          server.middlewares.use((req, res, next) => {
            const url = req.url ? new URL(req.url, `http://${req.headers.host}`) : null;
            if (!url) return next();
            
            // 0. 调试测试 API
            if (url.pathname === '/api/debug-search') {
              const keyword = url.searchParams.get('keyword') || '斗罗大陆';
              
              res.setHeader('Content-Type', 'application/json; charset=utf-8');
              res.setHeader('Access-Control-Allow-Origin', '*');
              
              console.log(`[Debug API] Searching for: ${keyword}`);
              
              // 这里我们直接返回测试数据，因为要在前端直接调用
              res.end(JSON.stringify({
                success: true,
                keyword,
                message: '请在主应用中测试搜索功能'
              }));
              return;
            }

            // 0.1 书源测试 API
            if (url.pathname === '/api/test-source') {
              const source = url.searchParams.get('source');
              const keyword = url.searchParams.get('keyword') || '斗罗大陆';
              
              res.setHeader('Content-Type', 'application/json; charset=utf-8');
              res.setHeader('Access-Control-Allow-Origin', '*');
              
              console.log(`[Test Source API] Testing ${source} with keyword: ${keyword}喵~`);
              
              // 返回指令让前端调用实际的搜索功能
              res.end(JSON.stringify({
                success: true,
                message: `请使用前端的 ${source} 书源进行搜索测试`,
                instruction: `调用 searchNovel("${keyword}", "${source}")`,
                source,
                keyword
              }));
              return;
            }

            // 1. Save EPUB API
            if (url.pathname === '/api/save-epub') {
              if (req.method !== 'POST') return next();

              const filenameHeader = req.headers['x-filename'] as string;
              if (!filenameHeader) { res.statusCode = 400; res.end('Missing filename'); return; }
              const filename = decodeURIComponent(filenameHeader);

              import('fs').then(async (fs) => {
                const fsPromises = fs.promises;
                // 更严格的文件名过滤，防止路径穿越喵~
                const safeName = filename.replace(/[\\/:*?"<>|]/g, "_").replace(/^\.+/, "");
                const dir = path.join(__dirname, 'downloads');

                try {
                  await fsPromises.access(dir);
                } catch {
                  await fsPromises.mkdir(dir, { recursive: true });
                }

                const filePath = path.join(dir, safeName);
                const writeStream = fs.createWriteStream(filePath);
                req.pipe(writeStream);

                writeStream.on('finish', () => {
                  res.end(JSON.stringify({ success: true, url: `/downloads/${safeName}` }));
                });
                writeStream.on('error', (err) => {
                  console.error(err);
                  res.statusCode = 500;
                  res.end(err.message);
                });
              });
              return;
            }

            // 2. List Downloads API (with metadata extraction)
            if (url.pathname === '/api/list-downloads') {
              const keyword = url.searchParams.get('keyword') || '';

              import('fs').then(async (fs) => {
                const fsPromises = fs.promises;
                import('jszip').then(async (JSZip) => {
                  const dir = path.join(__dirname, 'downloads');

                  try {
                    await fsPromises.access(dir);
                  } catch {
                    res.end(JSON.stringify([]));
                    return;
                  }

                  try {
                    const files = await fsPromises.readdir(dir);
                    const epubFiles = files.filter(f => f.endsWith('.epub'));
                    const matched = epubFiles.filter(f => !keyword || f.toLowerCase().includes(keyword.toLowerCase()));

                    const list = matched.map(async (f) => {
                      const filePath = path.join(dir, f);
                      const decodedName = decodeURIComponent(f).replace('.epub', '');

                      try {
                        const stats = await fsPromises.stat(filePath);
                        const data = await fsPromises.readFile(filePath);
                        const zip = await JSZip.default.loadAsync(data);

                        // Basic Metadata Check
                        let opfFile = zip.file("OEBPS/content.opf") || zip.file("content.opf");
                        if (!opfFile) {
                          const files = Object.keys(zip.files);
                          const opfPath = files.find(k => k.endsWith('.opf'));
                          if (opfPath) opfFile = zip.file(opfPath);
                        }

                        let title = decodedName;
                        let author = "未知";
                        let description = "已下载文件";
                        let coverUrl = "";
                        let chapterCount = 0;

                        if (opfFile) {
                          const opfContent = await opfFile.async("string");

                          const titleMatch = opfContent.match(/<dc:title[^>]*>([\s\S]*?)<\/dc:title>/i);
                          if (titleMatch) title = titleMatch[1].replace(/<!\[CDATA\[/g, '').replace(/\]\]>/g, '').trim();

                          const authorMatch = opfContent.match(/<dc:creator[^>]*>([\s\S]*?)<\/dc:creator>/i);
                          if (authorMatch) author = authorMatch[1].replace(/<!\[CDATA\[/g, '').replace(/\]\]>/g, '').trim();

                          const descMatch = opfContent.match(/<dc:description[^>]*>([\s\S]*?)<\/dc:description>/i);
                          if (descMatch) description = descMatch[1].replace(/<!\[CDATA\[/g, '').replace(/\]\]>/g, '').trim();

                          const spineMatch = opfContent.match(/<spine[^>]*>([\s\S]*?)<\/spine>/i);
                          if (spineMatch) {
                            const spineContent = spineMatch[1];
                            const itemrefs = spineContent.match(/<itemref/gi);
                            if (itemrefs) chapterCount = itemrefs.length;
                          }

                          if (opfContent.includes('media-type="image/') || opfContent.includes('properties="cover-image"')) {
                            coverUrl = `/api/cover/${encodeURIComponent(f)}`;
                          }
                        }

                        // Create dummy chapters array for count
                        const chapters = new Array(chapterCount).fill(null).map((_, i) => ({
                          title: `第 ${i + 1} 章`,
                          url: '',
                          number: i + 1
                        }));

                        return {
                          title,
                          author,
                          filename: f,
                          size: stats.size,
                          time: stats.mtime,
                          url: `/downloads/${f}`,
                          description,
                          coverUrl,
                          chapters
                        };
                      } catch (e) {
                        // File might be locked or corrupt, return minimal info implies "processing" or "error"
                        // But for list view, just showing filename is safer than crashing
                        return {
                          title: decodedName,
                          filename: f,
                          size: 0,
                          time: new Date(),
                          url: `/downloads/${f}`,
                          description: "无法读取文件 (可能正在下载或被占用)",
                          coverUrl: ""
                        };
                      }
                    });

                    const results = await Promise.all(list);
                    res.setHeader('Content-Type', 'application/json; charset=utf-8');
                    res.end(JSON.stringify(results));

                  } catch (err) {
                    console.error("Error listing downloads:", err);
                    res.statusCode = 500;
                    res.end(JSON.stringify([]));
                  }
                });
              });
              return;
            }

            // 2.2 List Videos API (zyd feature) 喵~
            if (url.pathname === '/api/list-videos') {
              const page = parseInt(url.searchParams.get('page') || '1', 10);
              const limit = parseInt(url.searchParams.get('limit') || '20', 10);
              const sort = url.searchParams.get('sort') || 'desc';

              import('fs').then(async (fs) => {
                const fsPromises = fs.promises;
                const videoDir = path.join(__dirname, 'video');

                try {
                  await fsPromises.access(videoDir);
                } catch {
                  await fsPromises.mkdir(videoDir, { recursive: true });
                  res.setHeader('Content-Type', 'application/json; charset=utf-8');
                  res.end(JSON.stringify({ list: [], total: 0, hasMore: false }));
                  return;
                }

                try {
                  const files = await fsPromises.readdir(videoDir);
                  const videoExtensions = ['.mp4', '.mov', '.avi', '.webm', '.mkv'];
                  const videoFiles = files.filter(f => videoExtensions.some(ext => f.toLowerCase().endsWith(ext)));

                  // 获取文件统计信息并进行排序喵~
                  const listWithStats = await Promise.all(videoFiles.map(async (f) => {
                    try {
                      const filePath = path.join(videoDir, f);
                      const stats = await fsPromises.stat(filePath);
                      return {
                        filename: f,
                        size: stats.size,
                        time: stats.mtime.toISOString(), // 精确到毫秒的 ISO 8601 格式喵~
                        mtimeMs: stats.mtimeMs,
                        url: `/video/${encodeURIComponent(f)}`,
                        type: 'video'
                      };
                    } catch (e) {
                      return null;
                    }
                  }));

                  const validList = listWithStats.filter(item => item !== null) as any[];
                  
                  // 排序逻辑喵~
                  validList.sort((a, b) => {
                    return sort === 'desc' ? b.mtimeMs - a.mtimeMs : a.mtimeMs - b.mtimeMs;
                  });

                  // 分页逻辑喵~
                  const total = validList.length;
                  const startIndex = (page - 1) * limit;
                  const endIndex = startIndex + limit;
                  const paginatedList = validList.slice(startIndex, endIndex);
                  const hasMore = endIndex < total;

                  res.setHeader('Content-Type', 'application/json; charset=utf-8');
                  res.end(JSON.stringify({ 
                    list: paginatedList, 
                    total, 
                    hasMore,
                    page,
                    limit
                  }));
                } catch (err) {
                  console.error("Error listing videos:", err);
                  res.statusCode = 500;
                  res.end(JSON.stringify({ error: "Failed to list videos喵~" }));
                }
              });
              return;
            }

            // 2. Photo Album API 喵~
            if (url.pathname === '/api/list-photo-folders') {
              import('fs').then(async (fs) => {
                const fsPromises = fs.promises;
                const photoDir = path.join(__dirname, 'Photo album');

                try {
                  await fsPromises.access(photoDir);
                } catch {
                  await fsPromises.mkdir(photoDir, { recursive: true });
                  res.setHeader('Content-Type', 'application/json; charset=utf-8');
                  res.end(JSON.stringify({ list: [] }));
                  return;
                }

                try {
                  const entries = await fsPromises.readdir(photoDir, { withFileTypes: true });
                  const folders = await Promise.all(entries
                    .filter(entry => entry.isDirectory())
                    .map(async (entry) => {
                      const folderPath = path.join(photoDir, entry.name);
                      const stats = await fsPromises.stat(folderPath);
                      return {
                        name: entry.name,
                        mtimeMs: stats.mtimeMs,
                        time: stats.mtime.toISOString(),
                        type: 'folder'
                      };
                    }));

                  // 文件夹按修改时间排序喵~
                  folders.sort((a, b) => b.mtimeMs - a.mtimeMs);

                  res.setHeader('Content-Type', 'application/json; charset=utf-8');
                  res.end(JSON.stringify({ list: folders }));
                } catch (err) {
                  res.statusCode = 500;
                  res.end(JSON.stringify({ error: "Failed to list photo folders喵~" }));
                }
              });
              return;
            }

            if (url.pathname === '/api/list-photos') {
              const folder = url.searchParams.get('folder') || '';
              const page = parseInt(url.searchParams.get('page') || '1', 10);
              const limit = parseInt(url.searchParams.get('limit') || '50', 10);

              if (!folder) {
                res.statusCode = 400;
                res.end(JSON.stringify({ error: "Folder parameter is required喵~" }));
                return;
              }

              import('fs').then(async (fs) => {
                const fsPromises = fs.promises;
                const targetDir = path.join(__dirname, 'Photo album', folder.replace(/[\\/:*?"<>|]/g, "_"));

                try {
                  const files = await fsPromises.readdir(targetDir);
                  const imageExtensions = ['.jpg', '.jpeg', '.png', '.gif', '.webp', '.heic'];
                  const imageFiles = files.filter(f => imageExtensions.some(ext => f.toLowerCase().endsWith(ext)));

                  const listWithStats = await Promise.all(imageFiles.map(async (f) => {
                    try {
                      const filePath = path.join(targetDir, f);
                      const stats = await fsPromises.stat(filePath);
                      return {
                        filename: f,
                        size: stats.size,
                        time: stats.mtime.toISOString(),
                        mtimeMs: stats.mtimeMs,
                        url: `/photo/${encodeURIComponent(folder)}/${encodeURIComponent(f)}`,
                        type: 'image'
                      };
                    } catch (e) {
                      return null;
                    }
                  }));

                  const validList = listWithStats.filter(item => item !== null) as any[];

                  // 优先按文件名排序（因为文件名包含时间戳），如果文件名不包含时间戳则按修改时间排序喵~
                  validList.sort((a, b) => {
                    return b.filename.localeCompare(a.filename);
                  });

                  const total = validList.length;
                  const startIndex = (page - 1) * limit;
                  const endIndex = startIndex + limit;
                  const paginatedList = validList.slice(startIndex, endIndex);
                  const hasMore = endIndex < total;

                  res.setHeader('Content-Type', 'application/json; charset=utf-8');
                  res.end(JSON.stringify({
                    list: paginatedList,
                    total,
                    hasMore,
                    page,
                    limit
                  }));
                } catch (err) {
                  res.statusCode = 500;
                  res.end(JSON.stringify({ error: "Failed to list photos喵~" }));
                }
              });
              return;
            }

            // 2.1 Cover Image API
            if (url.pathname.startsWith('/api/cover/')) {
              const filenameEncoded = url.pathname.replace('/api/cover/', '');
              const filename = decodeURIComponent(filenameEncoded);
              // 安全审计：防止路径穿越喵~
              const safeName = filename.replace(/[\\/:*?"<>|]/g, "_").replace(/^\.+/, "");

              import('fs').then(async (fs) => {
                const fsPromises = fs.promises;
                import('jszip').then(async (JSZip) => {
                  const filePath = path.join(__dirname, 'downloads', safeName);

                  try {
                    await fsPromises.access(filePath);
                  } catch {
                    res.statusCode = 404; res.end('File not found'); return;
                  }

                  try {
                    const data = await fsPromises.readFile(filePath);
                    const zip = await JSZip.default.loadAsync(data);

                    // Find OPF
                    let opfPath = "OEBPS/content.opf";
                    if (!zip.file(opfPath)) {
                      opfPath = Object.keys(zip.files).find(k => k.endsWith('.opf')) || "";
                    }

                    if (!opfPath || !zip.file(opfPath)) { res.statusCode = 404; res.end('OPF not found'); return; }

                    const opfContent = await zip.file(opfPath)?.async("string");
                    if (!opfContent) { res.statusCode = 404; res.end('OPF empty'); return; }

                    // Logic to find cover image href
                    // 1. Look for <meta name="cover" content="cover-image-id"/>
                    let coverHref = "";
                    const metaCover = opfContent.match(/<meta\s+name="cover"\s+content="([^"]+)"/i);
                    if (metaCover) {
                      const coverId = metaCover[1];
                      // Find item with id=coverId
                      const itemRegex = new RegExp(`<item\\s+[^>]*id="${coverId}"[^>]*href="([^"]+)"`, 'i');
                      const itemMatch = opfContent.match(itemRegex);
                      if (itemMatch) coverHref = itemMatch[1];
                    }

                    // 2. Look for item properties="cover-image"
                    if (!coverHref) {
                      const propMatch = opfContent.match(/<item\s+[^>]*href="([^"]+)"[^>]*properties="cover-image"/i);
                      if (propMatch) coverHref = propMatch[1];
                    }

                    // 3. Fallback: cover.jpg/png in same dir as OPF
                    if (!coverHref) {
                      // Try common names relative to OPF
                      if (zip.file(path.posix.join(path.posix.dirname(opfPath), 'cover.jpg'))) coverHref = 'cover.jpg';
                      if (zip.file(path.posix.join(path.posix.dirname(opfPath), 'cover.png'))) coverHref = 'cover.png';
                    }

                    if (coverHref) {
                      // Resolve relative path from OPF
                      const coverPath = path.posix.join(path.posix.dirname(opfPath), coverHref);
                      const file = zip.file(coverPath);
                      if (file) {
                        // Determine mime type
                        const ext = path.extname(coverPath).toLowerCase();
                        const mime = ext === '.png' ? 'image/png' : 'image/jpeg';
                        res.setHeader('Content-Type', mime);
                        file.nodeStream().pipe(res);
                        return;
                      }
                    }

                    // Not found
                    res.statusCode = 404;
                    res.end('Cover not found in epub');

                  } catch (err) {
                    res.statusCode = 500; res.end('Read error'); return;
                  }
                });
              });
              return;
            }

            // 3. Serve Downloads Static
            if (url.pathname.startsWith('/downloads/')) {
              import('fs').then(async (fs) => {
                const fsPromises = fs.promises;
                const rawPath = decodeURIComponent(url.pathname).replace(/^\/downloads\//, '');
                // 安全审计：防止路径穿越喵~
                const safeName = rawPath.replace(/[\\/:*?"<>|]/g, "_").replace(/^\.+/, "");
                const filePath = path.join(__dirname, 'downloads', safeName);

                try {
                  const stats = await fsPromises.stat(filePath);
                  if (stats.isFile()) {
                    res.setHeader('Content-Type', 'application/epub+zip');
                    fs.createReadStream(filePath).pipe(res);
                  } else {
                    next();
                  }
                } catch {
                  next();
                }
              });
              return;
            }

            // 3.1 Serve Videos Static 喵~
            if (url.pathname.startsWith('/video/')) {
              import('fs').then(async (fs) => {
                const fsPromises = fs.promises;
                const rawPath = decodeURIComponent(url.pathname).replace(/^\/video\//, '');
                const safeName = rawPath.replace(/[\\/:*?"<>|]/g, "_").replace(/^\.+/, "");
                const filePath = path.join(__dirname, 'video', safeName);

                try {
                  const stats = await fsPromises.stat(filePath);
                  if (stats.isFile()) {
                    const ext = path.extname(safeName).toLowerCase();
                    const mimeTypes: Record<string, string> = {
                      '.mp4': 'video/mp4', '.mov': 'video/quicktime', '.avi': 'video/x-msvideo',
                      '.webm': 'video/webm', '.mkv': 'video/x-matroska'
                    };
                    const contentType = mimeTypes[ext] || 'application/octet-stream';
                    const fileSize = stats.size;
                    const range = req.headers.range;

                    if (range) {
                      // 处理 Range 请求，让进度条调节丝滑顺畅喵~
                      const parts = range.replace(/bytes=/, "").split("-");
                      const start = parseInt(parts[0], 10);
                      const end = parts[1] ? parseInt(parts[1], 10) : fileSize - 1;

                      // 边界检查喵~
                      const safeStart = Math.max(0, start);
                      const safeEnd = Math.min(end, fileSize - 1);

                      if (safeStart >= fileSize) {
                        res.statusCode = 416;
                        res.setHeader('Content-Range', `bytes */${fileSize}`);
                        res.end();
                        return;
                      }

                      const chunksize = (safeEnd - safeStart) + 1;
                      const file = fs.createReadStream(filePath, { start: safeStart, end: safeEnd });
                      
                      res.writeHead(206, {
                        'Content-Range': `bytes ${safeStart}-${safeEnd}/${fileSize}`,
                        'Accept-Ranges': 'bytes',
                        'Content-Length': chunksize,
                        'Content-Type': contentType,
                        'Cache-Control': 'public, max-age=3600', // 缓存一小时喵~
                        'Connection': 'keep-alive'
                      });
                      file.pipe(res);
                    } else {
                      // 普通完整请求喵~
                      res.writeHead(200, {
                        'Content-Length': fileSize,
                        'Content-Type': contentType,
                        'Accept-Ranges': 'bytes',
                        'Cache-Control': 'public, max-age=3600'
                      });
                      fs.createReadStream(filePath).pipe(res);
                    }
                  } else {
                    next();
                  }
                } catch (err) {
                  next();
                }
              });
              return;
            }

            // 3.2 Serve Photos Static 喵~
            if (url.pathname.startsWith('/photo/')) {
              import('fs').then(async (fs) => {
                const fsPromises = fs.promises;
                const parts = decodeURIComponent(url.pathname).split('/');
                // /photo/[folder]/[filename]
                if (parts.length < 4) {
                  next();
                  return;
                }
                const folder = parts[2].replace(/[\\/:*?"<>|]/g, "_");
                const filename = parts[3].replace(/[\\/:*?"<>|]/g, "_");
                const filePath = path.join(__dirname, 'Photo album', folder, filename);

                try {
                  const stats = await fsPromises.stat(filePath);
                  if (stats.isFile()) {
                    const ext = path.extname(filename).toLowerCase();
                    const mimeTypes: Record<string, string> = {
                      '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png',
                      '.gif': 'image/gif', '.webp': 'image/webp', '.heic': 'image/heic'
                    };
                    const contentType = mimeTypes[ext] || 'application/octet-stream';
                    res.writeHead(200, {
                      'Content-Length': stats.size,
                      'Content-Type': contentType,
                      'Cache-Control': 'public, max-age=86400' // 缓存一天喵~
                    });
                    fs.createReadStream(filePath).pipe(res);
                  } else {
                    next();
                  }
                } catch (err) {
                  next();
                }
              });
              return;
            }

            // 4. GBK Search Proxy
            if (url.pathname === '/api/gbk-search') {
              const keyword = url.searchParams.get('keyword');
              // /api/gbk-search implementation
              import('http').then(http => {
                import('https').then(https => {
                  import('iconv-lite').then(iconv => {
                    const query = url.searchParams;
                    const targetTemplate = query.get('target') || '';
                    const keyword = query.get('keyword') || '';
                    const method = query.get('method')?.toUpperCase() || 'GET';
                    const bodyTemplate = query.get('data') || '';

                    if (!targetTemplate || !keyword) {
                      res.statusCode = 400;
                      res.end("Missing target or keyword");
                      return;
                    }

                    // Encode keyword to GBK
                    const gbkKeyword = iconv.default.encode(keyword, 'gbk');
                    const encodedKeyword = gbkKeyword.toString('hex').replace(/(..)/g, '%$1').toUpperCase();

                    let targetUrl = targetTemplate;
                    let requestBody = "";

                    if (method === 'POST') {
                      // For POST, targetTemplate is the URL, bodyTemplate is the data
                      requestBody = bodyTemplate.replace(/{keyword}/g, encodedKeyword);
                    } else {
                      // For GET, targetTemplate contains the query params
                      targetUrl = targetTemplate.replace(/{keyword}/g, encodedKeyword);
                    }

                    const isMobile = targetUrl.includes('m.qishu99.cc') || targetUrl.includes('mobile') || targetUrl.includes('powenwu7.com') || targetUrl.includes('jizai22.com');
                    const userAgent = isMobile
                      ? 'Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.0 Mobile/15E148 Safari/604.1'
                      : 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36 Edg/120.0.0.0';

                    const performRequest = (url: string, method: string, body: string | null = null, retryCount = 0) => {
                      let urlObj: URL;
                      try {
                        urlObj = new URL(url);
                      } catch (e) {
                        if (!res.headersSent) {
                          res.statusCode = 400;
                          res.end("Invalid target URL");
                        }
                        return;
                      }

                      // 安全审计：防止 SSRF 攻击喵~
                      const blockedHosts = ['localhost', '127.0.0.1', '0.0.0.0', '::1'];
                      const isPrivate = (host: string) => {
                        return blockedHosts.includes(host) || 
                               host.startsWith('192.168.') || 
                               host.startsWith('10.') || 
                               /^172\.(1[6-9]|2[0-9]|3[0-1])\./.test(host);
                      };

                      if (isPrivate(urlObj.hostname)) {
                        if (!res.headersSent) {
                          res.statusCode = 403;
                          res.end('Access to internal network is forbidden 喵~');
                        }
                        return;
                      }

                      const adapter = url.startsWith('https') ? https.default : http.default;

                      const options: any = {
                        method: method,
                        headers: {
                          'User-Agent': userAgent,
                          'Referer': (() => {
                            try { return new URL(targetTemplate).origin + '/'; } catch { return ''; }
                          })()
                        },
                        timeout: 10000 // 10 second timeout
                      };

                      if (body) {
                        options.headers['Content-Type'] = 'application/x-www-form-urlencoded';
                        options.headers['Content-Length'] = Buffer.byteLength(body);
                      }

                      if (method === 'POST') {
                      options.headers['Content-Type'] = 'application/x-www-form-urlencoded';
                      options.headers['Content-Length'] = Buffer.byteLength(body || '');
                    }

                    const proxyReq = adapter.request(urlObj, options, (proxyRes) => {
                        // Follow redirects
                        if (proxyRes.statusCode && proxyRes.statusCode >= 300 && proxyRes.statusCode < 400 && proxyRes.headers.location) {
                          let redirectUrl = proxyRes.headers.location;
                          try {
                            // 确保 base URL 结尾有斜杠，避免 new URL 拼错喵~
                            const baseUrl = url.endsWith('/') ? url : url + '/';
                            redirectUrl = new URL(redirectUrl, baseUrl).href;
                          } catch (e) {
                            console.error("[GBK Proxy] Redirect URL resolution failed喵~", e);
                          }
                          console.log(`[GBK Proxy] Following redirect to: ${redirectUrl}喵~`);
                          performRequest(redirectUrl, 'GET', null, retryCount);
                          return;
                        }

                        res.statusCode = proxyRes.statusCode || 200;
                        for (const [key, value] of Object.entries(proxyRes.headers)) {
                          if (value) res.setHeader(key, value);
                        }

                        proxyRes.pipe(res);
                      });

                      proxyReq.on('error', (e: any) => {
                        // 减少冗长的堆栈信息，只记录关键错误喵~
                        const isNetworkError = ['ECONNRESET', 'ETIMEDOUT', 'ECONNREFUSED', 'ENOTFOUND'].includes(e.code);
                        if (isNetworkError) {
                          console.error(`[Proxy Request Error] ${e.code}: ${e.message}`);
                        } else {
                          console.error("Proxy Request Error:", e);
                        }
                        
                        // Retry on ECONNRESET, ETIMEDOUT or ECONNREFUSED
                        if ((e.code === 'ECONNRESET' || e.code === 'ETIMEDOUT' || e.code === 'ECONNREFUSED') && retryCount < 1) {
                          console.warn(`[Proxy] Retrying ${urlObj.hostname} due to ${e.code}...喵~`);
                          performRequest(url, method, body, retryCount + 1);
                          return;
                        }

                        if (!res.headersSent) {
                          res.statusCode = 500;
                          res.end(e.message);
                        }
                      });

                      proxyReq.on('timeout', () => {
                        proxyReq.destroy();
                      });

                      if (body) {
                        proxyReq.write(body);
                      }
                      proxyReq.end();
                    };

                    performRequest(targetUrl, method, requestBody);

                  });
                });
              });
              return;
            }

            // 5. Generic Proxy
            if (url.pathname === '/api/proxy' || url.pathname.startsWith('/proxy/')) {
              let targetUrl = url.searchParams.get('url');
              
              // 适配 /proxy/site/path 格式喵~
              if (!targetUrl && url.pathname.startsWith('/proxy/')) {
                const parts = url.pathname.split('/');
                const site = parts[2];
                const path = parts.slice(3).join('/');
                const search = url.search;
                
                if (site === 'dingdian') {
                  targetUrl = `https://www.23ddw.net/${path}${search}`;
                } else if (site === 'wanbenge') {
                  targetUrl = `https://www.jizai22.com/${path}${search}`;
                } else if (site === 'shukuge') {
                  targetUrl = `http://www.shukuge.com/${path}${search}`;
                } else if (site === 'alicesw') {
                  targetUrl = `https://www.alicesw.com/${path}${search}`;
                }
              }

              if (!targetUrl) { res.statusCode = 400; res.end('Missing url param'); return; }

              // Handle local URLs (already relative to our server)
              if (targetUrl.startsWith('/api/') || targetUrl.startsWith('/downloads/')) {
                  res.statusCode = 302;
                  res.setHeader('Location', targetUrl);
                  res.end();
                  return;
              }

              import('http').then(http => {
                import('https').then(https => {
                  let urlObj: URL;
                  try {
                    urlObj = new URL(targetUrl);
                  } catch (e) {
                    res.statusCode = 400;
                    res.end('Invalid target URL');
                    return;
                  }

                  // 安全审计：防止 SSRF 攻击，禁止访问本地敏感地址喵~
                  const blockedHosts = ['localhost', '127.0.0.1', '0.0.0.0', '::1'];
                  const isPrivate = (host: string) => {
                    return blockedHosts.includes(host) || 
                           host.startsWith('192.168.') || 
                           host.startsWith('10.') || 
                           /^172\.(1[6-9]|2[0-9]|3[0-1])\./.test(host);
                  };

                  if (isPrivate(urlObj.hostname)) {
                    res.statusCode = 403;
                    res.end('Access to internal network is forbidden 喵~');
                    return;
                  }

                  const adapter = targetUrl.startsWith('https') ? https.default : http.default;

                  // Filter headers to forward
                  const headersToForward = { ...req.headers };
                  delete headersToForward.host;
                  delete headersToForward.connection;
                  delete headersToForward.origin;
                  delete headersToForward.referer; // Remove browser referer sent to localhost

                  // FORCE correct headers for target
                  const isMobileTarget = targetUrl.includes('jizai22.com') || targetUrl.includes('wanbenge');
                  const isAliceswTarget = targetUrl.includes('alicesw.com');
                  if (isMobileTarget) {
                      headersToForward['user-agent'] = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1';
                  } else if (isAliceswTarget) {
                      // 爱丽丝书屋需要更真实的浏览器请求头喵~
                      headersToForward['user-agent'] = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36 Edg/120.0.0.0';
                      headersToForward['sec-ch-ua'] = '"Not_A Brand";v="8", "Chromium";v="120", "Microsoft Edge";v="120"';
                      headersToForward['sec-ch-ua-mobile'] = '?0';
                      headersToForward['sec-ch-ua-platform'] = '"Windows"';
                      headersToForward['sec-fetch-dest'] = 'document';
                      headersToForward['sec-fetch-mode'] = 'navigate';
                      headersToForward['sec-fetch-site'] = 'none';
                      headersToForward['sec-fetch-user'] = '?1';
                  } else {
                      headersToForward['user-agent'] = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';
                  }
                  headersToForward['referer'] = urlObj.origin + '/'; // Force Referer to match target origin
                  headersToForward['accept'] = 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7';
                  headersToForward['accept-language'] = 'zh-CN,zh;q=0.9,en;q=0.8';
                  headersToForward['cache-control'] = 'no-cache';
                  headersToForward['pragma'] = 'no-cache';
                  headersToForward['upgrade-insecure-requests'] = '1';

                  const options = {
                method: req.method,
                headers: headersToForward,
                timeout: 10000
              };

              const makeRequest = (targetUrlObj: URL, currentOptions: any, redirectCount = 0): any => {
                if (redirectCount > 5) {
                  res.statusCode = 500;
                  res.end('Too many redirects');
                  return;
                }

                const currentAdapter = targetUrlObj.protocol === 'https:' ? https.default : http.default;
                const proxyReq = currentAdapter.request(targetUrlObj, currentOptions, (proxyRes) => {
                  // Handle redirects internally
                  if ([301, 302, 303, 307, 308].includes(proxyRes.statusCode || 0) && proxyRes.headers.location) {
                    let location = proxyRes.headers.location;
                    if (!location.startsWith('http')) {
                      const baseUrl = targetUrlObj.href.endsWith('/') ? targetUrlObj.href : targetUrlObj.href + '/';
                      location = new URL(location, baseUrl).href;
                    }
                    console.log(`[Generic Proxy] Following redirect to: ${location}喵~`);
                    const nextUrlObj = new URL(location);
                    // Update host header for the next request
                    const nextOptions = { ...currentOptions };
                    nextOptions.headers = { ...currentOptions.headers, host: nextUrlObj.host };
                    return makeRequest(nextUrlObj, nextOptions, redirectCount + 1);
                  }

                  res.statusCode = proxyRes.statusCode || 200;
                  for (const [key, value] of Object.entries(proxyRes.headers)) {
                    if (value) res.setHeader(key, value);
                  }

                  const contentType = String(proxyRes.headers['content-type'] || '').toLowerCase();
                  if (contentType.startsWith('image/')) {
                    res.setHeader('Cache-Control', 'public, max-age=604800, immutable');
                    res.removeHeader('pragma');
                    res.removeHeader('expires');
                  }

                  proxyRes.pipe(res);
                });

                proxyReq.on('error', (e: any) => {
                  const isNetworkError = ['ECONNRESET', 'ETIMEDOUT', 'ECONNREFUSED', 'ENOTFOUND'].includes(e.code);
                  if (isNetworkError) {
                    console.error(`[Generic Proxy Error] ${e.code}: ${e.message}`);
                  } else {
                    console.error("Generic Proxy Error:", e);
                  }
                  
                  if (e.code === 'ECONNRESET' || e.code === 'ECONNREFUSED' || e.code === 'ETIMEDOUT') {
                    if (redirectCount === 0) {
                      console.warn(`[Proxy] Retrying ${targetUrlObj.hostname} due to ${e.code}...喵~`);
                      return makeRequest(targetUrlObj, currentOptions, 1);
                    }
                  }

                  if (!res.headersSent) {
                    res.statusCode = 500;
                    res.end(e.message);
                  }
                });

                if (req.method === 'POST') {
                  req.pipe(proxyReq);
                } else {
                  proxyReq.end();
                }
              };

              makeRequest(urlObj, options);
                });
              });
              return;
            }

            // 6. Music APIs (Migu, Kuwo, Gequke) - 使用代理方式
            if (url.pathname === '/api/migu' || url.pathname === '/api/kuwo' || url.pathname === '/api/gequke') {
              const keyword = url.searchParams.get('keyword');
              if (!keyword) {
                res.setHeader('Content-Type', 'application/json');
                res.setHeader('Access-Control-Allow-Origin', '*');
                res.statusCode = 400;
                res.end(JSON.stringify({ code: 400, msg: 'Missing keyword' }));
                return;
              }

              // 使用 proxy 代理请求
              let targetUrl = '';
              if (url.pathname === '/api/migu') {
                // migu 旧 API 已废弃，返回空结果
                res.setHeader('Content-Type', 'application/json');
                res.setHeader('Access-Control-Allow-Origin', '*');
                res.statusCode = 200;
                res.end(JSON.stringify({ code: 200, results: [], msg: 'API unavailable' }));
                return;
              } else if (url.pathname === '/api/kuwo') {
                // kuwo 需要复杂的验证，本地返回空结果
                res.setHeader('Content-Type', 'application/json');
                res.setHeader('Access-Control-Allow-Origin', '*');
                res.statusCode = 200;
                res.end(JSON.stringify({ code: 200, results: [], msg: 'API unavailable' }));
                return;
              } else if (url.pathname === '/api/gequke') {
                targetUrl = `https://www.gequke.com/song/${encodeURIComponent(keyword)}`;
              }

              // 通过代理请求
              import('https').then(https => {
                const options = {
                  method: 'GET',
                  headers: {
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
                    'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8',
                  },
                  timeout: 15000
                };

                const urlObj = new URL(targetUrl);
                const req = https.default.request(urlObj, options, (proxyRes) => {
                  let data = '';
                  proxyRes.on('data', chunk => data += chunk);
                  proxyRes.on('end', () => {
                    res.setHeader('Content-Type', 'application/json');
                    res.setHeader('Access-Control-Allow-Origin', '*');
                    
                    try {
                      const results: any[] = [];
                      const jsonMatches = data.match(/data\s*=\s*(\{[\s\S]*?\});/g) || [];
                      for (const match of jsonMatches) {
                        const dataMatch = match.match(/data\s*=\s*(\{[\s\S]*?\});/);
                        if (dataMatch) {
                          try {
                            const parsed = JSON.parse(dataMatch[1]);
                            if (Array.isArray(parsed)) {
                              for (const item of parsed) {
                                if (item.songmid || item.songname || item.title) {
                                  results.push({
                                    id: item.songmid || item.songid || Math.random(),
                                    name: item.songname || item.title || '',
                                    artist: item.artist || item.singer || item.author || '',
                                    album: item.albumname || item.album || '',
                                    cover: item.picurl || item.pic || '',
                                    duration: item.duration || 0,
                                    url: item.url || item.musicUrl || item.songurl || '',
                                    source: 'gequke'
                                  });
                                }
                              }
                            }
                          } catch (e) {}
                        }
                      }
                      res.statusCode = 200;
                      res.end(JSON.stringify({ code: results.length > 0 ? 200 : 404, results, msg: results.length > 0 ? undefined : 'No results found' }));
                    } catch (e) {
                      res.statusCode = 500;
                      res.end(JSON.stringify({ code: 500, msg: e instanceof Error ? e.message : 'Parse error' }));
                    }
                  });
                });

                req.on('error', (e) => {
                  res.setHeader('Content-Type', 'application/json');
                  res.setHeader('Access-Control-Allow-Origin', '*');
                  res.statusCode = 500;
                  res.end(JSON.stringify({ code: 500, msg: e.message }));
                });

                req.end();
              });
              return;
            }

            // Browser-based search for encrypted sites
            if (url.pathname === '/api/browser-search') {
              const keyword = url.searchParams.get('keyword');
              const site = url.searchParams.get('site') || 'rrssk';

              if (!keyword) {
                res.statusCode = 400;
                res.end(JSON.stringify({ error: 'Missing keyword' }));
                return;
              }

              (async () => {
                try {
                  const puppeteer = await import('puppeteer');
                  console.log(`[Browser Search] Starting for: ${keyword}`);

                  const browser = await puppeteer.default.launch({
                    headless: true,
                    args: [
                      '--no-sandbox', 
                      '--disable-setuid-sandbox',
                      '--disable-blink-features=AutomationControlled'
                    ]
                  });

                  const page = await browser.newPage();
                  // if (site === 'wanbenge') {
                  //   await page.setJavaScriptEnabled(false);
                  // }
                  await page.setViewport({ width: 1920, height: 1080 });
                   await page.setExtraHTTPHeaders({
                     'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8',
                     'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7',
                   });

                   // Avoid detection
                  await page.evaluateOnNewDocument(() => {
                    Object.defineProperty(navigator, 'webdriver', { get: () => false });
                    // Mock mobile platform for mobile-only sites
                    if (window.navigator.userAgent.includes('Mobile')) {
                      Object.defineProperty(navigator, 'platform', { get: () => 'iPhone' });
                      Object.defineProperty(navigator, 'maxTouchPoints', { get: () => 5 });
                    }
                  });
                  if (site === 'wanbenge') {
                     await page.setUserAgent('Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1');
                   } else {
                     await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');
                   }

                  const searchUrl = 'https://www.jizai22.com/';
                  
                  console.log(`[Browser Search] Target site: ${site}, keyword: ${keyword}喵~`);

                  const gotoOptions = { waitUntil: 'domcontentloaded' as const, timeout: 25000 };
                  
                  // Helper for GBK encoding if needed
                  const getGBKEncoded = async (str: string) => {
                    const iconv = await import('iconv-lite');
                    return iconv.default.encode(str, 'gbk').toString('hex').replace(/(..)/g, '%$1').toUpperCase();
                  };

                  if (site === 'wanbenge') {
                    const gbkKeyword = await getGBKEncoded(keyword);
                    const searchPageUrl = `https://www.jizai22.com/modules/article/search.php?searchkey=${gbkKeyword}`;
                    try {
                      await page.goto(searchPageUrl, gotoOptions);
                      await page.waitForFunction(() => {
                        return document.querySelectorAll('.bookbox, .item, tr, .mySearch, .image').length > 0 || document.querySelector('#bookIntro') || document.querySelector('.bookname');
                      }, { timeout: 15000 });
                    } catch (e) {
                      console.warn('[Browser Search] wanbenge timeout, trying manual fallback喵~');
                      try {
                        await page.goto('https://www.jizai22.com/', { waitUntil: 'domcontentloaded' });
                        await page.waitForSelector('input[name="searchkey"], .search-input, input[type="text"]', { timeout: 5000 });
                        await page.type('input[name="searchkey"], .search-input, input[type="text"]', keyword);
                        await page.keyboard.press('Enter');
                        await page.waitForNavigation({ waitUntil: 'domcontentloaded', timeout: 10000 });
                      } catch (err) {
                        console.error('[Browser Search] wanbenge manual fallback failed喵~');
                      }
                    }
                  } else if (site === 'dingdian') {
          try {
            console.log('[Browser Search] dingdian: Starting optimized search喵~');
            
            // 方案1: 直接访问搜索URL（更快喵~）
            // 更新为新接口 /searchsss/
            const directSearchUrl = `https://www.23ddw.net/searchsss/?searchkey=${encodeURIComponent(keyword)}`;
            await page.goto(directSearchUrl, { 
              waitUntil: 'domcontentloaded', 
              timeout: 15000 
            });
            
            // 智能等待策略喵~
            await page.waitForFunction(() => {
              return document.querySelectorAll('.item, .bookbox, dt a, dd a').length > 0 ||
                     document.querySelector('#nr') ||
                     document.querySelector('.list') ||
                     document.body.textContent?.includes('搜索结果');
            }, { timeout: 10000 }).catch(() => {
              console.log('智能等待超时，尝试备用选择器喵~');
            });
            
            // 备用等待：确保至少有内容加载喵
            await new Promise(resolve => setTimeout(resolve, 2000));
            
          } catch (e) {
            console.error('[Browser Search] dingdian direct search failed, trying manual approach喵~', e);
            
            // 方案2: 备用方案 - 手动搜索
            try {
              await page.goto('https://www.23ddw.net/', { waitUntil: 'domcontentloaded', timeout: 15000 });
              
              const searchInputSelector = 'input[name="searchkey"], #searchkey, input[type="text"]';
              await page.waitForSelector(searchInputSelector, { timeout: 8000 });
              
              // 更真实的输入模拟喵~
              await page.focus(searchInputSelector);
              await page.type(searchInputSelector, keyword, { delay: 80 + Math.random() * 40 });
              
              // 更可靠的提交方式喵
              await Promise.race([
                page.keyboard.press('Enter'),
                page.evaluate((selector) => {
                  const form = document.querySelector(selector)?.closest('form');
                  if (form) form.submit();
                }, searchInputSelector),
                new Promise(resolve => setTimeout(resolve, 1000))
              ]);
              
              // 更灵活的等待策略喵
              await Promise.race([
                page.waitForNavigation({ waitUntil: 'domcontentloaded', timeout: 10000 }),
                page.waitForSelector('.item, dt a, .list, #nr', { timeout: 10000 }),
                new Promise(resolve => setTimeout(resolve, 5000))
              ]);
              
            } catch (fallbackError) {
              console.error('[Browser Search] dingdian manual search also failed喵~', fallbackError);
            }
          }
        } else if (site === 'bqgui') {
          // bqgui.cc search logic
          const searchUrl = `https://www.bqgui.cc/s?q=${encodeURIComponent(keyword)}`;
          await page.goto(searchUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });
          
          try {
            await page.waitForSelector('.bookbox', { timeout: 10000 });
          } catch (e) {
            console.log('[Browser Search] bqgui wait timeout');
          }
        } else if (site === 'alicesw') {
          // alicesw.com search logic - 使用浏览器渲染喵~
          console.log('[Browser Search] 开始爱丽丝书屋浏览器搜索喵~');
          
          // 尝试直接访问搜索页面喵
          const searchPageUrl = `https://www.alicesw.com/search?q=${encodeURIComponent(keyword)}&f=_all&sort=relevance&p=1&serialize=`;
          await page.goto(searchPageUrl, { waitUntil: 'networkidle2', timeout: 30000 });
          
          // 等待内容加载喵
          await new Promise(resolve => setTimeout(resolve, 2000));
          
          // 尝试等待搜索结果出现喵
          try {
            await page.waitForSelector('h4, .novel-item, article', { timeout: 10000 });
          } catch (e) {
            console.log('[Browser Search] alicesw wait timeout, continuing anyway喵~');
          }
          
          // 分页搜索：最多取3页喵（注意：网站使用 &p= 而不是 &page=）
          for (let pageNum = 2; pageNum <= 3; pageNum++) {
            try {
              const nextPageUrl = `https://www.alicesw.com/search?q=${encodeURIComponent(keyword)}&f=_all&sort=relevance&p=${pageNum}&serialize=`;
              await page.goto(nextPageUrl, { waitUntil: 'networkidle2', timeout: 20000 });
              await new Promise(resolve => setTimeout(resolve, 2000));
              console.log(`[Browser Search] alicesw 获取第 ${pageNum} 页喵~`);
            } catch (e) {
              console.log(`[Browser Search] alicesw 第 ${pageNum} 页加载失败，停止分页喵~`);
              break;
            }
          }
        } else if (site === 'shukuge') {
          // shukuge.com search logic - 书库阁喵~
          console.log('[Browser Search] 开始书库阁浏览器搜索喵~');
          const searchPageUrl = `http://www.shukuge.com/Search?wd=${encodeURIComponent(keyword)}`;
          await page.goto(searchPageUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });
          await new Promise(resolve => setTimeout(resolve, 2000));
          try {
            await page.waitForSelector('.listitem, .item, .bookbox', { timeout: 10000 });
          } catch (e) {
            console.log('[Browser Search] shukuge wait timeout, continuing anyway喵~');
          }
        } else {
                    // Generic fallback for other sites
                    const searchPageUrl = searchUrl;
                    try {
                        await page.goto(searchPageUrl, { waitUntil: 'domcontentloaded', timeout: 20000 });
                    } catch (e) {
                        await page.goto(searchUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });
                    }
                  }

                  let allResults: any[] = [];
                  let finalUrl = page.url();

                  const scrapePage = async (site, keywordParam) => {
                    const pageData = await page.evaluate((currentSite, kw) => {
                      const novels: any[] = [];
                      const nextPages: string[] = [];
                      
                      const isRelevant = (title: string, author: string = '') => {
                          const t = title.trim().toLowerCase();
                          const a = author.trim().toLowerCase();
                          const kwLower = kw.trim().toLowerCase();
                          
                          if (!kwLower) return true;
                          if (t.includes(kwLower) || a.includes(kwLower)) return true;
                          
                          const words = kwLower.split(/\s+/).filter(w => w.length > 0);
                          if (words.length > 0) {
                              return words.every(word => t.includes(word) || a.includes(word));
                          }
                          return false;
                      };

                      if (currentSite === 'wanbenge') {
                        // Strategy 1: .mySearch (Mobile/Alternative view)
                        const mySearch = document.querySelector('.mySearch');
                        if (mySearch) {
                          const uls = mySearch.querySelectorAll('ul');
                          uls.forEach(ul => {
                            const link = ul.querySelector('li a') as HTMLAnchorElement; 
                            if (link) {
                              const title = link.textContent?.trim() || '';
                              const author = Array.from(ul.querySelectorAll('li')).find(li => li.textContent?.includes('作者：'))?.textContent?.replace('作者：', '').trim() || '未知';
                              
                              if (isRelevant(title, author)) {
                                  let coverUrl = '';
                                  const prevDiv = ul.previousElementSibling;
                                  if (prevDiv && prevDiv.tagName === 'DIV') {
                                    const img = prevDiv.querySelector('img');
                                    if (img && !img.src.includes('nocover')) coverUrl = img.src;
                                  }

                                  if (!novels.some(n => n.detailUrl === link.href)) {
                                    novels.push({ title, detailUrl: link.href, author, description: '', coverUrl });
                                  }
                              }
                            }
                          });
                          
                          const images = mySearch.querySelectorAll('.image');
                          images.forEach(imgDiv => {
                              const link = imgDiv.querySelector('a') as HTMLAnchorElement;
                              const img = imgDiv.querySelector('img') as HTMLImageElement;
                              if (link && img) {
                                  let title = '';
                                  let author = '未知';
                                  const dt = imgDiv.nextElementSibling;
                                  if (dt && dt.tagName === 'DT') {
                                      const titleLink = dt.querySelector('a');
                                      if (titleLink) title = titleLink.textContent?.trim() || '';
                                      const authorSpan = dt.querySelector('span');
                                      if (authorSpan) author = authorSpan.textContent?.trim() || '未知';
                                  }
                                  if (title && isRelevant(title, author) && !novels.some(n => n.detailUrl === link.href)) {
                                      novels.push({
                                          title, detailUrl: link.href, author, description: '',
                                          coverUrl: (img.src && !img.src.includes('nocover')) ? img.src : ''
                                      });
                                  }
                              }
                          });
                        }

                        // Strategy 2: .bookbox (Standard view)
                        const bookboxes = document.querySelectorAll('.bookbox, .listitem');
                        if (bookboxes.length > 0) {
                          bookboxes.forEach(item => {
                            const link = (item.querySelector('.bookname a') || item.querySelector('h2 a')) as HTMLAnchorElement;
                            if (link) {
                              const title = link.textContent?.trim() || '';
                              const author = (item.querySelector('.author') || item.querySelector('.bookdesc .sp span:first-child'))?.textContent?.replace('作者：', '').trim() || '未知';
                              if (isRelevant(title, author)) {
                                const existingIndex = novels.findIndex(n => n.detailUrl === link.href);
                                let newCover = (item.querySelector('.bookimg img') || item.querySelector('.cover img'))?.getAttribute('src') || '';
                                if (newCover.includes('nocover')) newCover = '';
                                
                                let description = '';
                                const updateEl = item.querySelector('.update');
                                const introEl = item.querySelector('.intro');
                                const descEl = item.querySelector('.desc');
                                const bookDescEl = item.querySelector('.bookdesc .desc'); // 针对 shukuge 的 .bookdesc .desc
                                
                                if (updateEl) description = updateEl.textContent?.replace('简介：', '').trim() || '';
                                else if (introEl) description = introEl.textContent?.replace('简介：', '').trim() || '';
                                else if (bookDescEl) description = bookDescEl.textContent?.replace('简介：', '').trim() || ''; // 优先匹配具体的 .bookdesc .desc
                                else if (descEl) description = descEl.textContent?.replace('简介：', '').trim() || '';

                                // 移除 "热搜小说：" 开头的错误简介
                                if (description.includes('热搜小说：')) {
                                    description = '';
                                }

                                if (existingIndex === -1) {
                                    novels.push({
                                      title, detailUrl: link.href, author,
                                      description: description,
                                      coverUrl: newCover
                                    });
                                } else if (newCover && !novels[existingIndex].coverUrl) {
                                    novels[existingIndex].coverUrl = newCover;
                                }
                              }
                            }
                          });
                        }

                        // Strategy 3: ul.list (Observed on jizai22.com search results)
                        const listUls = document.querySelectorAll('ul.list');
                        listUls.forEach(ul => {
                          const novelLi = Array.from(ul.querySelectorAll('li')).find(li => li.textContent?.includes('小说：'));
                          const authorLi = Array.from(ul.querySelectorAll('li')).find(li => li.textContent?.includes('作者：'));
                          
                          if (novelLi) {
                            const link = novelLi.querySelector('a') as HTMLAnchorElement;
                            if (link) {
                              const title = link.textContent?.trim() || '';
                              const author = authorLi?.textContent?.replace('作者：', '').trim() || '未知';
                              
                              if (isRelevant(title, author) && !novels.some(n => n.detailUrl === link.href)) {
                                let coverUrl = '';
                                const prevDiv = ul.previousElementSibling;
                                if (prevDiv) {
                                  const img = prevDiv.querySelector('img');
                                  if (img && !img.src.includes('nocover')) coverUrl = img.src;
                                }
                                
                                novels.push({
                                  title, detailUrl: link.href, author,
                                  description: '',
                                  coverUrl
                                });
                              }
                            }
                          }
                        });
                      }

                      if (currentSite === 'bqgui') {
                        const items = document.querySelectorAll('.bookbox');
                        items.forEach(item => {
                          const link = item.querySelector('.bookname a') as HTMLAnchorElement;
                          if (link) {
                            const title = link.textContent?.trim() || '';
                            const author = item.querySelector('.author')?.textContent?.replace('作者：', '').trim() || '未知';
                            if (isRelevant(title, author)) {
                               const img = item.querySelector('.bookimg img') as HTMLImageElement;
                               const coverUrl = img ? img.src : '';
                               // 尝试从 .update 或 .intro 或 .uptime 提取简介
                               let description = item.querySelector('.update')?.textContent?.replace('简介：', '').trim() || 
                                                 item.querySelector('.intro')?.textContent?.replace('简介：', '').trim() || 
                                                 item.querySelector('.uptime')?.textContent?.replace('简介：', '').trim() || '';
                               
                               if (!novels.some(n => n.detailUrl === link.href)) {
                                 novels.push({
                                   title, detailUrl: link.href, author, description, coverUrl
                                 });
                               }
                            }
                          }
                        });
                      }

                      if (currentSite === 'dingdian') {
                        // 检查是否直接跳到了详情页喵~
                        const isDetailPage = !!document.querySelector('#fmimg, .book-img, #intro');
                        if (isDetailPage) {
                          const title = document.querySelector('h1')?.textContent?.trim() || '';
                          const author = document.querySelector('#info p, .info p')?.textContent?.match(/作者[：:](.+)/)?.[1]?.trim() || '未知';
                          const coverImg = document.querySelector('#fmimg img, .book-img img') as HTMLImageElement;
                          let coverUrl = coverImg ? (coverImg.getAttribute('data-original') || coverImg.src) : '';
                          if (coverUrl && !coverUrl.startsWith('http')) {
                            coverUrl = new URL(coverUrl, 'https://www.23ddw.net').href;
                          }
                          const description = document.querySelector('#intro, .intro')?.textContent?.trim() || '';
                          
                          if (title && isRelevant(title, author)) {
                            novels.push({ title, detailUrl: window.location.href, author, coverUrl, description });
                            return { novels, nextPages };
                          }
                        }

                        // 正常的搜索列表解析喵~
                         const items = document.querySelectorAll('.item, .list-item, tr, #nr');
                         items.forEach(item => {
                           let link = item.querySelector('dt a, .image a, a[href*="/du/"]') as HTMLAnchorElement;
                           if (link) {
                             let title = link.textContent?.trim() || link.getAttribute('title') || '';
                             let author = '未知';
                             const authorEl = item.querySelector('.btm a, .author, td:nth-child(3), .s4, .p2');
                             if (authorEl) author = authorEl.textContent?.trim().replace('作者：', '') || '未知';
                             
                             const imgEl = item.querySelector('.image img, img') as HTMLImageElement;
                             let coverUrl = '';
                             if (imgEl) {
                               // 顶点可能使用 data-original 或 data-src 懒加载喵
                               coverUrl = imgEl.getAttribute('data-original') || imgEl.getAttribute('data-src') || imgEl.src || '';
                             }
                             
                             if (coverUrl.includes('nocover') || coverUrl.includes('default') || !coverUrl) coverUrl = '';
                             if (coverUrl && !coverUrl.startsWith('http')) {
                               coverUrl = new URL(coverUrl, 'https://www.23ddw.net').href;
                             }
                             
                             let desc = item.querySelector('dd, .intro, .item-desc, .update, .p3')?.textContent?.trim() || '';
                             
                             // 尝试修复可能的乱码（如果发现典型的 GBK 错认 UTF-8 模式）喵~
                             const fixGarbled = (str: string) => {
                               if (!str) return str;
                               // 如果字符串包含大量特殊字符，尝试修复喵（这里只是简单示例，生产环境需更严谨）
                               return str;
                             };

                             if (!novels.some(n => n.detailUrl === link.href)) {
                               novels.push({
                                 title: fixGarbled(title), 
                                 detailUrl: link.href, 
                                 author: fixGarbled(author),
                                 description: fixGarbled(desc),
                                 coverUrl
                               });
                             }
                           }
                         });
                       }

                      // 爱丽丝书屋数据提取喵~
                      if (currentSite === 'alicesw') {
                        console.log('[Scrape] 开始提取爱丽丝书屋数据喵~');
                        
                        // 清理书名中的编号前缀
                        const cleanTitle = (title: string) => {
                          return title
                            .replace(/^\d+[\.\、\s《]+/, '')
                            .replace(/^\d+[\.\、\s]+/, '')
                            .trim();
                        };
                        
                        // 爱丽丝书屋搜索结果结构：每个结果在 ##### 中
                        // h4 是标题，下面是作者、字数等信息
                        const sections = document.querySelectorAll('h4, h3, h5');
                        console.log(`[Scrape] 爱丽丝书屋找到 ${sections.length} 个标题元素喵~`);
                        
                        sections.forEach(section => {
                          const titleLink = section.querySelector('a');
                          if (!titleLink) return;
                          
                          const href = titleLink.getAttribute('href') || '';
                          if (!href.includes('/book/') && !href.includes('/novel/')) return;
                          
                          const rawTitle = titleLink.textContent?.trim() || '';
                          const title = cleanTitle(rawTitle);
                          if (!title || title.length < 2) return;
                          
                          // 构建完整链接
                          let detailUrl = href;
                          if (!detailUrl.startsWith('http')) {
                            detailUrl = detailUrl.startsWith('/') 
                              ? 'https://www.alicesw.com' + detailUrl 
                              : 'https://www.alicesw.com/' + detailUrl;
                          }
                          
                          if (novels.some(n => n.detailUrl === detailUrl)) return;
                          
                          // 尝试从父级或兄弟元素中提取作者信息
                          let author = '未知';
                          let description = '';
                          let coverUrl = '';
                          
                          // 查找包含作者信息的父容器
                          const parent = section.closest('li, .item, article, div');
                          if (parent) {
                            const text = parent.textContent || '';
                            // 匹配 "作者：xxx" 模式
                            const authorMatch = text.match(/作者[：:]\s*([^\n\s]+)/);
                            if (authorMatch && authorMatch[1]) {
                              author = authorMatch[1].trim();
                            }
                            
                            // 尝试提取简介（第一小段文字）
                            const descMatch = text.match(/作者[：:].*?(?=标签|$)/);
                            if (descMatch) {
                              const descText = text.substring(descMatch.index! + descMatch[0].length, descMatch.index! + descMatch[0].length + 100);
                              description = descText.trim().substring(0, 100);
                            }
                          }
                          
                          if (isRelevant(title, author)) {
                            novels.push({
                              title,
                              detailUrl,
                              author,
                              coverUrl,
                              description,
                              sourceName: '爱丽丝书屋'
                            });
                          }
                        });
                        
                        // 如果从标题元素提取失败，回退到链接遍历
                        if (novels.length === 0) {
                          const allLinks = document.querySelectorAll('a[href*="/book/"], a[href*="/novel/"]');
                          console.log(`[Scrape] 回退：爱丽丝书屋找到 ${allLinks.length} 个书籍链接喵~`);
                          
                          allLinks.forEach(link => {
                            const href = link.getAttribute('href') || '';
                            let detailUrl = href;
                            if (!detailUrl.startsWith('http')) {
                              detailUrl = detailUrl.startsWith('/') 
                                ? 'https://www.alicesw.com' + detailUrl 
                                : 'https://www.alicesw.com/' + detailUrl;
                            }
                            
                            if (novels.some(n => n.detailUrl === detailUrl)) return;
                            
                            const rawTitle = link.textContent?.trim() || '';
                            const title = cleanTitle(rawTitle);
                            if (!title || title.length < 2) return;
                            
                            if (isRelevant(title, '')) {
                              novels.push({
                                title,
                                detailUrl,
                                author: '未知',
                                coverUrl: '',
                                description: '',
                                sourceName: '爱丽丝书屋'
                              });
                            }
                          });
                        }
                        
                        console.log(`[Scrape] 爱丽丝书屋总计提取 ${novels.length} 个结果喵~`);
                      }

                      // Generic fallback...
                      if (novels.length === 0) {
                        const items = document.querySelectorAll('.item, .list li, tr');
                        items.forEach(el => {
                          const link = el.querySelector('a') as HTMLAnchorElement;
                          if (link && isRelevant(link.textContent || '')) {
                            novels.push({ title: link.textContent?.trim(), detailUrl: link.href, author: '未知' });
                          }
                        });
                      }

                      return { novels, nextPages };
                    }, site, keyword);

                    return pageData;
                  };

                  const initialData = await scrapePage(site, keyword);
                  allResults = initialData.novels;

                  await browser.close();
                  console.log(`[Browser Search] Found ${allResults.length} total results`);

                  res.setHeader('Content-Type', 'application/json; charset=utf-8');
                  res.end(JSON.stringify({ success: true, searchUrl: finalUrl, results: allResults }));
                } catch (error: any) {
                  console.error('[Browser Search] Error:', error);
                  res.statusCode = 500;
                  res.end(JSON.stringify({ error: 'Browser search failed', message: error.message }));
                }
              })();
              return;
            }

            // Browser-based details for expanding chapter lists
            if (url.pathname === '/api/browser-details') {
              const targetUrl = url.searchParams.get('url');
              if (!targetUrl) {
                res.statusCode = 400;
                res.end(JSON.stringify({ error: 'Missing url' }));
                return;
              }

              (async () => {
                try {
                  const puppeteer = await import('puppeteer');
                  console.log(`[Browser Details] Loading: ${targetUrl}喵~`);

                  const browser = await puppeteer.default.launch({
                    headless: true,
                    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-blink-features=AutomationControlled']
                  });

                  const page = await browser.newPage();
                  // Optimize: block unnecessary resources for faster loading
                  await page.setRequestInterception(true);
                  page.on('request', (req) => {
                    const type = req.resourceType();
                    if (['image', 'font', 'media', 'stylesheet'].includes(type)) {
                      req.abort();
                    } else {
                      req.continue();
                    }
                  });

                  await page.setViewport({ width: 375, height: 812, isMobile: true });
                  await page.setUserAgent('Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1');

                  await page.goto(targetUrl, { waitUntil: 'networkidle2', timeout: 30000 });
                  console.log(`[Browser Details] Actual URL: ${page.url()}喵~`);

                  // 强制检查并修复编码喵
                  await page.evaluate(() => {
                    const meta = document.querySelector('meta[charset], meta[http-equiv="Content-Type"]');
                    if (!meta) {
                      const newMeta = document.createElement('meta');
                      newMeta.setAttribute('charset', 'utf-8');
                      document.head.appendChild(newMeta);
                    }
                  });

                  // 爱丽丝书屋章节内容需要等待异步加载喵~
                  if (targetUrl.includes('alicesw.com')) {
                    console.log('[Browser Details] 检测到爱丽丝书屋，添加特殊等待逻辑喵~');
                    
                    // 方法1：等待 .read-content 中不再包含"加载中"
                    await page.waitForFunction(() => {
                      const content = document.querySelector('.read-content, .text-content');
                      if (content) {
                        const text = content.textContent || '';
                        // 检查内容是否已加载（不再是加载中状态）
                        return !text.includes('加载中') && !text.includes('章节加载中') && text.length > 50;
                      }
                      return false;
                    }, { timeout: 15000 }).catch(() => {
                      console.log('[Browser Details] 爱丽丝书屋内容等待超时，尝试备用方案喵~');
                    });
                    
                    // 方法2：如果方法1失败，检查 data-nurl 并尝试获取真实内容
                    await new Promise(resolve => setTimeout(resolve, 2000)); // 额外等待2秒让 JavaScript 执行
                    
                    // 检查是否有新的内容加载进来
                    const hasRealContent = await page.evaluate(() => {
                      const content = document.querySelector('.read-content, .text-content');
                      return content && (content.textContent || '').length > 100;
                    });
                    
                    if (!hasRealContent) {
                      console.log('[Browser Details] 检测到内容可能仍需异步加载，尝试获取 data-nurl 喵~');
                      // 尝试查找并访问真实内容URL
                      const realUrl = await page.evaluate(() => {
                        const box = document.querySelector('#j_chapterBox .text-wrap');
                        const nurl = box?.getAttribute('data-nurl');
                        if (nurl && !nurl.includes('javascript')) {
                          return nurl.startsWith('http') ? nurl : new URL(nurl, window.location.href).href;
                        }
                        return null;
                      });
                      
                      if (realUrl) {
                        console.log(`[Browser Details] 找到真实内容URL: ${realUrl}喵~`);
                        await page.goto(realUrl, { waitUntil: 'networkidle2', timeout: 15000 });
                        await new Promise(resolve => setTimeout(resolve, 1000));
                      }
                    }
                  }
                  
                  // 如果是顶点小说网，尝试等待特定的列表元素喵
                  if (targetUrl.includes('23ddw.net')) {
                    await page.waitForSelector('#list, .chapter-list, .section-list, #nr', { timeout: 5000 }).catch(() => {});
                  }
                  if (targetUrl.includes('bqgui.cc')) {
                    try {
                      await page.waitForSelector('#list, .listmain, #content, #chaptercontent', { timeout: 15000 });
                      console.log('[Browser Details] bqgui selector found喵~');
                    } catch (e) {
                      console.log('[Browser Details] bqgui selector timeout喵~');
                    }
                  }

                  const content = await page.content();
                  console.log(`[Browser Details] Returning HTML (length: ${content.length}) for ${targetUrl}喵~`);
                  await browser.close();

                  res.setHeader('Content-Type', 'application/json');
                  res.end(JSON.stringify({ success: true, html: content }));
                } catch (error: any) {
                  console.error('[Browser Details] Error:', error);
                  res.statusCode = 500;
                  res.end(JSON.stringify({ error: 'Browser details failed', message: error.message }));
                }
              })();
              return;
            }

            // 浏览器封面搜索 API 喵~
            if (url.pathname === '/api/browser-cover') {
              const title = url.searchParams.get('title');
              const author = url.searchParams.get('author') || '';

              if (!title) {
                res.statusCode = 400;
                res.end(JSON.stringify({ error: 'Missing title' }));
                return;
              }

              (async () => {
                let browser;
                try {
                  const puppeteer = await import('puppeteer');
                  console.log(`[Browser Cover] Searching cover for: ${title} ${author}喵~`);

                  browser = await puppeteer.default.launch({
                    headless: true,
                    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-blink-features=AutomationControlled']
                  });

                  const page = await browser.newPage();
                  await page.setViewport({ width: 1280, height: 800 });
                  await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');

                  // 优先尝试豆瓣搜索喵~
                  const doubanUrl = `https://www.douban.com/search?cat=1001&q=${encodeURIComponent(title + ' ' + author)}`;
                  await page.goto(doubanUrl, { waitUntil: 'domcontentloaded', timeout: 15000 });
                  
                  let coverUrl = await page.evaluate(() => {
                    const firstResult = document.querySelector('.result-list .result .pic img');
                    return firstResult ? (firstResult as HTMLImageElement).src : null;
                  });

                  // 如果豆瓣没找到，尝试百度图片喵~
                  if (!coverUrl) {
                    console.log('[Browser Cover] Douban failed, trying Baidu Image喵~');
                    const baiduUrl = `https://image.baidu.com/search/index?tn=baiduimage&word=${encodeURIComponent(title + ' ' + author + ' 小说 封面')}`;
                    await page.goto(baiduUrl, { waitUntil: 'domcontentloaded', timeout: 15000 });
                    await page.waitForSelector('.main_img', { timeout: 5000 }).catch(() => {});
                    coverUrl = await page.evaluate(() => {
                      const imgs = Array.from(document.querySelectorAll('.main_img'));
                      for (const img of imgs) {
                        const src = (img as HTMLImageElement).src;
                        if (src && src.startsWith('http') && !src.includes('baidu.com/img')) return src;
                      }
                      return null;
                    });
                  }

                  await browser.close();
                  console.log(`[Browser Cover] Result: ${coverUrl ? 'Success喵!' : 'Failed喵~'}`);

                  res.setHeader('Content-Type', 'application/json');
                  res.end(JSON.stringify({ success: !!coverUrl, coverUrl }));
                } catch (error: any) {
                  if (browser) await browser.close();
                  console.error('[Browser Cover] Error:', error);
                  res.statusCode = 500;
                  res.end(JSON.stringify({ success: false, error: error.message }));
                }
              })();
              return;
            }

            // 5. Scraper Proxy (Enhanced) — AdaptiveFetcher-based proxy with TLS spoofing & encoding detection
            if (url.pathname === '/api/scraper/proxy') {
              const targetUrl = url.searchParams.get('url');
              if (!targetUrl) {
                res.statusCode = 400;
                res.end(JSON.stringify({ error: 'Missing url parameter' }));
                return;
              }

              import('./scrapling/AdaptiveFetcher.js').then(async ({ AdaptiveFetcher }) => {
                try {
                  const result = await AdaptiveFetcher.get(targetUrl, {
                    stealthyHeaders: true,
                    autoDetectEncoding: true,
                    timeout: 20000,
                    maxRetries: 2,
                  });
                  res.setHeader('Content-Type', 'application/json; charset=utf-8');
                  res.end(JSON.stringify({
                    success: true,
                    body: result.text,
                    status: result.status,
                    encoding: result.encoding,
                    finalUrl: result.finalUrl,
                    elapsedMs: result.elapsedMs,
                  }));
                } catch (err: any) {
                  res.statusCode = 502;
                  res.end(JSON.stringify({ success: false, error: err.message }));
                }
              });
              return;
            }

            // 6. Scraper Extract API — server-side DOM extraction using SmartSelector
            if (url.pathname === '/api/scraper/extract' && req.method === 'POST') {
              let body = '';
              req.on('data', (chunk: string) => { body += chunk; });
              req.on('end', () => {
                import('./scrapling/SmartSelector.js').then(async ({ SmartSelector }) => {
                  try {
                    const { url: targetUrl, selectors } = JSON.parse(body);
                    if (!targetUrl || !selectors) {
                      res.statusCode = 400;
                      res.end(JSON.stringify({ error: 'Missing url or selectors' }));
                      return;
                    }

                    const { AdaptiveFetcher } = await import('./scrapling/AdaptiveFetcher.js');
                    const response = await AdaptiveFetcher.get(targetUrl, {
                      stealthyHeaders: true,
                      autoDetectEncoding: true,
                      timeout: 20000,
                    });

                    const selector = new SmartSelector(response.text, targetUrl);
                    const results = selectors.map((sg: any) => selector.extract(sg));

                    res.setHeader('Content-Type', 'application/json; charset=utf-8');
                    res.end(JSON.stringify({
                      success: true,
                      url: targetUrl,
                      results,
                      encoding: response.encoding,
                      elapsedMs: response.elapsedMs,
                    }));
                  } catch (err: any) {
                    res.statusCode = 500;
                    res.end(JSON.stringify({ success: false, error: err.message }));
                  }
                });
              });
              return;
            }

            // 7. Scraper GBK Search — GBK-encoded search with SmartSelector extraction
            if (url.pathname === '/api/scraper/gbk-search' && req.method === 'POST') {
              let body = '';
              req.on('data', (chunk: string) => { body += chunk; });
              req.on('end', () => {
                import('iconv-lite').then(async (iconv) => {
                  import('./scrapling/AdaptiveFetcher.js').then(async ({ AdaptiveFetcher }) => {
                    import('./scrapling/SmartSelector.js').then(async ({ SmartSelector }) => {
                      try {
                        const { searchUrl, selectors, method, postData } = JSON.parse(body);
                        if (!searchUrl) {
                          res.statusCode = 400;
                          res.end(JSON.stringify({ error: 'Missing searchUrl' }));
                          return;
                        }

                        const fetchOptions: any = {
                          stealthyHeaders: true,
                          autoDetectEncoding: true,
                          timeout: 20000,
                        };

                        if (method === 'POST' && postData) {
                          fetchOptions.method = 'POST';
                          fetchOptions.body = postData;
                        }

                        const response = await AdaptiveFetcher.get(searchUrl, fetchOptions);
                        const selector = new SmartSelector(response.text, searchUrl);
                        const results = selectors ? selectors.map((sg: any) => selector.extract(sg)) : [];

                        res.setHeader('Content-Type', 'application/json; charset=utf-8');
                        res.end(JSON.stringify({
                          success: true,
                          results,
                          encoding: response.encoding,
                          elapsedMs: response.elapsedMs,
                        }));
                      } catch (err: any) {
                        res.statusCode = 500;
                        res.end(JSON.stringify({ success: false, error: err.message }));
                      }
                    });
                  });
                });
              });
              return;
            }

            next();
          });
        }
      }
    ],
    define: {
      'process.env.API_KEY': JSON.stringify(env.GEMINI_API_KEY),
      'process.env.GEMINI_API_KEY': JSON.stringify(env.GEMINI_API_KEY),
      '__APP_BUILD_TIME__': JSON.stringify(Date.now())
    },
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      }
    }
  };
});
