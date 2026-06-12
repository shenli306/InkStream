
export const config = {
  runtime: 'nodejs',
  maxDuration: 30,
};

import { JSDOM } from 'jsdom';
import iconv from 'iconv-lite';

async function fetchWithTimeout(url, options, timeout = 15000) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeout);
  try {
    const response = await fetch(url, { ...options, signal: controller.signal });
    clearTimeout(timeoutId);
    return response;
  } catch (error) {
    clearTimeout(timeoutId);
    throw error;
  }
}

async function fetchPageHtml(targetUrl, encodingHint = 'utf-8') {
  const mobileUA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1';
  const desktopUA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36';

  let origin = 'https://www.google.com';
  let isMobile = false;
  try {
    const u = new URL(targetUrl);
    origin = u.origin;
    isMobile = targetUrl.includes('jizai22.com') || targetUrl.includes('b.faloo.com');
  } catch (e) {}

  const ua = isMobile ? mobileUA : desktopUA;
  const headers = {
    'User-Agent': ua,
    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
    'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8',
    'Referer': origin + '/',
    'Cache-Control': 'no-cache',
  };

  // 依次尝试：直接请求 → codetabs → corsproxy → allorigins
  const tryUrls = [
    targetUrl,
    `https://api.codetabs.com/v1/proxy?quest=${encodeURIComponent(targetUrl)}`,
    `https://corsproxy.io/?${encodeURIComponent(targetUrl)}`,
    `https://api.allorigins.win/raw?url=${encodeURIComponent(targetUrl)}`,
  ];

  let lastError = null;
  let html = null;

  for (let i = 0; i < tryUrls.length; i++) {
    try {
      const useHeaders = i === 0 ? headers : {
        'User-Agent': ua,
        'Accept-Language': 'zh-CN,zh;q=0.9',
      };

      const response = await fetchWithTimeout(tryUrls[i], {
        method: 'GET',
        headers: useHeaders,
        redirect: 'follow',
      });

      if (!response.ok) throw new Error(`HTTP ${response.status}`);

      const arrayBuf = await response.arrayBuffer();
      const buf = Buffer.from(arrayBuf);

      if (buf.length < 100) throw new Error('Response too small');

      // 反爬检测（仅对直接请求）
      if (i === 0) {
        const sample = buf.toString('utf-8', 0, 1500).toLowerCase();
        if (
          sample.includes('just a moment') ||
          sample.includes('attention required') ||
          sample.includes('cloudflare') ||
          sample.includes('verification') ||
          sample.includes('error 403')
        ) {
          throw new Error('Anti-bot detected');
        }
      }

      // 编码检测：先找 content-type 头，如果是 GBK 则用 iconv 解码
      const ct = String(response.headers.get('content-type') || '').toLowerCase();
      let useEncoding = encodingHint;
      if (ct.includes('gbk') || ct.includes('gb2312') || ct.includes('gb18030')) {
        useEncoding = 'gbk';
      } else if (ct.includes('charset=utf') || ct.includes('charset=utf-8')) {
        useEncoding = 'utf-8';
      } else {
        // 在 HTML meta 中检测编码
        const sample = buf.toString('utf-8', 0, 2000).toLowerCase();
        const m = sample.match(/charset\s*=\s*["']?\s*([a-z0-9-]+)/i);
        if (m) {
          const cs = m[1].toLowerCase();
          if (cs.includes('gbk') || cs.includes('gb2312') || cs.includes('gb18030')) {
            useEncoding = 'gbk';
          } else {
            useEncoding = 'utf-8';
          }
        }
      }

      if (useEncoding === 'gbk' || targetUrl.includes('jizai22.com')) {
        html = iconv.decode(buf, 'gbk');
      } else {
        html = buf.toString('utf-8');
      }

      lastError = null;
      break;
    } catch (e) {
      lastError = e;
      console.log(`[Browser-Search] Attempt ${i + 1} failed for ${targetUrl.substring(0, 60)}: ${e.message}`);
    }
  }

  if (lastError) throw lastError;
  return html;
}

// 从 HTML 中解析搜索结果 - 支持多个书源的不同 DOM 结构
function parseWanbengeResults(html, keyword) {
  const dom = new JSDOM(html);
  const doc = dom.window.document;
  const results = [];
  const kwLower = keyword.toLowerCase();

  // 策略1：直接跳转到详情页（标题匹配）
  const pageTitle = doc.querySelector('title')?.textContent || '';
  const h1Title = doc.querySelector('h1')?.textContent || '';
  if (pageTitle.toLowerCase().includes(kwLower) || h1Title.toLowerCase().includes(kwLower)) {
    results.push({
      title: (doc.querySelector('h1')?.textContent || doc.querySelector('h2')?.textContent || keyword).trim(),
      author: (doc.querySelector('.booktag .red, .book-author, .author')?.textContent || '未知').trim(),
      coverUrl: doc.querySelector('.bookimg img, img[src*="cover"], img.thumbnail')?.getAttribute('src') || '',
      detailUrl: doc.querySelector('link[rel="canonical"]')?.getAttribute('href') || '',
      description: doc.querySelector('#bookIntro, .bookintro, .intro')?.textContent?.trim().substring(0, 150) || '',
    });
  }

  // 策略2：搜索结果列表
  const ulItems = doc.querySelectorAll('.mySearch ul, .search-result ul, .result ul');
  ulItems.forEach(ul => {
    const links = ul.querySelectorAll('a[href*="/info/"], a[href*="/book/"]');
    links.forEach(a => {
      const title = a.textContent?.trim();
      if (title && title.toLowerCase().includes(kwLower)) {
        results.push({
          title,
          author: '未知',
          coverUrl: '',
          detailUrl: a.getAttribute('href') || '',
          description: '',
        });
      }
    });
  });

  // 策略3：表格/列表形式的搜索结果
  if (results.length === 0) {
    const allLinks = doc.querySelectorAll('a[href*="/info/"], a[href*="/book/"]');
    allLinks.forEach(a => {
      const title = a.textContent?.trim();
      if (title && title.length > 1 && title.length < 50 &&
        (title.toLowerCase().includes(kwLower) || kwLower.includes(title.toLowerCase().substring(0, Math.min(4, title.length))))) {
        if (!results.some(r => r.detailUrl === a.getAttribute('href'))) {
          results.push({
            title,
            author: '未知',
            coverUrl: '',
            detailUrl: a.getAttribute('href') || '',
            description: '',
          });
        }
      }
    });
  }

  return results.slice(0, 20);
}

function parseShukugeResults(html, keyword) {
  const dom = new JSDOM(html);
  const doc = dom.window.document;
  const kwLower = keyword.toLowerCase();
  const results = [];

  doc.querySelectorAll('.listitem').forEach(item => {
    const titleEl = item.querySelector('h2 a, h3 a, a');
    const title = (titleEl?.textContent || '').trim().replace(/\s*\(txt全集\)|txt全集下载/g, '');
    if (!title || !title.toLowerCase().includes(kwLower)) return;

    const descMatch = (item.querySelector('.bookdesc')?.textContent || '').match(/作者：(.+?)(\s|分类|$)/);
    const author = descMatch ? descMatch[1].trim() : '未知';
    const href = titleEl?.getAttribute('href') || '';
    const coverUrl = item.querySelector('img')?.getAttribute('src') || '';
    const descText = (item.querySelector('.bookdesc')?.textContent || '').replace(/简介[:：]/, '').trim();

    results.push({
      title,
      author,
      coverUrl,
      detailUrl: href,
      description: descText.substring(0, 150),
    });
  });

  // 如果 .listitem 没有，尝试全局查找
  if (results.length === 0) {
    doc.querySelectorAll('a[href*="/book/"]').forEach(a => {
      const title = (a.textContent || '').trim();
      if (title && title.length > 1 && title.length < 50 && title.toLowerCase().includes(kwLower)) {
        if (!results.some(r => r.detailUrl === a.getAttribute('href'))) {
          results.push({
            title,
            author: '未知',
            coverUrl: '',
            detailUrl: a.getAttribute('href') || '',
            description: '',
          });
        }
      }
    });
  }

  return results.slice(0, 20);
}

function parseDingdianResults(html, keyword) {
  const dom = new JSDOM(html);
  const doc = dom.window.document;
  const kwLower = keyword.toLowerCase();
  const results = [];

  // 顶点小说网 .item 结构
  doc.querySelectorAll('.item').forEach(item => {
    const titleLink = item.querySelector('dl dt a, a');
    const title = (titleLink?.textContent || '').trim();
    if (!title || !title.toLowerCase().includes(kwLower)) return;

    const authorEl = item.querySelector('dt span, .btm, dd span');
    const author = (authorEl?.textContent || '未知').replace(/作者[：:]/g, '').trim();
    const href = titleLink?.getAttribute('href') || '';
    const coverUrl = item.querySelector('img')?.getAttribute('data-original') || item.querySelector('img')?.getAttribute('src') || '';
    const description = item.querySelector('dd')?.textContent?.trim().substring(0, 150) || '';

    results.push({ title, author, coverUrl, detailUrl: href, description });
  });

  // 兜底：<dt><a> 结构
  if (results.length === 0) {
    doc.querySelectorAll('dt a').forEach(a => {
      const title = (a.textContent || '').trim();
      if (title && title.length > 1 && title.length < 50 && title.toLowerCase().includes(kwLower)) {
        results.push({
          title,
          author: '未知',
          coverUrl: '',
          detailUrl: a.getAttribute('href') || '',
          description: '',
        });
      }
    });
  }

  return results.slice(0, 20);
}

function parseBqguiResults(html, keyword) {
  const dom = new JSDOM(html);
  const doc = dom.window.document;
  const kwLower = keyword.toLowerCase();
  const results = [];

  // 直接跳转详情页
  const metaType = doc.querySelector('meta[property="og:type"]')?.getAttribute('content');
  if (metaType === 'novel') {
    const title = doc.querySelector('meta[property="og:title"]')?.getAttribute('content') || doc.querySelector('h1')?.textContent || '';
    if (title && title.toLowerCase().includes(kwLower)) {
      results.push({
        title: title.trim(),
        author: doc.querySelector('meta[property="og:novel:author"]')?.getAttribute('content') || '未知',
        coverUrl: doc.querySelector('meta[property="og:image"]')?.getAttribute('content') || '',
        detailUrl: doc.querySelector('meta[property="og:url"]')?.getAttribute('content') || '',
        description: doc.querySelector('meta[property="og:description"]')?.getAttribute('content').substring(0, 150) || '',
      });
    }
  }

  // 搜索列表页
  if (results.length === 0) {
    doc.querySelectorAll('.bookbox, .book-item').forEach(box => {
      const link = box.querySelector('.bookname a, a');
      const title = (link?.textContent || '').trim();
      if (!title || !title.toLowerCase().includes(kwLower)) return;
      const authorEl = box.querySelector('.author');
      results.push({
        title,
        author: (authorEl?.textContent || '未知').replace(/作者[:：]/g, '').trim(),
        coverUrl: box.querySelector('img')?.getAttribute('src') || '',
        detailUrl: link?.getAttribute('href') || '',
        description: (box.querySelector('.intro, .uptime')?.textContent || '').replace(/简介[:：]/g, '').trim().substring(0, 150),
      });
    });
  }

  // 兜底：全站链接
  if (results.length === 0) {
    doc.querySelectorAll('a[href*="/"]').forEach(a => {
      const title = (a.textContent || '').trim();
      if (title && title.length > 1 && title.length < 50 && title.toLowerCase().includes(kwLower)) {
        if (!results.some(r => r.detailUrl === a.getAttribute('href'))) {
          results.push({
            title, author: '未知', coverUrl: '',
            detailUrl: a.getAttribute('href') || '',
            description: '',
          });
        }
      }
    });
  }

  return results.slice(0, 20);
}

function parseAliceswResults(html, keyword) {
  const dom = new JSDOM(html);
  const doc = dom.window.document;
  const kwLower = keyword.toLowerCase();
  const results = [];

  doc.querySelectorAll('h4 a, h3 a, h5 a, .list-group-item a').forEach(a => {
    const href = a.getAttribute('href') || '';
    if (!href.includes('/novel/') && !href.includes('/book/')) return;
    const title = (a.textContent || '').replace(/^\d+[\.\、\s《]+/, '').trim();
    if (!title || title.length < 2) return;
    if (!title.toLowerCase().includes(kwLower) && !kwLower.includes(title.toLowerCase().substring(0, Math.min(4, title.length)))) return;
    if (results.some(r => r.detailUrl === href)) return;

    // 从同一父容器中提取作者
    let author = '未知';
    const parent = a.closest('.list-group-item, div, li');
    if (parent) {
      const authorLink = parent.querySelector('p.mb-1 a, a[href*="/author/"]');
      if (authorLink) author = (authorLink.textContent || '未知').trim();
    }

    results.push({
      title,
      author,
      coverUrl: '',
      detailUrl: href,
      description: '',
    });
  });

  return results.slice(0, 20);
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(204).end();
  }

  try {
    const site = req.query.site || 'wanbenge';
    const keyword = req.query.keyword || '';

    if (!keyword) {
      return res.status(200).json({ success: false, results: [], message: 'Missing keyword' });
    }

    const kw = String(keyword);

    // 根据书源构建搜索 URL
    let searchUrl = '';
    let encoding = 'utf-8';

    switch (site) {
      case 'wanbenge':
        searchUrl = `https://www.jizai22.com/modules/article/search.php?searchkey=${encodeURIComponent(kw)}`;
        encoding = 'gbk';
        break;
      case 'shukuge':
        searchUrl = `http://www.shukuge.com/Search?wd=${encodeURIComponent(kw)}`;
        break;
      case 'dingdian':
        searchUrl = `https://www.23ddw.net/searchsss/?searchkey=${encodeURIComponent(kw)}`;
        break;
      case 'bqgui':
        searchUrl = `https://www.bqgui.cc/s?q=${encodeURIComponent(kw)}`;
        break;
      case 'alicesw':
        searchUrl = `https://www.alicesw.com/search?q=${encodeURIComponent(kw)}&f=_all&sort=relevance`;
        break;
      default:
        searchUrl = `https://www.jizai22.com/modules/article/search.php?searchkey=${encodeURIComponent(kw)}`;
        encoding = 'gbk';
    }

    console.log(`[Browser-Search] Searching ${site} for: ${kw}, URL: ${searchUrl.substring(0, 80)}`);

    // 1. 先尝试 GET 方式
    let html = null;
    try {
      html = await fetchPageHtml(searchUrl, encoding);
    } catch (e) {
      console.log(`[Browser-Search] GET failed, will try POST for wanbenge: ${e.message}`);
    }

    // 2. 完本阁专用 POST 回退
    if (!html && site === 'wanbenge') {
      try {
        const gbkBuf = iconv.encode(kw, 'gbk');
        let gbkEnc = '';
        for (let i = 0; i < gbkBuf.length; i++) {
          gbkEnc += '%' + gbkBuf[i].toString(16).toUpperCase().padStart(2, '0');
        }
        const postProxies = [
          `https://api.codetabs.com/v1/proxy?quest=${encodeURIComponent('https://www.jizai22.com/modules/article/search.php')}`,
          `https://corsproxy.io/?${encodeURIComponent('https://www.jizai22.com/modules/article/search.php')}`,
        ];
        for (const pUrl of postProxies) {
          try {
            const response = await fetchWithTimeout(pUrl, {
              method: 'POST',
              headers: {
                'Content-Type': 'application/x-www-form-urlencoded',
                'User-Agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1',
              },
              body: `searchkey=${gbkEnc}&action=search`,
            });
            if (response.ok) {
              const buf = Buffer.from(await response.arrayBuffer());
              if (buf.length > 100) {
                html = iconv.decode(buf, 'gbk');
                break;
              }
            }
          } catch (e) {
            console.log(`[Browser-Search] Wanbenge POST proxy failed: ${e.message}`);
          }
        }
      } catch (e) {
        console.log(`[Browser-Search] Wanbenge POST fallback failed: ${e.message}`);
      }
    }

    if (!html || html.length < 200) {
      return res.status(200).json({
        success: false,
        results: [],
        message: 'Failed to fetch search page',
      });
    }

    // 根据书源解析结果
    let results = [];
    try {
      switch (site) {
        case 'wanbenge': results = parseWanbengeResults(html, kw); break;
        case 'shukuge': results = parseShukugeResults(html, kw); break;
        case 'dingdian': results = parseDingdianResults(html, kw); break;
        case 'bqgui': results = parseBqguiResults(html, kw); break;
        case 'alicesw': results = parseAliceswResults(html, kw); break;
        default: results = parseShukugeResults(html, kw);
      }
    } catch (e) {
      console.error(`[Browser-Search] Parse error for ${site}: ${e.message}`);
    }

    console.log(`[Browser-Search] ${site} found ${results.length} results for "${kw}"`);

    return res.status(200).json({
      success: results.length > 0,
      results: results,
      message: results.length > 0 ? 'OK' : 'No results',
    });
  } catch (error) {
    console.error('[Browser-Search] Final error:', error.message);
    return res.status(200).json({
      success: false,
      results: [],
      message: error.message,
    });
  }
}
