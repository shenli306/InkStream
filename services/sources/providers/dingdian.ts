/**
 * 顶点小说书源喵~
 */
import type { Novel, Chapter } from '../../../types';
import type { SourceProvider } from '../shared/types';
import { DINGDIAN_URL, searchCache, CACHE_DURATION } from '../shared/constants';
import { parseHTML } from '../shared/dom';
import { fetchText, proxifyImage } from '../shared/fetcher';
import { cleanupSearchCache } from '../shared/cache';
import { isRelevant } from '../shared/relevance';

export const dingdianProvider: SourceProvider = {
  key: 'dingdian',
  name: '顶点小说网',
  baseUrl: DINGDIAN_URL,
  search: async (keyword: string): Promise<Novel[]> => {
    console.log(`[Dingdian] Searching for: ${keyword}喵~`);
    
    // 检查缓存喵~
    const cacheKey = `dingdian:${keyword.toLowerCase().trim()}`;
    const cached = searchCache.get(cacheKey);
    if (cached && Date.now() - cached.timestamp < CACHE_DURATION) {
      console.log(`[Dingdian] Using cached results for: ${keyword}喵~`);
      return cached.results;
    }
    
    let finalResults: Novel[] = [];
    
    // 方案1: 优先尝试直接HTTP搜索（更快喵~）
    try {
      const directResults = await directDingdianSearch(keyword);
      if (directResults.length > 0) {
        console.log(`[Dingdian] Direct search found ${directResults.length} results喵~`);
        finalResults = directResults;
      }
    } catch (directError) {
      console.warn("[Dingdian] Direct search failed, falling back to browser喵~", directError);
    }
    
    // 方案2: 如果直接搜索没结果，使用浏览器搜索作为备选
    if (finalResults.length === 0) {
      try {
        // 在 Vercel 环境下，browser-search 可能会 fallback 到客户端解析，
        // 或者如果配置了 puppeteer，会使用 puppeteer。
        const browserSearchUrl = `/api/browser-search?site=dingdian&keyword=${encodeURIComponent(keyword)}`;
        const response = await fetch(browserSearchUrl, { 
          signal: AbortSignal.timeout(30000) // 30秒超时喵
        });
        const data = await response.json();
        
        if (data.success && data.results) {
          finalResults = data.results.map((item: any) => ({
            id: item.detailUrl,
            title: item.title,
            author: item.author || '未知',
            coverUrl: item.coverUrl || '',
            description: item.description || '',
            tags: [],
            status: 'Unknown',
            chapters: [],
            sourceName: '顶点小说网',
            detailUrl: item.detailUrl
          }));
        }
      } catch (e) {
        console.warn("Dingdian browser search also failed喵~", e);
      }
    }
    
    // 更新缓存喵~
    if (finalResults.length > 0) {
      searchCache.set(cacheKey, {
        results: finalResults,
        timestamp: Date.now()
      });
      
      // 清理过期缓存（避免内存泄漏喵~）
      cleanupSearchCache();
    }
    
    return finalResults;
  },
  getDetails: async (novel: Novel): Promise<Novel> => {
    console.log(`[Dingdian] Getting details for: ${novel.title}喵~`);
    
    let html = "";
    try {
      // 1. 尝试普通 fetch，探测编码
      html = await fetchText(novel.detailUrl, undefined, 'utf-8');
      
      // 检查是否需要切换到 GBK 喵~
      if (html.includes("charset=gb") || html.includes("charset=\"gb") || html.includes('琚')) {
        console.log("[Dingdian] Detecting GBK encoding, retrying...喵~");
        html = await fetchText(novel.detailUrl, undefined, 'gb18030');
      }
      
      // 如果内容太短或没找到关键列表，说明可能被拦截了喵
      if (html.length < 500 || !html.includes("id=\"list\"")) {
        throw new Error("Content too short or missing list, maybe anti-scraping喵~");
      }
    } catch (e) {
      console.warn("[Dingdian] Direct fetch failed or blocked, trying browser fallback...喵~");
      try {
        const browserDetailsUrl = `/api/browser-details?url=${encodeURIComponent(novel.detailUrl)}`;
        const response = await fetch(browserDetailsUrl);
        const data = await response.json();
        if (data.success && data.html) {
          html = data.html;
        } else {
          throw new Error("Browser fallback failed喵~");
        }
      } catch (browserError) {
        console.error("[Dingdian] Both fetch and browser fallback failed喵~", browserError);
        throw new Error("无法获取小说详情喵~ 请检查网络或稍后再试喵~");
      }
    }

    const doc = parseHTML(html);
    
    // 提取简介喵
    const descEl = doc.querySelector('#intro') || doc.querySelector('.intro') || doc.querySelector('#description') || doc.querySelector('.book-intro');
    if (descEl) {
      novel.description = descEl.textContent?.trim() || novel.description;
    }
    
    // 提取封面喵
    const coverImg = doc.querySelector('#fmimg img') || doc.querySelector('.book-img img') || doc.querySelector('.image img') || doc.querySelector('.imgbox img');
    if (coverImg) {
      const src = coverImg.getAttribute('data-original') || coverImg.getAttribute('data-src') || coverImg.getAttribute('src');
      if (src) {
        let coverUrl = src.startsWith('http') ? src : new URL(src, novel.detailUrl).href;
        novel.coverUrl = proxifyImage(coverUrl);
      }
    }
    
    const chapters: Chapter[] = [];
    const seenUrls = new Set<string>();
    
    // 提取章节列表喵 - 增加过滤“最新章节”重复项的逻辑
    const listDl = doc.querySelector('#list dl');
    if (listDl) {
      const children = Array.from(listDl.children);
      const dtElements = children.filter(c => c.tagName === 'DT');
      const dtCount = dtElements.length;
      
      // 策略：如果有多个DT，通常最后一个DT才是真正的正文开始喵
      // 或者寻找包含“正文”、“目录”且不含“最新”的DT喵
      let startCollecting = dtCount <= 1; 
      let foundDirectoryDt = false;

      children.forEach((child) => {
        if (child.tagName === 'DT') {
          const text = child.textContent || '';
          // 排除包含“最新”的标题，寻找真正的目录开始喵
          if ((text.includes('正文') || text.includes('目录') || text.includes('章节')) && !text.includes('最新')) {
            startCollecting = true;
            foundDirectoryDt = true;
          }
        } else if (child.tagName === 'A' && startCollecting) {
          const a = child as HTMLAnchorElement;
          const href = a.getAttribute('href');
          const title = a.textContent?.trim() || `第${chapters.length + 1}章`;
          
          if (href && !href.startsWith('javascript:')) {
            const fullUrl = href.startsWith('http') ? href : new URL(href, novel.detailUrl).href;
            if (!seenUrls.has(fullUrl) && (fullUrl.endsWith('.html') || fullUrl.includes('/du/'))) {
              seenUrls.add(fullUrl);
              chapters.push({
                number: chapters.length + 1,
                title,
                url: fullUrl
              });
            }
          }
        }
      });

      // 兜底逻辑：如果刚才因为条件太严苛没找到目录DT，但明明有DT，就从最后一个DT开始抓喵
      if (!foundDirectoryDt && dtCount > 1) {
        chapters.length = 0; // 清空可能误抓的内容喵
        seenUrls.clear();
        let passedLastDt = false;
        const lastDt = dtElements[dtElements.length - 1];
        
        children.forEach((child) => {
          if (child === lastDt) {
            passedLastDt = true;
          } else if (child.tagName === 'A' && passedLastDt) {
            const a = child as HTMLAnchorElement;
            const href = a.getAttribute('href');
            const title = a.textContent?.trim() || `第${chapters.length + 1}章`;
            if (href && !href.startsWith('javascript:')) {
              const fullUrl = href.startsWith('http') ? href : new URL(href, novel.detailUrl).href;
              if (!seenUrls.has(fullUrl) && (fullUrl.endsWith('.html') || fullUrl.includes('/du/'))) {
                seenUrls.add(fullUrl);
                chapters.push({
                  number: chapters.length + 1,
                  title,
                  url: fullUrl
                });
              }
            }
          }
        });
      }
    }

    // 如果上面那种方式没抓到（可能结构变了），用兜底方案喵
    if (chapters.length === 0) {
      const chapterLinks = doc.querySelectorAll('#list a, .chapter-list a, .section-list a, #chapterlist li a, .read-section-list a');
      chapterLinks.forEach((a, index) => {
        const href = a.getAttribute('href');
        const title = a.textContent?.trim() || `第${index + 1}章`;
        
        if (href && !href.startsWith('javascript:')) {
          const fullUrl = href.startsWith('http') ? href : new URL(href, novel.detailUrl).href;
          if (!seenUrls.has(fullUrl) && (fullUrl.endsWith('.html') || fullUrl.includes('/du/'))) {
            seenUrls.add(fullUrl);
            chapters.push({
              number: chapters.length + 1,
              title,
              url: fullUrl
            });
          }
        }
      });
    }
    
    if (chapters.length === 0) {
      throw new Error("未找到章节列表喵~ 可能是该站结构已改变喵~");
    }

    return { ...novel, chapters };
  },
  getChapterContent: async (chapter: Chapter): Promise<string> => {
    console.log(`[Dingdian] Getting content for: ${chapter.title}喵~`);
    
    const fetchPageContent = async (url: string) => {
      let html = "";
      try {
        // 尝试普通 fetch，探测编码喵
        html = await fetchText(url, undefined, 'utf-8');
        if (html.includes("charset=gb") || html.includes("charset=\"gb") || html.includes('琚')) {
          html = await fetchText(url, undefined, 'gb18030');
        }
        
        // 如果内容太短，可能是被拦截了喵
        if (html.length < 500 || !html.includes("id=\"content\"")) {
          throw new Error("Content too short, maybe blocked喵~");
        }
      } catch (e) {
        console.warn(`[Dingdian] fetchText failed for ${url}, trying browser fallback喵~`);
        try {
          const browserDetailsUrl = `/api/browser-details?url=${encodeURIComponent(url)}`;
          const response = await fetch(browserDetailsUrl);
          const data = await response.json();
          if (data.success) {
            html = data.html;
          }
        } catch (err) {
          console.error(`[Dingdian] Browser fallback failed for ${url}喵~`, err);
        }
      }

      if (!html) return { text: "", nextUrl: null };
      
      const doc = parseHTML(html);
      const contentEl = doc.querySelector('#content') || doc.querySelector('.content') || doc.querySelector('#chaptercontent') || doc.querySelector('.read-content');
      if (!contentEl) return { text: "", nextUrl: null };
      
      // 清理广告喵
      contentEl.querySelectorAll('script, style, ins, .ads, .breadcrumb, a, .read-author-say, #center_tip').forEach(el => el.remove());
      
      let text = contentEl.innerHTML
        .replace(/<br\s*\/?>/gi, '\n')
        .replace(/<p[^>]*>/gi, '')
        .replace(/<\/p>/gi, '\n')
        .replace(/&nbsp;/g, ' ')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&amp;/g, '&');
        
      const cleanText = text.replace(/<[^>]+>/g, '').trim();
      
      // 检查是否有下一页（分页章节）喵~
      let nextUrl = null;
      const nextLink = Array.from(doc.querySelectorAll('a')).find(a => 
        (a.textContent?.includes('下一页') || a.textContent?.includes('下一页继续阅读')) && 
        !a.textContent?.includes('下一章')
      );
      
      if (nextLink) {
        const href = nextLink.getAttribute('href');
        if (href && !href.includes('index.html') && !href.startsWith('javascript:')) {
          const fullNextUrl = new URL(href, url).href;
          // 顶点分页通常是 _2.html，或者包含 next 喵
          if (fullNextUrl !== url && (fullNextUrl.includes('_') || fullNextUrl.length > url.length)) {
            nextUrl = fullNextUrl;
          }
        }
      }
      
      return { text: cleanText, nextUrl };
    };
    
    let allContent = "";
    let currentUrl = chapter.url!;
    let pageCount = 0;
    const maxPages = 5; // 防止死循环喵~
    
    while (currentUrl && pageCount < maxPages) {
      try {
        const { text, nextUrl } = await fetchPageContent(currentUrl);
        if (text) {
          allContent += text + "\n";
          currentUrl = nextUrl || "";
          pageCount++;
          if (nextUrl) await new Promise(r => setTimeout(r, 1000)); // 顶点抓取分页要慢一点喵~
        } else {
          break;
        }
      } catch (e) {
        console.error(`[Dingdian] Failed to fetch page ${pageCount + 1} for ${chapter.title}喵~`, e);
        break;
      }
    }
    
    const lines = allContent.split('\n');
    const finalLines = lines
      .map(line => line.trim())
      .filter(l => {
        if (l.length === 0) return false;
        const junkKeywords = [
          '顶点小说', '23ddw', 'www.', '目录', '上一页', '下一页', '尾页', '首页', 
          'Top', '返回目录', '获取失败', '推荐本书', '举报错误'
        ];
        return !junkKeywords.some(kw => l.includes(kw));
      });
      
    return finalLines.join('\n\n');
  }
};

/**
 * 顶点站 HTTP 直搜（比浏览器搜索快，作为首选方案）喵~
 */
const directDingdianSearch = async (keyword: string): Promise<Novel[]> => {
  try {
    // 顶点搜索URL格式喵~ (更新为新接口 /searchsss/)
    const searchUrl = `https://www.23ddw.net/searchsss/?searchkey=${encodeURIComponent(keyword)}`;
    console.log(`[Dingdian] Searching with URL: ${searchUrl}喵~`);
    
    // 使用代理获取搜索页面喵 (编码改为 utf-8)
    const html = await fetchText(searchUrl, undefined, 'utf-8');
    
    if (!html || html.length < 500) {
      console.warn(`[Dingdian] Page content suspicious, length: ${html?.length}喵~`);
      throw new Error('搜索页面内容过少或获取失败喵~');
    }
    
    // 检查是否包含关键字，防止拿到的是空搜索结果页喵
    if (!html.includes('searchkey') && !html.includes(keyword) && !html.includes('item')) {
      console.warn(`[Dingdian] Page content may not be a search result page喵~`);
    }

    const doc = parseHTML(html);
    
    // 多种选择器策略喵~
    const results: Novel[] = [];
    const seenUrls = new Set<string>();
    
    // 策略1: 标准搜索结果（.item 选择器）
    const items = doc.querySelectorAll('.item');
    console.log(`[Dingdian] Found ${items.length} .item elements喵~`);

    items.forEach((item, index) => {
      try {
        // 适配新结构: .item -> dl -> dt -> a (标题)
        const titleLink = item.querySelector('dl dt a') || item.querySelector('dt a') || item.querySelector('.image a');
        
        // 作者提取逻辑优化喵~
        const authorEl = item.querySelector('dt span') || item.querySelector('.btm') || item.querySelector('dd span');
        const coverEl = item.querySelector('img');
        const descEl = item.querySelector('dd');
        
        if (titleLink && titleLink.textContent) {
          const title = titleLink.textContent.trim();
          // 详情页链接处理
          const href = titleLink.getAttribute('href') || '';
          const detailUrl = href.startsWith('http') ? href : new URL(href, DINGDIAN_URL).href;
          
          // 提取作者：优化后的逻辑喵
          let author = '未知';
          if (authorEl) {
              const authorText = authorEl.textContent?.trim() || '';
              // 过滤掉 "作者：" 前缀喵
              author = authorText.replace(/作者[：:]\s*/, '').split(/\s+/)[0] || '未知';
              
              const authorLink = authorEl.querySelector('a');
              if (authorLink) {
                  author = authorLink.textContent?.trim() || author;
              }
          }

          if (!seenUrls.has(detailUrl) && isRelevant(title, author, keyword)) {
            seenUrls.add(detailUrl);
            
            let coverUrl = coverEl?.getAttribute('data-original') || coverEl?.getAttribute('src') || '';
            if (coverUrl) {
              if (!coverUrl.startsWith('http')) {
                coverUrl = new URL(coverUrl, DINGDIAN_URL).href;
              }
              coverUrl = proxifyImage(coverUrl);
            }
            results.push({
              id: detailUrl,
              title,
              author,
              coverUrl: coverUrl,
              description: descEl?.textContent?.trim() || '',
              tags: [],
              status: 'Unknown',
              chapters: [],
              sourceName: '顶点小说网',
              detailUrl
            });
          }
        }
      } catch (e) {
        console.warn(`[Dingdian] Error parsing item ${index}:`, e);
      }
    });
    
    // 策略2: 列表页结果（dl dt dd 结构）
    const dtElements = doc.querySelectorAll('dt');
    dtElements.forEach(dt => {
      const link = dt.querySelector('a');
      if (link && link.textContent && !link.textContent.includes('最新')) {
        const title = link.textContent.trim();
        const href = link.getAttribute('href') || '';
        const detailUrl = href.startsWith('http') ? href : new URL(href, DINGDIAN_URL).href;
        
        if (!seenUrls.has(detailUrl) && isRelevant(title, '', keyword)) {
          seenUrls.add(detailUrl);
          
          // 尝试从相邻元素获取作者信息喵
          let author = '未知';
          const nextSibling = dt.nextElementSibling;
          if (nextSibling && nextSibling.tagName === 'DD') {
            const authorMatch = nextSibling.textContent?.match(/作者[：:]([^\s]+)/);
            if (authorMatch) author = authorMatch[1].trim();
          }
          
          results.push({
            id: detailUrl,
            title,
            author,
            coverUrl: '',
            description: '',
            tags: [],
            status: 'Unknown',
            chapters: [],
            sourceName: '顶点小说网',
            detailUrl
          });
        }
      }
    });
    
    // 策略3: 通用链接检测（备用方案）
    if (results.length === 0) {
      const allLinks = doc.querySelectorAll('a');
      allLinks.forEach(link => {
        const title = link.textContent?.trim();
        const href = link.getAttribute('href') || '';
        if (title && title.length > 2 && title.length < 50 && 
            !title.includes('首页') && !title.includes('顶点') &&
            href.includes('/book/')) {
          const detailUrl = href.startsWith('http') ? href : new URL(href, DINGDIAN_URL).href;
          
          if (!seenUrls.has(detailUrl) && isRelevant(title, '', keyword)) {
            seenUrls.add(detailUrl);
            
            results.push({
              id: detailUrl,
              title,
              author: '未知',
              coverUrl: '',
              description: '',
              tags: [],
              status: 'Unknown',
              chapters: [],
              sourceName: '顶点小说网',
              detailUrl
            });
          }
        }
      });
    }
    
    return results;
    
  } catch (error) {
    console.warn('[Dingdian] Direct search failed喵~', error);
    return [];
  }
};
