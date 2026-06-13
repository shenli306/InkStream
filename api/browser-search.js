
export const config = {
  runtime: 'nodejs',
  maxDuration: 30,
};

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

      // 编码检测
      const ct = String(response.headers.get('content-type') || '').toLowerCase();
      let useEncoding = encodingHint;
      if (ct.includes('gbk') || ct.includes('gb2312') || ct.includes('gb18030')) {
        useEncoding = 'gbk';
      } else if (ct.includes('charset=utf') || ct.includes('charset=utf-8')) {
        useEncoding = 'utf-8';
      } else {
        // 在 HTML meta 中检测编码
        const sample = buf.toString('utf-8', 0, 3000).toLowerCase();
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

// 简单的 HTML 解析辅助函数
function extractAttrs(html, tagName, attrName) {
  const results = [];
  // 匹配 <tag ... attr="value" ...> 或 <tag ... attr='value' ...>
  const regex = new RegExp(`<${tagName}[^>]+\\s${attrName}=["']([^"']+)["'][^>]*>`, 'gi');
  let match;
  while ((match = regex.exec(html)) !== null) {
    results.push(match[1]);
  }
  return results;
}

function extractText(html, tagName) {
  const results = [];
  // 匹配 <tag ...>文本</tag> 或 <tag>文本</tag>
  const regex = new RegExp(`<${tagName}[^>]*>([\\s\\S]*?)</${tagName}>`, 'gi');
  let match;
  while ((match = regex.exec(html)) !== null) {
    const text = match[1].replace(/<[^>]+>/g, '').trim();
    if (text) results.push(text);
  }
  return results;
}

function extractLinks(html, pattern) {
  const results = [];
  // 匹配 <a href="url" ...>title</a>
  const regex = /<a[^>]+href=["']([^"']+)["'][^>]*>([^<]*)<\/a>/gi;
  let match;
  while ((match = regex.exec(html)) !== null) {
    const href = match[1];
    const title = match[2].replace(/<[^>]+>/g, '').trim();
    if (pattern.test(href) && title) {
      results.push({ href, title });
    }
  }
  return results;
}

// 解析完本阁搜索结果
function parseWanbengeResults(html, keyword) {
  const results = [];
  const kwLower = keyword.toLowerCase();

  // 策略1：检测是否直接跳转详情页
  const titleMatch = html.match(/<h1[^>]*class=["']booktitle["'][^>]*>([\s\S]*?)<\/h1>/i);
  if (titleMatch) {
    const title = titleMatch[1].replace(/<[^>]+>/g, '').trim();
    if (title && (title.toLowerCase().includes(kwLower) || kwLower.includes(title.toLowerCase().substring(0, 3)))) {
      const canonical = html.match(/<link[^>]+rel=["']canonical["'][^>]+href=["']([^"']+)["']/i);
      const authorMatch = html.match(/<a[^>]+class=["'][^"']*author[^"']*["'][^>]*>([^<]+)<\/a>/i);
      results.push({
        title,
        author: authorMatch ? authorMatch[1].trim() : '未知',
        coverUrl: '',
        detailUrl: canonical ? canonical[1] : '',
        description: '',
      });
    }
  }

  // 策略2：解析 .bookbox 或 .item 结构
  const bookboxMatches = html.match(/<div[^>]+class=["'][^"']*bookbox[^"']*["'][^>]*>([\s\S]*?)<\/div>\s*<\/div>/gi) || [];
  for (const box of bookboxMatches) {
    const titleMatch = box.match(/class=["']bookname["'][^>]*>\s*<a[^>]+>([^<]+)<\/a>/i);
    const authorMatch = box.match(/class=["']author["'][^>]*>([^<]+)<\/a>/i);
    const linkMatch = box.match(/<a[^>]+href=["']([^"']+)["'][^>]*class=["']bookname["']/i);
    const descMatch = box.match(/class=["'](?:intro|update|desc)["'][^>]*>([^<]+)/i);
    if (titleMatch) {
      const title = titleMatch[1].trim();
      if (title.toLowerCase().includes(kwLower) || kwLower.includes(title.toLowerCase().substring(0, 3))) {
        results.push({
          title,
          author: authorMatch ? authorMatch[1].trim() : '未知',
          coverUrl: '',
          detailUrl: linkMatch ? linkMatch[1] : '',
          description: descMatch ? descMatch[1].trim().substring(0, 150) : '',
        });
      }
    }
  }

  // 策略3：解析 <dt><a href> 结构
  const dtLinks = html.match(/<dt[^>]*>([\s\S]*?)<\/dt>/gi) || [];
  for (const dt of dtLinks) {
    const aMatch = dt.match(/<a[^>]+href=["']([^"']+)["'][^>]*>([^<]+)<\/a>/i);
    if (aMatch) {
      const href = aMatch[1];
      const title = aMatch[2].trim();
      if (href.includes('/info/') && title.length > 1 && title.length < 50) {
        if (title.toLowerCase().includes(kwLower) || kwLower.includes(title.toLowerCase().substring(0, 3))) {
          if (!results.some(r => r.detailUrl === href)) {
            const authorMatch = dt.match(/<span[^>]*>([^<]+)<\/span>/i);
            results.push({
              title,
              author: authorMatch ? authorMatch[1].trim() : '未知',
              coverUrl: '',
              detailUrl: href,
              description: '',
            });
          }
        }
      }
    }
  }

  return results.slice(0, 20);
}

// 解析顶点小说搜索结果
function parseDingdianResults(html, keyword) {
  const results = [];
  const kwLower = keyword.toLowerCase();

  // 解析 .item 结构
  const itemMatches = html.match(/<div[^>]+class=["'][^"']*item[^"']*["'][^>]*>([\s\S]*?)<\/div>\s*<\/div>/gi) || [];
  for (const item of itemMatches) {
    const titleMatch = item.match(/<dt[^>]*>\s*<a[^>]+href=["']([^"']+)["'][^>]*>([^<]+)<\/a>/i);
    const authorMatch = item.match(/<span[^>]*class=["'][^"']*(?:btm|author)[^"']*["'][^>]*>([^<]+)<\/span>/i);
    const descMatch = item.match(/<dd[^>]*>([\s\S]*?)<\/dd>/i);
    if (titleMatch) {
      const href = titleMatch[1];
      const title = titleMatch[2].trim();
      if (href.includes('/book/') || href.includes('/info/')) {
        if (title.toLowerCase().includes(kwLower) || kwLower.includes(title.toLowerCase().substring(0, 3))) {
          results.push({
            title,
            author: authorMatch ? authorMatch[1].trim() : '未知',
            coverUrl: '',
            detailUrl: href,
            description: descMatch ? descMatch[1].replace(/<[^>]+>/g, '').trim().substring(0, 150) : '',
          });
        }
      }
    }
  }

  // 兜底：直接搜索 <a href="/book/...">xxx</a>
  if (results.length === 0) {
    const links = extractLinks(html, /\/(?:book|info)\/\d+/i);
    for (const { href, title } of links) {
      if (title.length > 1 && title.length < 50) {
        if (title.toLowerCase().includes(kwLower) || kwLower.includes(title.toLowerCase().substring(0, 3))) {
          if (!results.some(r => r.detailUrl === href)) {
            results.push({ title, author: '未知', coverUrl: '', detailUrl: href, description: '' });
          }
        }
      }
    }
  }

  return results.slice(0, 20);
}

// 解析笔趣阁搜索结果
function parseBqguiResults(html, keyword) {
  const results = [];
  const kwLower = keyword.toLowerCase();

  // 检测直接跳转详情页
  const ogType = html.match(/<meta[^>]+property=["']og:type["'][^>]+content=["']([^"']+)["']/i);
  if (ogType && ogType[1] === 'novel') {
    const ogTitle = html.match(/<meta[^>]+property=["']og:title["'][^>]+content=["']([^"']+)["']/i);
    const ogAuthor = html.match(/<meta[^>]+property=["']og:novel:author["'][^>]+content=["']([^"']+)["']/i);
    const ogUrl = html.match(/<meta[^>]+property=["']og:url["'][^>]+content=["']([^"']+)["']/i);
    const ogDesc = html.match(/<meta[^>]+property=["']og:description["'][^>]+content=["']([^"']+)["']/i);
    if (ogTitle) {
      const title = ogTitle[1].trim();
      if (title.toLowerCase().includes(kwLower) || kwLower.includes(title.toLowerCase().substring(0, 3))) {
        results.push({
          title,
          author: ogAuthor ? ogAuthor[1].trim() : '未知',
          coverUrl: '',
          detailUrl: ogUrl ? ogUrl[1] : '',
          description: ogDesc ? ogDesc[1].substring(0, 150) : '',
        });
      }
    }
  }

  // 解析 .bookbox 结构
  if (results.length === 0) {
    const bookboxes = html.match(/<div[^>]+class=["'][^"']*bookbox[^"']*["'][^>]*>([\s\S]*?)<\/div>\s*<\/div>/gi) || [];
    for (const box of bookboxes) {
      const linkMatch = box.match(/class=["']bookname["'][^>]*>\s*<a[^>]+href=["']([^"']+)["'][^>]*>([^<]+)<\/a>/i);
      const authorMatch = box.match(/class=["']author["'][^>]*>([^<]+)<\/a>/i);
      const descMatch = box.match(/class=["'](?:intro|update)["'][^>]*>([^<]+)/i);
      if (linkMatch) {
        const href = linkMatch[1];
        const title = linkMatch[2].trim();
        if (title.toLowerCase().includes(kwLower) || kwLower.includes(title.toLowerCase().substring(0, 3))) {
          results.push({
            title,
            author: authorMatch ? authorMatch[1].trim() : '未知',
            coverUrl: '',
            detailUrl: href,
            description: descMatch ? descMatch[1].trim().substring(0, 150) : '',
          });
        }
      }
    }
  }

  // 兜底：全局搜索
  if (results.length === 0) {
    const links = extractLinks(html, /\/book\/\d+/i);
    for (const { href, title } of links) {
      if (title.length > 1 && title.length < 50) {
        if (title.toLowerCase().includes(kwLower) || kwLower.includes(title.toLowerCase().substring(0, 3))) {
          if (!results.some(r => r.detailUrl === href)) {
            results.push({ title, author: '未知', coverUrl: '', detailUrl: href, description: '' });
          }
        }
      }
    }
  }

  return results.slice(0, 20);
}

// 解析爱丽丝书屋搜索结果
function parseAliceswResults(html, keyword) {
  const results = [];
  const kwLower = keyword.toLowerCase();

  // 解析 <h4><a href="/novel/...">title</a></h4> 结构
  const hMatches = html.match(/<h[1-5][^>]*>([\s\S]*?)<\/h[1-5]>/gi) || [];
  for (const h of hMatches) {
    const aMatch = h.match(/<a[^>]+href=["']([^"']+)["'][^>]*>([^<]+)<\/a>/i);
    if (aMatch) {
      const href = aMatch[1];
      const rawTitle = aMatch[2].trim().replace(/^\d+[\.\、\s《]+/, '');
      const title = rawTitle.replace(/^《|》$/g, '').trim();
      if ((href.includes('/novel/') || href.includes('/book/')) && title.length >= 2) {
        if (title.toLowerCase().includes(kwLower) || kwLower.includes(title.toLowerCase().substring(0, 3))) {
          if (!results.some(r => r.detailUrl === href)) {
            // 尝试从父容器找作者
            let author = '未知';
            const authorMatch = h.match(/作者[:：]\s*([^\s<]+)/i) || html.substring(html.indexOf(h) - 200, html.indexOf(h)).match(/作者[:：]\s*([^\s<,，]+)/i);
            if (authorMatch) author = authorMatch[1].trim();
            results.push({ title, author, coverUrl: '', detailUrl: href, description: '' });
          }
        }
      }
    }
  }

  return results.slice(0, 20);
}

// 解析书库阁搜索结果
function parseShukugeResults(html, keyword) {
  const results = [];
  const kwLower = keyword.toLowerCase();

  // 解析 .listitem 结构
  const items = html.match(/<div[^>]+class=["'][^"']*listitem[^"']*["'][^>]*>([\s\S]*?)<\/div>\s*<\/div>/gi) || [];
  for (const item of items) {
    const titleMatch = item.match(/<h[1-6][^>]*>\s*<a[^>]+href=["']([^"']+)["'][^>]*>([^<]+)<\/a>/i);
    if (titleMatch) {
      const href = titleMatch[1];
      const rawTitle = titleMatch[2].trim().replace(/\s*\(txt全集\)|txt全集下载/g, '');
      const title = rawTitle;
      if (title.toLowerCase().includes(kwLower) || kwLower.includes(title.toLowerCase().substring(0, 3))) {
        const authorMatch = item.match(/作者[:：]\s*([^\s<，,]+)/i);
        const descMatch = item.match(/简介[:：]\s*([\s\S]*?)(?:<|$)/i);
        results.push({
          title,
          author: authorMatch ? authorMatch[1].trim() : '未知',
          coverUrl: '',
          detailUrl: href,
          description: descMatch ? descMatch[1].replace(/<[^>]+>/g, '').trim().substring(0, 150) : '',
        });
      }
    }
  }

  if (results.length === 0) {
    const links = extractLinks(html, /\/book\/\d+/i);
    for (const { href, title } of links) {
      if (title.length > 1 && title.length < 50) {
        if (title.toLowerCase().includes(kwLower) || kwLower.includes(title.toLowerCase().substring(0, 3))) {
          if (!results.some(r => r.detailUrl === href)) {
            results.push({ title, author: '未知', coverUrl: '', detailUrl: href, description: '' });
          }
        }
      }
    }
  }

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

    console.log(`[Browser-Search] ${site}: ${kw}, URL: ${searchUrl.substring(0, 80)}`);

    let html = null;
    try {
      html = await fetchPageHtml(searchUrl, encoding);
    } catch (e) {
      console.log(`[Browser-Search] Fetch failed: ${e.message}`);
    }

    if (!html || html.length < 200) {
      return res.status(200).json({
        success: false,
        results: [],
        message: html ? 'HTML too short' : 'Failed to fetch',
      });
    }

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
      console.error(`[Browser-Search] Parse error: ${e.message}`);
    }

    console.log(`[Browser-Search] ${site} found ${results.length} results`);

    return res.status(200).json({
      success: results.length > 0,
      results,
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
