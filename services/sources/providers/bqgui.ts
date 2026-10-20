/**
 * bqgui 书源喵~
 */
import type { Novel, Chapter } from '../../../types';
import type { SourceProvider } from '../shared/types';
import { BQGUI_URL } from '../shared/constants';
import { parseHTML } from '../shared/dom';
import { fetchText, proxifyImage } from '../shared/fetcher';
import { isRelevant } from '../shared/relevance';
import { cleanChapterLines } from '../shared/textClean';


/**
 * 解析 bqgicq 的 JSON 搜索接口喵~
 *
 * 接口形如 /user/search.html?q= 返回：
 *   [{ url_list, url_img, articlename, author, intro, ... }, ...]
 * 注意：接口在无会话时可能只返回 "1"，解析失败时返回空数组由上层回退。
 */
const parseBqguiJson = (raw: string, keyword: string): Novel[] => {
  let data: unknown;
  try {
    data = JSON.parse(raw);
  } catch {
    return [];
  }
  if (!Array.isArray(data)) return [];

  const results: Novel[] = [];
  data.forEach((entry: any) => {
    const title = String(entry?.articlename || '').trim();
    const href = String(entry?.url_list || '').trim();
    if (!title || !href) return;

    const author = String(entry?.author || '未知').trim();
    if (!isRelevant(title, author, keyword)) return;

    const detailUrl = href.startsWith('http') ? href : `${BQGUI_URL}${href}`;
    const cover = String(entry?.url_img || '').trim();

    results.push({
      id: detailUrl,
      title,
      author,
      description: String(entry?.intro || '').trim(),
      coverUrl: cover ? proxifyImage(cover.startsWith('http') ? cover : `${BQGUI_URL}${cover}`) : '',
      tags: [],
      status: 'Unknown',
      chapters: [],
      sourceName: '笔趣阁(GUI)',
      detailUrl,
    });
  });
  return results;
};

export const bqguiProvider: SourceProvider = {
  key: 'bqgui',
  name: '笔趣阁(GUI)',
  baseUrl: BQGUI_URL,
  search: async (keyword: string): Promise<Novel[]> => {
    console.log(`[Bqgui] Searching for: ${keyword}喵~`);
    
    // 1. 走站点自己的 JSON 搜索接口喵~
    //    /s?q= 只是骨架页，结果由 loadmore() 用 $.getJSON 异步拉取，
    //    所以必须直接请求 /user/search.html，否则拿到的永远是"加载中……"。
    //    接口格式：[{ url_list, url_img, articlename, author, intro }, ...]
    try {
        const apiUrl = `${BQGUI_URL}/user/search.html?q=${encodeURIComponent(keyword)}`;
        const referer = `${BQGUI_URL}/s?q=${encodeURIComponent(keyword)}`;

        let results: Novel[] = [];
        try {
            // 注意：不要带 X-Requested-With —— 自定义头会触发 CORS preflight，
            // 而 /api/proxy 的转发只发 GET，preflight 拿不到允许头就会失败喵~
            const raw = await fetchText(apiUrl, {
                headers: { Referer: referer },
            });
            results = parseBqguiJson(raw, keyword);
        } catch (jsonError) {
            console.warn('[Bqgui] JSON search endpoint failed, falling back to page scrape喵~', jsonError);
        }

        if (results.length > 0) return results;

        // 2. 回退：抓 /s?q= 页面本身（站点若改回服务端渲染仍能命中）喵~
        const searchUrl = `${BQGUI_URL}/s?q=${encodeURIComponent(keyword)}`;
        // 笔趣阁可能返回 302 跳转到详情页，或者返回搜索列表
        // 我们的 fetchText 会自动跟随重定向
        const html = await fetchText(searchUrl);
        const doc = parseHTML(html);
        // 检查是否直接跳转到了详情页 (笔趣阁特性)
        const metaOgType = doc.querySelector('meta[property="og:type"]')?.getAttribute('content');
        if (metaOgType === 'novel') {
             // 是详情页喵！
             const title = doc.querySelector('meta[property="og:title"]')?.getAttribute('content') || 
                           doc.querySelector('h1')?.textContent?.trim() || "";
             const author = doc.querySelector('meta[property="og:novel:author"]')?.getAttribute('content') || "未知";
             const description = doc.querySelector('meta[property="og:description"]')?.getAttribute('content') || "";
             const coverUrl = doc.querySelector('meta[property="og:image"]')?.getAttribute('content') || "";
             const detailUrl = doc.querySelector('meta[property="og:url"]')?.getAttribute('content') || searchUrl; // 使用最终URL

             if (title && isRelevant(title, author, keyword)) {
                 results.push({
                     id: detailUrl,
                     title,
                     author,
                     description,
                     coverUrl: proxifyImage(coverUrl), // 使用代理处理封面
                     tags: [],
                     status: 'Unknown',
                     chapters: [],
                     sourceName: '笔趣阁(GUI)',
                     detailUrl
                 });
             }
        } else {
            // 是搜索列表页喵
            const items = doc.querySelectorAll('.bookbox');
            
            if (items.length > 0) {
                console.log(`[Bqgui] Found ${items.length} items via direct fetch喵~`);
                items.forEach(item => {
                    const link = item.querySelector('.bookname a') as HTMLAnchorElement;
                    if (link) {
                        const title = link.textContent?.trim() || '';
                        const author = item.querySelector('.author')?.textContent?.replace('作者：', '').trim() || '未知';
                        const img = item.querySelector('.bookimg img') as HTMLImageElement;
                        const coverUrl = img ? (img.src || img.getAttribute('src') || '') : '';
                        
                        // 尝试从 .update 或 .intro 或 .uptime 提取简介
                        let description = item.querySelector('.update')?.textContent?.replace('简介：', '').trim() || 
                                          item.querySelector('.intro')?.textContent?.replace('简介：', '').trim() || 
                                          item.querySelector('.uptime')?.textContent?.replace('简介：', '').trim() || '';
                        
                        const href = link.getAttribute('href');
                        const detailUrl = href ? (href.startsWith('http') ? href : `${BQGUI_URL}${href}`) : '';
    
                        if (detailUrl && !results.some(n => n.detailUrl === detailUrl)) {
                            results.push({
                                id: detailUrl,
                                title, 
                                detailUrl, 
                                author, 
                                description, 
                                coverUrl: proxifyImage(coverUrl), // 代理处理封面
                                tags: [],
                                status: 'Unknown',
                                chapters: [],
                                sourceName: '笔趣阁(GUI)'
                            });
                        }
                    }
                });
            }
        }
        
        if (results.length > 0) return results;

    } catch (directError) {
        console.warn("[Bqgui] Direct fetch failed, trying API fallback喵~", directError);
    }

    // 2. 如果直接搜索失败，尝试浏览器 API (Vercel 上会失败，作为本地回退)
    try {
        const browserSearchUrl = `/api/browser-search?site=bqgui&keyword=${encodeURIComponent(keyword)}`;
        const response = await fetch(browserSearchUrl, { 
          signal: AbortSignal.timeout(15000) // 减少超时时间
        });
        const data = await response.json();
        
        if (data.success && data.results) {
          return data.results.map((item: any) => ({
            id: item.detailUrl,
            title: item.title,
            author: item.author || '未知',
            coverUrl: proxifyImage(item.coverUrl || ''),
            description: item.description || '',
            tags: [],
            status: 'Unknown',
            chapters: [],
            sourceName: '笔趣阁(GUI)',
            detailUrl: item.detailUrl
          }));
        }
    } catch (e) {
        console.warn("Bqgui browser search failed喵~", e);
    }
    return [];
  },
  getDetails: async (novel: Novel): Promise<Novel> => {
    console.log(`[Bqgui] Getting details for: ${novel.title}喵~`);
    let html = "";
    
    // 优先尝试直接 fetch，速度更快喵~
    try {
       html = await fetchText(novel.detailUrl);
       // 简单的反爬检查
       if (html.length < 500 || html.includes('正在进行安全检查') || html.includes('Just a moment') || html.includes('验证')) {
           throw new Error("Possible anti-bot check");
       }
       console.log(`[Bqgui] Direct fetch successful (${html.length} chars)喵~`);
    } catch (e) {
       console.log(`[Bqgui] Direct fetch failed or blocked, falling back to browser API喵~`);
       try {
           const browserDetailsUrl = `/api/browser-details?url=${encodeURIComponent(novel.detailUrl)}`;
           const response = await fetch(browserDetailsUrl);
           const data = await response.json();
           if (data.success && data.html) {
             html = data.html;
           } else {
             throw new Error("Browser fallback failed喵~");
           }
       } catch (err) {
           console.error("[Bqgui] Browser details also failed喵~", err);
           throw new Error("无法获取小说详情喵~");
       }
    }

    const doc = parseHTML(html);
    
    // Title
    const titleEl = doc.querySelector('.bookname h1') || doc.querySelector('h1');
    if (titleEl) novel.title = titleEl.textContent?.trim() || novel.title;
    
    // Author
    const authorEl = doc.querySelector('.author') || doc.querySelector('.bookname .author') || Array.from(doc.querySelectorAll('p, span')).find(el => el.textContent?.includes('作者：'));
    if (authorEl) novel.author = authorEl.textContent?.replace('作者：', '').trim() || novel.author;
    
    // Cover
    const coverImg = doc.querySelector('.bookimg img') || doc.querySelector('#fmimg img');
    if (coverImg) {
        const src = coverImg.getAttribute('src');
        if (src) {
          let coverUrl = src.startsWith('http') ? src : new URL(src, novel.detailUrl).href;
          novel.coverUrl = proxifyImage(coverUrl);
        }
    }
    
    // 提取简介
    const descEl = doc.querySelector('.intro') || doc.querySelector('.bookintro') || doc.querySelector('#intro');
    if (descEl) novel.description = descEl.textContent?.trim() || novel.description;
    
    // Chapters
    const chapters: Chapter[] = [];
    const seenUrls = new Set<string>();
    
    // Try multiple selectors for chapter list
    const listContainers = doc.querySelectorAll('#list dl, .listmain dl, .chapter-list');
    console.log(`[Bqgui] Found ${listContainers.length} list containers喵~`);
    let foundChapters = false;

    listContainers.forEach((container, idx) => {
        if (foundChapters) return;
        const links = container.querySelectorAll('dd a, dt a');
        console.log(`[Bqgui] Container ${idx} has ${links.length} links喵~`);
        
        if (links.length > 0) {
            links.forEach((a, index) => {
                const href = a.getAttribute('href');
                const title = a.textContent?.trim() || `第${index + 1}章`;
                if (href && !href.startsWith('javascript:')) {
                    const fullUrl = href.startsWith('http') ? href : new URL(href, novel.detailUrl).href;
                    if (!seenUrls.has(fullUrl)) {
                        seenUrls.add(fullUrl);
                        chapters.push({
                            number: chapters.length + 1,
                            title,
                            url: fullUrl
                        });
                    }
                }
            });
            if (chapters.length > 0) foundChapters = true;
        }
    });

    // 兜底策略：如果常规容器没找到，尝试全局正则匹配章节链接喵~
    if (chapters.length === 0) {
        console.log("[Bqgui] No chapters in containers, trying global link search喵~");
        const allLinks = doc.querySelectorAll('a');
        const bookIdMatch = novel.detailUrl.match(/\/book\/(\d+)/);
        const bookId = bookIdMatch ? bookIdMatch[1] : null;

        allLinks.forEach(a => {
            const href = a.getAttribute('href');
            const title = a.textContent?.trim();
            
            // 匹配规则：必须是 .html 结尾，且不是 index.html
            // 如果能提取到 bookId，则链接必须包含 bookId
            if (href && href.endsWith('.html') && !href.endsWith('index.html') && title) {
                let isChapter = false;
                
                if (bookId && href.includes(bookId)) {
                    isChapter = true;
                } else if (href.match(/\/\d+\/\d+\.html$/)) {
                    // 通用格式 /123/456.html
                    isChapter = true;
                }

                if (isChapter) {
                    const fullUrl = href.startsWith('http') ? href : new URL(href, novel.detailUrl).href;
                    if (!seenUrls.has(fullUrl)) {
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

    if (chapters.length === 0) throw new Error("未找到章节列表喵~");
    
    // 调整章节顺序：检查是否是倒序（最后一章是第1章）
    // 如果标题包含"第"且后面的数字越来越小，就反转数组
    const firstTitle = chapters[0]?.title || '';
    const lastTitle = chapters[chapters.length - 1]?.title || '';
    
    const getChapterNumber = (title: string): number => {
      const match = title.match(/第(\d+)/);
      return match ? parseInt(match[1]) : 0;
    };
    
    const firstNum = getChapterNumber(firstTitle);
    const lastNum = getChapterNumber(lastTitle);
    
    if (firstNum > lastNum && firstNum > 0 && lastNum > 0) {
      chapters.reverse();
      // 重新编号
      chapters.forEach((chapter, index) => {
        chapter.number = index + 1;
      });
    }
    
    return { ...novel, chapters };
  },
  getChapterContent: async (chapter: Chapter): Promise<string> => {
     console.log(`[Bqgui] Getting content for: ${chapter.title}喵~`);

     const parseContent = (html: string): string | null => {
         const doc = parseHTML(html);
         // 笔趣阁的内容可能在 #chaptercontent 或 #content 中
         const contentEl = doc.querySelector('#chaptercontent') || doc.querySelector('#content') || doc.querySelector('.content') || doc.querySelector('.read-content');
         
         if (contentEl) {
             // Cleanup
             contentEl.querySelectorAll('script, style, div[style*="display:none"], .ads').forEach(el => el.remove());
             
             let text = contentEl.innerHTML
                .replace(/<br\s*\/?>/gi, '\n')
                .replace(/&nbsp;/g, ' ');
             
             const tempDiv = document.createElement('div');
             tempDiv.innerHTML = text;
             let cleanText = tempDiv.textContent?.trim() || "";

             // 如果内容为空，尝试直接从 body 获取（针对某些反爬情况）
             if (!cleanText) {
                const bodyText = doc.body.textContent || "";
                // 尝试截取“上一章”和“下一章”之间的内容
                const startMarker = "上一章";
                const endMarker = "下一章";
                const startIndex = bodyText.indexOf(startMarker);
                const endIndex = bodyText.lastIndexOf(endMarker);
                
                if (startIndex !== -1 && endIndex !== -1 && endIndex > startIndex) {
                    cleanText = bodyText.substring(startIndex + startMarker.length, endIndex).trim();
                    // 进一步清理可能包含的导航文字
                    cleanText = cleanText.replace(/目录|加入书签|投票推荐/g, '').trim();
                }
             }
             
            // 清掉导航残留（← → 之类的装饰行）喵~
            return cleanChapterLines(cleanText.split('\n')).join('\n\n').trim();
         }
         return null;
     };

     // 1. 优先尝试直接 fetch 喵~
     try {
         const html = await fetchText(chapter.url!);
         if (html && html.length > 500 && !html.includes('正在进行安全检查') && !html.includes('Just a moment')) {
             const content = parseContent(html);
             if (content) {
                 console.log(`[Bqgui] Direct content fetch successful喵~`);
                 return content;
             }
         }
     } catch (e) {
         console.warn("[Bqgui] Direct content fetch failed, fallback to browser", e);
     }

     // 2. Use browser details API to fetch content HTML (since it waits for selectors)
     try {
         const browserDetailsUrl = `/api/browser-details?url=${encodeURIComponent(chapter.url!)}`;
         const response = await fetch(browserDetailsUrl);
         const data = await response.json();
         
         if (data.success && data.html) {
             const content = parseContent(data.html);
             if (content) return content;
         }
     } catch (e) {
         console.error("[Bqgui] Content fetch failed", e);
     }
     throw new Error("获取章节内容失败喵~");
  }
};

// xpxsProvider removed - xpxs.net domain is for sale
// [DELETED ~400 lines of xpxs provider code]
