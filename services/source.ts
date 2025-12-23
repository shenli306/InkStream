import { Novel, Chapter, AppState, NovelSource } from "../types";
import pLimit from 'p-limit';

const WANBENGE_URL = "https://www.jizai22.com";
const YEDUJI_URL = "https://www.yeduji.com";
const BASE_URL = "https://www.jizai22.com"; // Fallback

const SHIJIEMINGZHU_URL = "https://www.shijiemingzhu.com";
const SHUKUGE_URL = "http://www.shukuge.com";

type SourceKey = 'wanbenge' | 'local' | 'yeduji' | 'shukuge';

const parseHTML = (html: string) => new DOMParser().parseFromString(html, "text/html");

interface SourceProvider {
  key: SourceKey;
  name: string;
  baseUrl: string;
  search: (keyword: string) => Promise<Novel[]>;
  getDetails: (novel: Novel) => Promise<Novel>;
  getChapterContent?: (chapter: Chapter) => Promise<string>;
}

const PROXY_LIST = [
  (url: string) => `/api/proxy?url=${encodeURIComponent(url)}`,
  (url: string) => {
    if (url.includes('www.jizai22.com')) {
      return url.replace('https://www.jizai22.com', '/proxy/wanbenge');
    }
    if (url.includes('www.yeduji.com')) {
      return url.replace('https://www.yeduji.com', '/proxy/yeduji');
    }
    if (url.includes('www.shukuge.com')) {
      return url.replace('http://www.shukuge.com', '/proxy/shukuge');
    }
    return url;
  },
  (url: string) => `https://api.codetabs.com/v1/proxy?quest=${encodeURIComponent(url)}`,
  (url: string) => `https://corsproxy.io/?${encodeURIComponent(url)}`,
  (url: string) => `https://thingproxy.freeboard.io/fetch/${url}`,
];

// Helper to fetch text with proxy rotation
const fetchText = async (url: string, options?: RequestInit, encoding = 'utf-8'): Promise<string> => {
  // If it's a local API call, fetch directly without proxy rotation
  if (url.startsWith('/api/')) {
    const response = await fetch(url, options);
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const buffer = await response.arrayBuffer();
    const decoder = new TextDecoder(encoding === 'gbk' ? 'gb18030' : encoding);
    return decoder.decode(buffer);
  }

  const targetUrl = url.startsWith('http') ? url : `${WANBENGE_URL}${url.startsWith('/') ? '' : '/'}${url}`;

  let lastError: any;

  for (const proxyFn of PROXY_LIST) {
    try {
      const proxyUrl = proxyFn(targetUrl);
      const isWanbenge = targetUrl.includes('jizai22.com') || proxyUrl.includes('/proxy/wanbenge');
      
      // Use dynamic referer based on targetUrl
      let referer = WANBENGE_URL;
      try {
        const urlObj = new URL(targetUrl);
        referer = `${urlObj.protocol}//${urlObj.host}/`;
      } catch (e) {
        // Fallback to WANBENGE_URL
      }

      const headers: any = {
        'User-Agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.0 Mobile/15E148 Safari/604.1',
        'Referer': referer,
        ...(options?.headers || {})
      };

      const response = await fetch(proxyUrl, {
        ...options,
        headers
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      const buffer = await response.arrayBuffer();
      // TextDecoder might not support 'gbk' in all browsers, 'gb18030' is a safer superset
      const decoder = new TextDecoder(encoding === 'gbk' ? 'gb18030' : encoding);
      return decoder.decode(buffer);
    } catch (e) {
      lastError = e;
      console.warn(`Proxy failed for ${targetUrl}:`, e);
    }
  }

  throw lastError || new Error("All proxies failed");
};

// Helper to fetch blob (for download)
export const fetchBlob = async (url: string): Promise<Blob> => {
  const targetUrl = url.startsWith('http') ? url : `${WANBENGE_URL}${url.startsWith('/') ? '' : '/'}${url}`;

  try {
    const response = await fetch(`/api/proxy?url=${encodeURIComponent(targetUrl)}`, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Referer': new URL(targetUrl).origin + '/',
      }
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return await response.blob();
  } catch (e) {
    console.error(`Blob fetch failed`, e);
    throw new Error("Download failed");
  }
};

const isRelevant = (novel: Novel, keyword: string): boolean => {
    const kw = keyword.toLowerCase();
    return novel.title.toLowerCase().includes(kw) || novel.author.toLowerCase().includes(kw);
};

const isUrl = (str: string) => {
    try {
        new URL(str);
        return true;
    } catch {
        return false;
    }
};

const wanbengeProvider: SourceProvider = {
  key: 'wanbenge',
  name: '完本阁',
  baseUrl: WANBENGE_URL,
  search: async (keyword: string): Promise<Novel[]> => {
    console.log(`[Wanbenge] Searching for: ${keyword}喵~`);
    let novels: Novel[] = [];
    
    // Helper to parse results from HTML
    const parseWanbengeHTML = (html: string, kw: string): Novel[] => {
      const doc = parseHTML(html);
      const results: Novel[] = [];
      const kwLower = kw.toLowerCase();
      
      // Detection if we are on homepage or irrelevant page
      const pageTitle = (doc.querySelector('title')?.textContent || "").toLowerCase();
      const isHomepage = pageTitle === '完本阁' || pageTitle.includes('首页') || (!pageTitle.includes(kwLower) && !doc.querySelector('.booklist') && !doc.querySelector('#bookIntro') && !html.includes('搜索“'));
      
      if (isHomepage) return [];

      // 1. Direct Detail Page (Redirected)
      const titleEl = doc.querySelector('h1.bookTitle') || doc.querySelector('.booktitle') || doc.querySelector('h1');
      const isDetailPage = doc.querySelector('.booklist') || doc.querySelector('#bookIntro') || doc.querySelector('dd.read');
      if (titleEl && isDetailPage) {
          const title = titleEl.textContent?.trim() || "未知";
          if (title.toLowerCase().includes(kwLower)) {
              const canonical = doc.querySelector('link[rel="canonical"]')?.getAttribute('href');
              const detailUrl = canonical || "";
              
              results.push({
                id: detailUrl || title,
                title: title,
                author: doc.querySelector('.booktag a[title^="作者："]')?.textContent?.trim() || 
                        doc.querySelector('.author')?.textContent?.trim() || "未知",
                description: doc.querySelector('#bookIntro')?.textContent?.trim() || 
                             doc.querySelector('.bookintro')?.textContent?.trim() || "",
                coverUrl: doc.querySelector('.img-thumbnail')?.getAttribute('src') || 
                          doc.querySelector('.bookimg img')?.getAttribute('src') || "",
                tags: [],
                status: 'Unknown',
                detailUrl: detailUrl,
                chapters: [],
                sourceName: '完本阁'
              });
              return results;
          }
      }

      // 2. mySearch structure (List view) - often used on mobile
      const ulItems = doc.querySelectorAll('.mySearch ul');
      if (ulItems.length > 0) {
        ulItems.forEach((ul) => {
          const titleLink = ul.querySelector('li:nth-child(1) a');
          const authorText = ul.querySelector('li:nth-child(3)')?.textContent?.replace('作者：', '').trim();
          if (titleLink) {
            const title = titleLink.textContent?.trim() || "未知";
            if (title.toLowerCase().includes(kwLower) || (authorText && authorText.toLowerCase().includes(kwLower))) {
              const relativeUrl = titleLink.getAttribute('href') || "";
              results.push({
                id: relativeUrl,
                title: title,
                author: authorText || "未知",
                description: "",
                coverUrl: "",
                tags: [],
                status: 'Unknown',
                detailUrl: relativeUrl.startsWith('http') ? relativeUrl : `${WANBENGE_URL}${relativeUrl.startsWith('/') ? '' : '/'}${relativeUrl}`,
                chapters: [],
                sourceName: '完本阁'
              });
            }
          }
        });
      }

      // 3. Search Results Table / List (More specific selectors to avoid sidebar/recommendations)
      // Focus on the main content area
      const mainContent = doc.querySelector('.main, #content, .booklist, .mySearch') || doc;
      const listItems = mainContent.querySelectorAll('tr, .bookbox, .item, .book-item');
      
      if (listItems.length === 0 && !isHomepage) {
          // Fallback: search for links in the main content area
          const links = mainContent.querySelectorAll('a[href*="/info/"], a[href*="/book/"]');
          links.forEach(link => {
              const title = link.textContent?.trim() || '';
              if (title && title.toLowerCase().includes(kwLower)) {
                  const relativeUrl = link.getAttribute('href') || '';
                  const detailUrl = relativeUrl.startsWith('http') ? relativeUrl : `${WANBENGE_URL}${relativeUrl.startsWith('/') ? '' : '/'}${relativeUrl}`;
                  
                  if (!results.some(r => r.detailUrl === detailUrl)) {
                      results.push({
                          id: detailUrl,
                          title: title,
                          detailUrl: detailUrl,
                          author: '未知',
                          coverUrl: '',
                          description: '',
                          tags: [],
                          status: 'Unknown',
                          chapters: [],
                          sourceName: '完本阁'
                      });
                  }
              }
          });
      } else {
          listItems.forEach(el => {
              // Avoid sidebar items by checking if the element is inside a sidebar
              if (el.closest('.sidebar, .side, #sidebar, .right')) return;

              const link = el.querySelector('a[href*="/info/"], a[href*="/book/"]') as HTMLAnchorElement;
              if (link) {
                  const title = link.textContent?.trim() || '';
                  const author = el.querySelector('.author, .s4, .item-author, td:nth-child(3)')?.textContent?.trim() || '未知';
                  
                  // Strict filtering for search results
                  if (title.toLowerCase().includes(kwLower) || author.toLowerCase().includes(kwLower)) {
                      const relativeUrl = link.getAttribute('href') || '';
                      const detailUrl = relativeUrl.startsWith('http') ? relativeUrl : `${WANBENGE_URL}${relativeUrl.startsWith('/') ? '' : '/'}${relativeUrl}`;
                      
                      if (!results.some(r => r.detailUrl === detailUrl)) {
                          results.push({
                              id: detailUrl,
                              title: title,
                              detailUrl: detailUrl,
                              author: author,
                              coverUrl: (el.querySelector('img') as HTMLImageElement)?.src || '',
                              description: el.querySelector('.intro, .item-desc')?.textContent?.trim() || '',
                              tags: [],
                              status: 'Unknown',
                              chapters: [],
                              sourceName: '完本阁'
                          });
                      }
                  }
              }
          });
      }

      return results;
    };

    // Try GET search
    try {
      const getUrl = `/api/gbk-search?target=${encodeURIComponent(`${WANBENGE_URL}/modules/article/search.php?searchkey={keyword}`)}&keyword=${encodeURIComponent(keyword)}&method=GET`;
      const getHtml = await fetchText(getUrl, undefined, 'gb18030');
      novels = parseWanbengeHTML(getHtml, keyword);
    } catch (e) {
      console.warn("[Wanbenge] GET search failed", e);
    }

    // Try POST search if GET failed
    if (novels.length === 0) {
      try {
        const postTarget = `${WANBENGE_URL}/modules/article/search.php`;
        const postData = `searchkey={keyword}&action=login&submit=%CB%D1++%CB%F7`;
        const postUrl = `/api/gbk-search?target=${encodeURIComponent(postTarget)}&keyword=${encodeURIComponent(keyword)}&method=POST&data=${encodeURIComponent(postData)}`;
        const postHtml = await fetchText(postUrl, undefined, 'gb18030');
        novels = parseWanbengeHTML(postHtml, keyword);
      } catch (e) {
        console.warn("[Wanbenge] POST search failed", e);
      }
    }

    // Fallback to browser search
    if (novels.length === 0) {
        try {
            const browserSearchUrl = `/api/browser-search?site=wanbenge&keyword=${encodeURIComponent(keyword)}`;
            const response = await fetch(browserSearchUrl);
            const data = await response.json();
            if (data.success && data.results) {
                novels = data.results.map((item: any) => ({
                    id: item.detailUrl,
                    title: item.title,
                    author: item.author || '未知',
                    coverUrl: item.coverUrl || '',
                    description: item.description || '',
                    tags: [],
                    status: 'Unknown',
                    chapters: [],
                    sourceName: '完本阁',
                    detailUrl: item.detailUrl
                }));
            }
        } catch (e) {
            console.warn("Wanbenge browser search fallback failed", e);
        }
    }

    // Final filtering to ensure relevance
    return novels.filter(n => 
        n.title.toLowerCase().includes(keyword.toLowerCase()) || 
        n.author.toLowerCase().includes(keyword.toLowerCase())
    );
  },
  getDetails: async (novel: Novel): Promise<Novel> => {
    const html = await fetchText(novel.detailUrl, undefined, 'gb18030');
    const doc = parseHTML(html);

    // Update Metadata
    const introP = doc.querySelector('.bookintro') || doc.querySelector('#bookIntro');
    if (introP) {
      // remove imgs and thumbnail
      introP.querySelectorAll('img').forEach(img => img.remove());
      novel.description = introP.textContent?.trim() || novel.description;
    }

    // Attempt to find cover if missing or invalid
    if (!novel.coverUrl || novel.coverUrl.includes('nocover')) {
       const img = doc.querySelector('.bookimg img, .pic img, .book-img img, .thumbnail, .img-thumbnail');
       if (img) {
         let src = img.getAttribute('src');
         if (src && !src.includes('nocover')) {
            if (!src.startsWith('http')) {
                src = `${WANBENGE_URL}${src.startsWith('/') ? '' : '/'}${src}`;
            }
            novel.coverUrl = src;
         }
       }
    }

    const titleEl = doc.querySelector('.booktitle') || doc.querySelector('h1');
    if (titleEl) novel.title = titleEl.textContent?.trim() || novel.title;

    const authorEl = doc.querySelector('.booktag a.red') || doc.querySelector('.author');
    if (authorEl) novel.author = authorEl.textContent?.trim() || novel.author;

    const statusSpan = Array.from(doc.querySelectorAll('.booktag .red, .booktag .blue')).find(s => s.textContent?.includes('连载') || s.textContent?.includes('完结') || s.textContent?.includes('连载中'));
    if (statusSpan) {
      if (statusSpan.textContent?.includes('完结')) novel.status = 'Completed';
      else novel.status = 'Serializing';
    }

    // Cover extraction handled above


    const chapterItems = doc.querySelectorAll('#list-chapterAll dd a');
    const chapters: Chapter[] = [];
    const seenUrls = new Set<string>();

    chapterItems.forEach((a, index) => {
      const href = a.getAttribute('href');
      const title = a.textContent?.trim() || `第${index + 1}章`;

      // Skip invalid URLs
      if (!href || href.trim() === '' || href.startsWith('javascript:') || href === '#') {
        return;
      }

      // Handle relative URLs
      const fullUrl = href.startsWith('http') ? href : (href.startsWith('/') ? `${WANBENGE_URL}${href}` : `${novel.detailUrl}${href}`);
      
      const normalizedUrl = new URL(fullUrl).pathname;
      if (!seenUrls.has(normalizedUrl)) {
        seenUrls.add(normalizedUrl);
        chapters.push({
          number: chapters.length + 1,
          title: title,
          url: fullUrl,
          content: undefined
        });
      }
    });

    if (chapters.length === 0) throw new Error("未找到任何章节");

    return { ...novel, chapters };
  },
  getChapterContent: async (chapter: Chapter): Promise<string> => {
    const html = await fetchText(chapter.url, undefined, 'gb18030');
    const doc = parseHTML(html);
    const cDiv = doc.querySelector('#content') || doc.querySelector('#rtext');
    if (!cDiv) throw new Error("Content div not found");

    cDiv.querySelectorAll('p.text-center, a, script').forEach(el => el.remove());
    let text = cDiv.innerHTML.replace(/<br\s*\/?>/gi, '\n');
    
    const lines = text.split('\n');
    const cleanLines = lines.map(l => {
      const temp = document.createElement('div');
      temp.innerHTML = l;
      return temp.textContent?.trim() || '';
    }).filter(l => l.length > 0);

    const finalLines = cleanLines.filter(l =>
      !l.includes('jizai') &&
      !l.includes('投票推荐') &&
      !l.includes('加入书签') &&
      !l.includes('search')
    );

    return finalLines.join('\n\n');
  }
}

const localProvider: SourceProvider = {
  key: 'local',
  name: '本地书库',
  baseUrl: '',
  search: async (keyword: string): Promise<Novel[]> => {
    try {
      const response = await fetch(`/api/list-downloads?keyword=${encodeURIComponent(keyword)}`);
      if (!response.ok) return [];
      const files: any[] = await response.json();

      const matched = files.filter(f => f.title.includes(keyword));

      return matched.map(f => ({
        id: f.filename,
        title: f.title,
        author: f.author || "本地下载",
        description: f.description || `已下载文件 | 大小: ${(f.size / 1024 / 1024).toFixed(2)} MB`,
        coverUrl: f.coverUrl || "",
        tags: ["本地"],
        status: 'Completed',
        detailUrl: f.url,
        chapters: f.chapters || [],
        sourceName: '本地书库'
      }));
    } catch (e) {
      console.warn("Local search failed", e);
      return [];
    }
  },
  getDetails: async (novel: Novel): Promise<Novel> => {
    return novel;
  },
  getChapterContent: async (chapter: Chapter): Promise<string> => {
    const html = await fetchText(chapter.url);
    const doc = parseHTML(html);
    const cDiv = doc.querySelector('#content, .chapter-content, .novel-content');
    if (!cDiv) throw new Error("Content not found");

    let text = cDiv.innerHTML;
    // Clean specific ads
    const ads = [
      "(http://www.shuwuwan.com/book/F72W-1.html)",
      "章节错误,点此举报(免注册)",
      "请记住本书首发域名：http://www.shuwuwan.com",
      "www.shuwuwan.com",
      "shuwuwan.com",
      "书屋湾",
      "首发域名"
    ];
    ads.forEach(ad => {
      text = text.split(ad).join('');
    });

    // Remove URLs
    text = text.replace(/https?:\/\/[^\s<>"]+|www\.[^\s<>"]+/g, '');
    // Remove brackets
    text = text.replace(/\([^)]*\)|（[^）]*）|【[^】]*】|\[[^\]]*\]|「[^」]*」|『[^』]*』/g, '');

    const tempDiv = document.createElement('div');
    tempDiv.innerHTML = text;
    tempDiv.querySelectorAll('script, div, a').forEach(el => el.remove());
    
    let content = tempDiv.innerHTML.replace(/<br\s*\/?>/gi, '\n');
    const finalDiv = document.createElement('div');
    finalDiv.innerHTML = content;
    return finalDiv.textContent?.trim() || "";
  }
};

const yedujiProvider: SourceProvider = {
  key: 'yeduji',
  name: '夜读集',
  baseUrl: YEDUJI_URL,
  search: async (keyword: string): Promise<Novel[]> => {
    console.log(`[Yeduji] Searching for: ${keyword}喵~`);
    const searchUrl = `${YEDUJI_URL}/search/?q=${encodeURIComponent(keyword)}`;
    const html = await fetchText(searchUrl);
    console.log(`[Yeduji] HTML length: ${html.length}喵~`);
    if (html.length < 500) {
      console.log(`[Yeduji] HTML sample: ${html}喵~`);
    }
    const doc = parseHTML(html);
    const results: Novel[] = [];
    
    // 搜索结果在 .novel-item 容器中
    const items = doc.querySelectorAll('.novel-item');
    
    items.forEach(item => {
      const titleEl = item.querySelector('.title') || item.querySelector('a[href*="/book/"]');
      const title = titleEl?.textContent?.trim() || "";
      const href = titleEl?.getAttribute('href');
      
      if (!title || !href) return;
      
      const detailUrl = href.startsWith('http') ? href : `${YEDUJI_URL}${href}`;
      const author = item.querySelector('.author')?.textContent?.trim() || "未知";
      const description = item.querySelector('.desc')?.textContent?.trim() || "";
      const coverImg = item.querySelector('.cover img');
      let coverUrl = coverImg?.getAttribute('data-src') || coverImg?.getAttribute('src') || "";
      
      if (coverUrl && !coverUrl.startsWith('http')) {
        coverUrl = `${YEDUJI_URL}${coverUrl}`;
      }

      results.push({
        id: detailUrl,
        title: title,
        author: author,
        description: description,
        coverUrl: coverUrl,
        tags: [],
        status: 'Unknown',
        detailUrl: detailUrl,
        chapters: [],
        sourceName: '夜读集'
      });
    });

    console.log(`[Yeduji] Found ${results.length} items on page喵~`);
    return results;
  },
  getDetails: async (novel: Novel): Promise<Novel> => {
    console.log(`[Yeduji] Getting details for: ${novel.title} from ${novel.detailUrl}喵~`);
    const html = await fetchText(novel.detailUrl);
    console.log(`[Yeduji] Detail HTML length: ${html.length}喵~`);
    const doc = parseHTML(html);

    // 提取封面
    const coverImg = doc.querySelector('main img[src*="/data/cover/"]') || doc.querySelector('main img');
    if (coverImg) {
      const src = coverImg.getAttribute('src');
      novel.coverUrl = src?.startsWith('http') ? src : `${YEDUJI_URL}${src}`;
    }

    // 提取作者
    const authorLabel = Array.from(doc.querySelectorAll('main span, main div')).find(el => el.textContent?.includes('作者'));
    if (authorLabel) {
      const authorValue = authorLabel.nextElementSibling;
      novel.author = authorValue?.textContent?.trim() || novel.author;
    }

    // 提取状态
    const statusLabel = Array.from(doc.querySelectorAll('main span, main div')).find(el => el.textContent?.includes('状态'));
    if (statusLabel) {
      const statusValue = statusLabel.nextElementSibling;
      const statusText = statusValue?.textContent?.trim() || "";
      novel.status = statusText.includes('完结') ? 'Completed' : 'Serializing';
    }

    // 提取简介
    const descEl = doc.querySelector('main p') || doc.querySelector('.desc');
    if (descEl) {
      novel.description = descEl.textContent?.trim() || novel.description;
    }

    // 获取章节列表
    const listUrl = novel.detailUrl.endsWith('/') ? `${novel.detailUrl}list/` : `${novel.detailUrl}/list/`;
    console.log(`[Yeduji] Fetching chapter list from: ${listUrl}喵~`);
    const listHtml = await fetchText(listUrl);
    console.log(`[Yeduji] Chapter list HTML length: ${listHtml.length}喵~`);
    console.log(`[Yeduji] Chapter list HTML start: ${listHtml.substring(0, 500)}喵~`);
    const listDoc = parseHTML(listHtml);
    
    const chapters: Chapter[] = [];
    // 夜读集的列表页通常是 <ul><li><a href="..."><h4>标题</h4></a></li></ul>
    // 或者直接是 a 标签
    const chapterLinks = Array.from(listDoc.querySelectorAll('a[href*=".html"]'))
        .filter(a => {
            const href = a.getAttribute('href') || '';
            // 排除掉一些非章节链接，比如分类、首页等
            return !href.includes('/category/') && !href.includes('/list/') && !href.includes('/book/') || href.split('/').length > 3;
        });
    
    console.log(`[Yeduji] Found ${chapterLinks.length} filtered links in list page喵~`);
    
    chapterLinks.forEach((a, index) => {
      const href = a.getAttribute('href');
      if (!href) return;
      
      const fullUrl = href.startsWith('http') ? href : `${YEDUJI_URL}${href}`;
      const title = a.querySelector('h4')?.textContent?.trim() || 
                    a.querySelector('span')?.textContent?.trim() ||
                    a.textContent?.replace('免费', '').replace('VIP', '').trim() || 
                    `第${index + 1}章`;
      
      // 避免重复链接
      if (!chapters.find(c => c.url === fullUrl)) {
          chapters.push({
            number: chapters.length + 1,
            title: title,
            url: fullUrl
          });
      }
    });

    if (chapters.length === 0) {
        console.log(`[Yeduji] No chapters in list page, trying detail page fallback喵~`);
        // Try detail page as fallback for chapters
        const detailChapterLinks = doc.querySelectorAll('main a[href*=".html"]');
        console.log(`[Yeduji] Found ${detailChapterLinks.length} links in detail page喵~`);
        detailChapterLinks.forEach((a, index) => {
             const href = a.getAttribute('href');
             if (!href || href.includes('list/')) return;
             const fullUrl = href.startsWith('http') ? href : `${YEDUJI_URL}${href}`;
             const title = a.querySelector('h4')?.textContent?.trim() || a.textContent?.replace('免费', '').replace('VIP', '').trim() || `第${index + 1}章`;
             if (!chapters.find(c => c.url === fullUrl)) {
                 chapters.push({
                     number: chapters.length + 1,
                     title: title,
                     url: fullUrl
                 });
             }
        });
    }

    console.log(`[Yeduji] Total chapters found: ${chapters.length}喵~`);
    if (chapters.length === 0) throw new Error("未找到章节列表喵~");

    return { ...novel, chapters };
  },
  getChapterContent: async (chapter: Chapter): Promise<string> => {
    console.log(`[Yeduji] Getting content for: ${chapter.title}喵~`);
    const html = await fetchText(chapter.url);
    const doc = parseHTML(html);
    
    // 内容通常在 article 或特定的 div 中
    const contentEl = doc.querySelector('article') || doc.querySelector('.content') || doc.querySelector('#content');
    if (!contentEl) throw new Error("未找到章节内容喵~");

    // 移除不必要的元素
    contentEl.querySelectorAll('script, style, ins, .ads, .breadcrumb').forEach(el => el.remove());

    let text = contentEl.innerHTML
      .replace(/<br\s*\/?>/gi, '\n')
      .replace(/<p[^>]*>/gi, '')
      .replace(/<\/p>/gi, '\n\n');

    const tempDiv = document.createElement('div');
    tempDiv.innerHTML = text;
    
    const cleanText = tempDiv.textContent || "";
    return cleanText.split('\n')
      .map(line => line.trim())
      .filter(line => line.length > 0)
      .join('\n\n');
  }
};

const shukugeProvider: SourceProvider = {
  key: 'shukuge',
  name: '书库阁',
  baseUrl: SHUKUGE_URL,
  search: async (keyword: string): Promise<Novel[]> => {
    console.log(`[Shukuge] Searching for: ${keyword}喵~`);
    const searchUrl = `${SHUKUGE_URL}/Search?wd=${encodeURIComponent(keyword)}`;
    const html = await fetchText(searchUrl);
    const doc = parseHTML(html);
    const results: Novel[] = [];
    
    // 搜索结果通常在 .listitem 标签中
    const items = doc.querySelectorAll('.listitem');
    
    items.forEach(item => {
      const titleEl = item.querySelector('h2 a') as HTMLAnchorElement;
      if (!titleEl) return;
      
      const title = titleEl.textContent?.trim() || "";
      const href = titleEl.getAttribute('href') || "";
      const authorMatch = item.querySelector('.bookdesc')?.textContent?.match(/作者：(.*?)(?=\s|分类|$)/);
      const author = authorMatch ? authorMatch[1].trim() : "未知";
      
      const imgEl = item.querySelector('img');
      let coverUrl = imgEl?.getAttribute('src') || "";
      if (coverUrl && !coverUrl.startsWith('http')) {
        coverUrl = `${SHUKUGE_URL}${coverUrl}`;
      }
      
      if (title.toLowerCase().includes(keyword.toLowerCase()) || author.toLowerCase().includes(keyword.toLowerCase())) {
        results.push({
          id: href,
          title,
          author,
          coverUrl,
          description: item.querySelector('.bookdesc')?.textContent?.split('简介：')[1]?.trim() || "",
          tags: [],
          status: 'Unknown',
          detailUrl: href.startsWith('http') ? href : `${SHUKUGE_URL}${href}`,
          chapters: [],
          sourceName: '书库阁'
        });
      }
    });
    
    // 如果常规解析没结果，尝试从链接里直接找
    if (results.length === 0) {
      const links = doc.querySelectorAll('a[href*="/book/"]');
      links.forEach(link => {
        const title = link.textContent?.trim() || "";
        if (title && title.toLowerCase().includes(keyword.toLowerCase())) {
          const href = link.getAttribute('href') || "";
          const detailUrl = href.startsWith('http') ? href : `${SHUKUGE_URL}${href}`;
          if (!results.some(r => r.detailUrl === detailUrl)) {
            results.push({
              id: href,
              title,
              author: "未知",
              coverUrl: "",
              description: "",
              tags: [],
              status: 'Unknown',
              detailUrl,
              chapters: [],
              sourceName: '书库阁'
            });
          }
        }
      });
    }
    
    return results;
  },
  getDetails: async (novel: Novel): Promise<Novel> => {
    // 书库阁的元数据通常在 /book/id/，而目录在 /book/id/index.html
    const detailUrl = novel.detailUrl.endsWith('index.html') ? novel.detailUrl.replace('index.html', '') : 
                     (novel.detailUrl.endsWith('/') ? novel.detailUrl : `${novel.detailUrl}/`);
    const indexUrl = `${detailUrl}index.html`;
    
    console.log(`[Shukuge] Fetching metadata from: ${detailUrl}喵~`);
    const detailHtml = await fetchText(detailUrl);
    const detailDoc = parseHTML(detailHtml);
    
    // 提取元数据
    const titleEl = detailDoc.querySelector('h1');
    if (titleEl) novel.title = titleEl.textContent?.trim() || novel.title;
    
    const authorEl = Array.from(detailDoc.querySelectorAll('p, span, a')).find(el => el.textContent?.includes('作者：'));
    if (authorEl) {
      novel.author = authorEl.textContent?.replace('作者：', '').trim() || novel.author;
    } else {
      const authorLink = detailDoc.querySelector('a[href*="/zuozhe/"]');
      if (authorLink) novel.author = authorLink.textContent?.trim() || novel.author;
    }

    // 提取封面
    const coverImg = detailDoc.querySelector('.bookdcover img') || detailDoc.querySelector('img[alt="' + novel.title + '"]');
    if (coverImg) {
      const src = coverImg.getAttribute('src');
      if (src) {
        novel.coverUrl = src.startsWith('http') ? src : `${SHUKUGE_URL}${src}`;
      }
    }

    // 提取简介
    const descEl = detailDoc.querySelector('.bookintro') || detailDoc.querySelector('.intro') || 
                   Array.from(detailDoc.querySelectorAll('p')).find(p => p.textContent?.length > 50);
    if (descEl) novel.description = descEl.textContent?.trim() || novel.description;

    console.log(`[Shukuge] Fetching chapters from: ${indexUrl}喵~`);
    const html = await fetchText(indexUrl);
    const doc = parseHTML(html);
    const chapters: Chapter[] = [];
    
    // 提取章节
    const links = doc.querySelectorAll('a[href*=".html"]');
    const seenUrls = new Set<string>();
    
    links.forEach(link => {
      const href = link.getAttribute('href') || "";
      const title = link.textContent?.trim() || "";
      
      // 过滤掉非章节链接
      if (href && !href.startsWith('http') && 
          title && !['首页', '上一页', '下一页', '末页', '加入书签', '投推荐票', '章节目录', 'TXT下载'].includes(title)) {
        
        try {
          const fullUrl = new URL(href, indexUrl).href;
          if (!seenUrls.has(fullUrl) && fullUrl.endsWith('.html') && !fullUrl.endsWith('index.html')) {
            seenUrls.add(fullUrl);
            chapters.push({
              number: chapters.length + 1,
              title,
              url: fullUrl
            });
          }
        } catch (e) {
          // 忽略无效链接
        }
      }
    });
    
    if (chapters.length === 0) throw new Error("未找到章节列表喵~");
    
    return { ...novel, chapters };
  },
  getChapterContent: async (chapter: Chapter): Promise<string> => {
    const html = await fetchText(chapter.url);
    const doc = parseHTML(html);
    const contentEl = doc.querySelector('#content');
    if (!contentEl) throw new Error("未找到章节内容喵~");
    
    // 清理广告
    contentEl.querySelectorAll('script, a, div[style*="display:none"]').forEach(el => el.remove());
    
    let text = contentEl.innerHTML
      .replace(/<br\s*\/?>/gi, '\n')
      .replace(/&nbsp;/g, ' ');
      
    const tempDiv = document.createElement('div');
    tempDiv.innerHTML = text;
    return tempDiv.textContent?.trim() || "";
  }
};

export const PROVIDERS: SourceProvider[] = [wanbengeProvider, yedujiProvider, shukugeProvider, localProvider];

export const searchNovel = async (keyword: string, source: any = 'auto'): Promise<Novel[]> => {
  // Check if keyword is a URL
  if (isUrl(keyword)) {
      // Generic URL handling (experimental)
  }

  console.log(`[Search] Starting search for "${keyword}" across all providers喵~`);
  
  const resultsByProvider: Record<string, number> = {};
  
  const promises = PROVIDERS.map(p => p.search(keyword).then(res => {
    resultsByProvider[p.name] = res.length;
    console.log(`[Search] ${p.name} returned ${res.length} results喵~`);
    return res;
  }).catch(e => {
    resultsByProvider[p.name] = 0;
    console.error(`[Search] ${p.name} failed:`, e.message || e);
    return [] as Novel[];
  }));

  const results = await Promise.all(promises);
  const allNovels = results.flat();
  
  console.log(`[Search] Aggregated results summary喵~:`);
  Object.entries(resultsByProvider).forEach(([name, count]) => {
      console.log(`- ${name}: ${count} results`);
  });
  console.log(`[Search] Total raw results: ${allNovels.length}喵~`);

  const localNovels = allNovels.filter(n => n.sourceName === '本地书库');
  const networkNovels = allNovels.filter(n => n.sourceName !== '本地书库');

  // Group network novels by title + author to identify sources
  const networkNovelsByBook: Record<string, Novel[]> = {};
  networkNovels.forEach(n => {
      const title = n.title.trim().toLowerCase();
      const author = n.author.trim().toLowerCase();
      const key = `${title}_${author}`;
      if (!networkNovelsByBook[key]) networkNovelsByBook[key] = [];
      networkNovelsByBook[key].push(n);
  });

  console.log(`[Search] Grouped ${networkNovels.length} network novels into ${Object.keys(networkNovelsByBook).length} unique books喵~`);

  // Merge sources for the same book
  const mergedNetworkNovels: Novel[] = Object.entries(networkNovelsByBook).map(([key, group]) => {
      // Pick the best result as the primary (prefer one with description/cover)
      const primary = group.sort((a, b) => {
          const score = (n: Novel) => (n.description ? 2 : 0) + (n.coverUrl ? 1 : 0);
          return score(b) - score(a);
      })[0];

      // Collect all sources and de-duplicate by URL
      const seenUrls = new Set<string>();
      const sources: NovelSource[] = [];
      
      group.forEach(n => {
          if (!seenUrls.has(n.detailUrl)) {
              seenUrls.add(n.detailUrl);
              sources.push({
                  name: n.sourceName || '未知',
                  url: n.detailUrl
              });
          }
      });
      
      // Collect unique source names for display
      const sourceNames = Array.from(new Set(sources.map(s => s.name))).filter(Boolean);
      
      return {
          ...primary,
          sourceName: sourceNames.join(' | '), // Show multiple sources in the tag
          sources: sources
      };
  });

  const filteredNetworkNovels = mergedNetworkNovels.filter(netNovel => {
    const isLocal = localNovels.some(localNovel => {
      const titleMatch = localNovel.title.trim().toLowerCase() === netNovel.title.trim().toLowerCase();
      const authorMatch = localNovel.author.toLowerCase() === netNovel.author.toLowerCase() || 
                         localNovel.author === '未知' || 
                         netNovel.author === '未知';
      return titleMatch && authorMatch;
    });
    return !isLocal;
  });

  console.log(`[Search] Final results: ${localNovels.length} local, ${filteredNetworkNovels.length} network喵~`);
  return [...localNovels, ...filteredNetworkNovels];
}

const getProviderByName = (name: string): SourceProvider | undefined => {
  if (name.includes('本地书库')) return localProvider;
  if (name.includes('完本阁')) return wanbengeProvider;
  if (name.includes('夜读集')) return yedujiProvider;
  if (name.includes('书库阁')) return shukugeProvider;
  return undefined;
};

export const getNovelDetails = async (novel: Novel): Promise<Novel> => {
  // If we have multiple sources, try them one by one until one succeeds
  if (novel.sources && novel.sources.length > 0) {
    console.log(`[Details] Trying multiple sources for "${novel.title}"喵~`);
    for (const source of novel.sources) {
      const provider = getProviderByName(source.name);
      if (provider) {
        try {
          console.log(`[Details] Trying source: ${source.name} (${source.url})喵~`);
          // Temporarily set the detailUrl to this source's URL for the provider to use
          const tempNovel = { ...novel, detailUrl: source.url, sourceName: source.name };
          const details = await provider.getDetails(tempNovel);
          if (details && details.chapters && details.chapters.length > 0) {
            console.log(`[Details] Successfully got details from ${source.name}喵~`);
            // Update the original novel with the successful source's info
            return {
              ...details,
              sourceName: novel.sourceName, // Keep the combined source name for UI
              sources: novel.sources        // Keep the sources list
            };
          }
        } catch (e) {
          console.warn(`[Details] Source ${source.name} failed:`, e);
        }
      }
    }
  }

  // Fallback to original logic if no sources or all failed
  const name = novel.sourceName || '';
  const provider = getProviderByName(name) || wanbengeProvider;
  return provider.getDetails(novel);
};

const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

const retry = async <T>(fn: () => Promise<T>, retries = 3, delayMs = 1000, context: string = ''): Promise<T> => {
  try {
    return await fn();
  } catch (error) {
    if (retries <= 0) throw error;
    console.warn(`Retry attempt remaining: ${retries} for ${context}. Error: ${error instanceof Error ? error.message : String(error)}`);
    await delay(delayMs);
    return retry(fn, retries - 1, delayMs * 2, context);
  }
};

export const downloadAndParseNovel = async (novel: Novel, onProgress: (msg: string, percent: number) => void): Promise<Novel> => {

  const name = novel.sourceName || '';
  const isScrapable = ['完本阁', '世界名著', '夜读集', '书库阁'].some(s => name.includes(s));

  if (novel.chapters.length > 0 && isScrapable) {
    onProgress(`准备下载 ${novel.chapters.length} 章...`, 0);

    const limit = pLimit(3);
    let completed = 0;
    let failedCount = 0;
    
    // Identify which provider's chapters these are
    // Since getNovelDetails now returns the chapters from the FIRST successful source,
    // we should try to find which provider that was.
    // However, the simplest way is to check the chapter URL.
    
    const fetchChapter = async (chapter: Chapter) => {
      if (!chapter.url) return;
      try {
        await retry(async () => {
          // Find the provider that can handle this chapter's URL
          let provider = PROVIDERS.find(p => {
            // Check by URL matching
            const urlMatch = (p.baseUrl && chapter.url?.includes(new URL(p.baseUrl).hostname)) || 
                             (p.name === '完本阁' && chapter.url?.includes('jizai22.com'));
            return urlMatch;
          });
          
          // Fallback: use the provider matching the sourceName
          if (!provider) {
            provider = PROVIDERS.find(p => name.includes(p.key) || name.includes(p.name));
          }

          if (provider && provider.getChapterContent) {
            chapter.content = await provider.getChapterContent(chapter);
            if (!chapter.content || chapter.content === "获取失败") {
              throw new Error("Content extraction returned empty or failed");
            }
            return;
          }

          throw new Error(`No provider found for chapter URL: ${chapter.url}`);
        }, 3, 2000, `Chapter ${chapter.title}`);

      } catch (e) {
        console.warn(`Failed to fetch chapter ${chapter.title}`, e);
        chapter.content = "获取失败";
        failedCount++;
      } finally {
        completed++;
        const percent = Math.floor((completed / novel.chapters.length) * 100);
        if (completed % 5 === 0 || completed === novel.chapters.length) {
          onProgress(`下载中: ${chapter.title} (${completed}/${novel.chapters.length}) ${failedCount > 0 ? `[失败${failedCount}]` : ''}`, percent);
        }
      }
    };

    const input = novel.chapters.map(c => limit(() => fetchChapter(c)));
    await Promise.all(input);

    if (failedCount > 0) {
      onProgress(`下载完成，${failedCount} 章失败`, 100);
    } else {
      onProgress("所有章节下载完成", 100);
    }

    return novel;

  } else {
    throw new Error("无法下载：该小说不支持自动抓取");
  }
};
