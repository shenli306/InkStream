import path from 'path';
import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, '.', '');
  return {
    server: {
      port: 3000,
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
        '/proxy/yeduji': {
          target: 'https://www.yeduji.com',
          changeOrigin: true,
          secure: false,
          rewrite: (path) => path.replace(/^\/proxy\/yeduji/, ''),
          headers: {
            'Referer': 'https://www.yeduji.com/',
            'Origin': 'https://www.yeduji.com',
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
        }
      }
    },
    plugins: [
      react(),
      {
        name: 'configure-server',
        configureServer(server) {
          server.middlewares.use((req, res, next) => {
            const url = req.url ? new URL(req.url, `http://${req.headers.host}`) : null;
            if (!url) return next();

            // 1. Save EPUB API
            if (url.pathname === '/api/save-epub') {
              if (req.method !== 'POST') return next();

              const filenameHeader = req.headers['x-filename'] as string;
              if (!filenameHeader) { res.statusCode = 400; res.end('Missing filename'); return; }
              const filename = decodeURIComponent(filenameHeader);

              import('fs').then(async (fs) => {
                const fsPromises = fs.promises;
                const safeName = filename.replace(/[\\/:*?"<>|]/g, "_");
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

            // 2.1 Cover Image API
            if (url.pathname.startsWith('/api/cover/')) {
              const filenameEncoded = url.pathname.replace('/api/cover/', '');
              const filename = decodeURIComponent(filenameEncoded);

              import('fs').then(async (fs) => {
                const fsPromises = fs.promises;
                import('jszip').then(async (JSZip) => {
                  const filePath = path.join(__dirname, 'downloads', filename);

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
                const safeUrl = decodeURIComponent(url.pathname).replace(/^\/downloads\//, '');
                const filePath = path.join(__dirname, 'downloads', safeUrl);

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
                          if (!redirectUrl.startsWith('http')) {
                            try {
                              const origin = new URL(targetTemplate).origin;
                              if (redirectUrl.startsWith('/')) {
                                redirectUrl = origin + redirectUrl;
                              } else {
                                const base = new URL(url);
                                const pathDir = base.pathname.substring(0, base.pathname.lastIndexOf('/') + 1);
                                redirectUrl = origin + pathDir + redirectUrl;
                              }
                            } catch (e) {
                              console.error("Redirect URL construction failed", e);
                              res.statusCode = 500;
                              res.end("Redirect failed");
                              return;
                            }
                          }
                          console.log(`[Proxy] Following redirect to: ${redirectUrl}`);
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
                        console.error("Proxy Request Error:", e);
                        
                        // Retry on ECONNRESET, ECONNREFUSED or timeout
                        if ((e.code === 'ECONNRESET' || e.code === 'ETIMEDOUT' || e.code === 'ECONNREFUSED') && retryCount < 1) {
                          console.warn(`Retrying ${url} due to ${e.code}...`);
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
            if (url.pathname === '/api/proxy') {
              const targetUrl = url.searchParams.get('url');
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
                  const adapter = targetUrl.startsWith('https') ? https.default : http.default;

                  // Filter headers to forward
                  const headersToForward = { ...req.headers };
                  delete headersToForward.host;
                  delete headersToForward.connection;
                  delete headersToForward.origin;
                  delete headersToForward.referer; // Remove browser referer sent to localhost

                  // FORCE correct headers for target
                  const isMobileTarget = targetUrl.includes('jizai22.com') || targetUrl.includes('wanbenge');
                  if (isMobileTarget) {
                      headersToForward['user-agent'] = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1';
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
                      location = new URL(location, targetUrlObj.href).href;
                    }
                    console.log(`[Proxy] Following redirect to: ${location}喵~`);
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
                  proxyRes.pipe(res);
                });

                proxyReq.on('error', (e: any) => {
                  console.error("Generic Proxy Error:", e);
                  if (e.code === 'ECONNRESET' || e.code === 'ECONNREFUSED' || e.code === 'ETIMEDOUT') {
                    if (redirectCount === 0) {
                      console.warn(`Retrying proxy request due to ${e.code}...`);
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
                  } else {
                    // Generic fallback for other sites
                    const searchPageUrl = searchUrl;
                    try {
                        await page.goto(searchPageUrl, { waitUntil: 'domcontentloaded', timeout: 20000 });
                    } catch (e) {
                        await page.goto(searchUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });
                    }
                  }

                  const finalUrl = page.url();
                  console.log(`[Browser Search] Final URL: ${finalUrl}喵~`);

                  const results = await page.evaluate((currentSite, kw) => {
                    console.log(`[Browser Search] Evaluating results for ${currentSite} with keyword: ${kw}`);
                    const novels: any[] = [];
                    const kwLower = kw.toLowerCase();
                    
                    const isRelevant = (title: string, author: string = '') => {
                        const t = title.trim().toLowerCase();
                        const a = author.trim().toLowerCase();
                        const kwLower = kw.toLowerCase();
                        const result = t.includes(kwLower) || a.includes(kwLower);
                        if (!result && (t.length > 0)) {
                            // console.log(`[Browser Search] Filtered out irrelevant: ${title} by ${author}`);
                        }
                        return result;
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
                      const bookboxes = document.querySelectorAll('.bookbox');
                      if (bookboxes.length > 0) {
                        bookboxes.forEach(item => {
                          const link = item.querySelector('.bookname a') as HTMLAnchorElement;
                          if (link) {
                            const title = link.textContent?.trim() || '';
                            const author = item.querySelector('.author')?.textContent?.replace('作者：', '').trim() || '未知';
                            if (isRelevant(title, author)) {
                              const existingIndex = novels.findIndex(n => n.detailUrl === link.href);
                              let newCover = (item.querySelector('.bookimg img') as HTMLImageElement)?.src || '';
                              if (newCover.includes('nocover')) newCover = '';
                              
                              if (existingIndex === -1) {
                                  novels.push({
                                    title, detailUrl: link.href, author,
                                    description: item.querySelector('.update')?.textContent?.replace('简介：', '').trim() || '',
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

                    // Generic fallback for all sites if specific strategies failed or to supplement
                    const genericSelectors = [
                        '.booklist tr', '.item-list li', '.search-result', '.grid-list .item', 
                        '.search-list li', '.result-list .item', '.novelslist2 li', '.book-list li',
                        '.list li', '.book-item', '.bookbox', '.item'
                    ];
                    
                    genericSelectors.forEach(selector => {
                        const items = document.querySelectorAll(selector);
                        items.forEach(el => {
                            // Avoid sidebar/recommendations
                            if (el.closest('.sidebar, .side, #sidebar, .right, .hot, .recommend')) return;

                            const link = el.querySelector('a[href*="/info/"], a[href*="/book/"]') as HTMLAnchorElement;
                            if (link) {
                                const title = link.textContent?.trim() || '';
                                const author = el.querySelector('.author, .bookauthor, .s4, .item-author, td:nth-child(3)')?.textContent?.replace('作者：', '').trim() || '未知';
                                
                                if (title && isRelevant(title, author) && !novels.some(n => n.detailUrl === link.href)) {
                                    novels.push({
                                        title,
                                        detailUrl: link.href,
                                        author,
                                        description: el.querySelector('.intro, .item-desc, dd')?.textContent?.trim() || '',
                                        coverUrl: (el.querySelector('img') as HTMLImageElement)?.src || ''
                                    });
                                }
                            }
                        });
                    });

                    // Direct detail page fallback
                    if (novels.length === 0) {
                        const isDetailPage = window.location.href.includes('/info/') || 
                                           window.location.href.includes('/book/') || 
                                           /\/\d+_\d+\/?$/.test(window.location.href) ||
                                           /\/\d+\/?$/.test(window.location.href);
                                           
                        if (isDetailPage) {
                            const title = document.querySelector('h1, .bookname h1, .title, .bookTitle, #info h1')?.textContent?.trim();
                            if (title && isRelevant(title)) {
                                novels.push({
                                    title,
                                    detailUrl: window.location.href,
                                    author: document.querySelector('.author, .bookauthor, .booktag a.red, #info p:nth-child(2)')?.textContent?.replace('作者：', '').trim() || '未知',
                                    description: document.querySelector('.intro, .bookintro, #bookIntro, #intro')?.textContent?.trim() || '',
                                    coverUrl: (document.querySelector('.bookimg img, .pic img, .img-thumbnail, #fmimg img') as HTMLImageElement)?.src || ''
                                });
                            }
                        }
                    }
                    
                    return novels;
                  }, site, keyword);

                  await browser.close();
                  console.log(`[Browser Search] Found ${results.length} results`);

                  res.setHeader('Content-Type', 'application/json');
                  res.end(JSON.stringify({ success: true, searchUrl: finalUrl, results }));
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

                  await page.goto(targetUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });
                  console.log(`[Browser Details] Actual URL: ${page.url()}喵~`);

                  // Handle verification page
                  if (page.url().includes('verify.html')) {
                    console.log('[Browser Details] Verification page detected, attempting to bypass...喵~');
                    try {
                      // Look for a verification button or just wait
                      const verifyBtn = await page.$('.verify-btn, #btn, .btn, button');
                      if (verifyBtn) {
                        await verifyBtn.click();
                        await page.waitForNavigation({ waitUntil: 'domcontentloaded', timeout: 5000 }).catch(() => {});
                      }
                      // Some sites just need a reload after a delay
                      await new Promise(resolve => setTimeout(resolve, 2000));
                      await page.reload({ waitUntil: 'domcontentloaded' });
                    } catch (e) {
                      console.warn('[Browser Details] Verification bypass failed:', e);
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

            next();
          });
        }
      }
    ],
    define: {
      'process.env.API_KEY': JSON.stringify(env.GEMINI_API_KEY),
      'process.env.GEMINI_API_KEY': JSON.stringify(env.GEMINI_API_KEY)
    },
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      }
    }
  };
});
