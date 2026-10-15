/**
 * WANBENGE 书源喵~
 */
import type { Novel, Chapter } from '../../../types';
import type { SourceProvider } from '../shared/types';
import { WANBENGE_URL } from '../shared/constants';
import { parseHTML } from '../shared/dom';
import { fetchText, proxifyImage } from '../shared/fetcher';
import { isRelevant } from '../shared/relevance';

export const wanbengeProvider: SourceProvider = {
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
              
              const coverUrlRaw = doc.querySelector('.img-thumbnail')?.getAttribute('src') || 
                          doc.querySelector('.bookimg img')?.getAttribute('src') || "";
              let coverUrl = coverUrlRaw;
              if (coverUrl) {
                if (!coverUrl.startsWith('http')) {
                  coverUrl = `${WANBENGE_URL}${coverUrl.startsWith('/') ? '' : '/'}${coverUrl}`;
                }
                coverUrl = proxifyImage(coverUrl);
              }
              
              results.push({
                id: detailUrl || title,
                title: title,
                author: doc.querySelector('.booktag a[title^="作者："]')?.textContent?.trim() || 
                        doc.querySelector('.author')?.textContent?.trim() || "未知",
                description: doc.querySelector('#bookIntro')?.textContent?.trim() || 
                             doc.querySelector('.bookintro')?.textContent?.trim() || "",
                coverUrl: coverUrl,
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
                          const imgEl = el.querySelector('img');
                          const coverSrc = imgEl?.getAttribute('src') || '';
                          let coverUrl = '';
                          if (coverSrc) {
                            coverUrl = coverSrc.startsWith('http') ? coverSrc : `${WANBENGE_URL}${coverSrc.startsWith('/') ? '' : '/'}${coverSrc}`;
                            coverUrl = proxifyImage(coverUrl);
                          }
                          
                          results.push({
                              id: detailUrl,
                              title: title,
                              detailUrl: detailUrl,
                              author: author,
                              coverUrl: coverUrl,
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

    try {
      const getUrl = `${WANBENGE_URL}/modules/article/search.php?searchkey=${encodeURIComponent(keyword)}`;
      const getHtml = await fetchText(getUrl, undefined, 'gb18030');
      novels = parseWanbengeHTML(getHtml, keyword);
    } catch (e) {
      console.warn("[Wanbenge] Same-origin proxy search failed", e);
    }

    if (novels.length === 0) {
      try {
        const postTarget = `${WANBENGE_URL}/modules/article/search.php`;
        const postData = `searchkey=${encodeURIComponent(keyword)}`;
        const postHtml = await fetchText(postTarget, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
          },
          body: postData
        }, 'gb18030');
        novels = parseWanbengeHTML(postHtml, keyword);
      } catch (e) {
        console.warn("[Wanbenge] Same-origin proxy POST search failed", e);
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
    return novels.filter(n => isRelevant(n.title, n.author, keyword));
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
    // 完本阁常见的内容容器 ID 喵~
    const cDiv = doc.querySelector('#content') || 
                 doc.querySelector('#rtext') || 
                 doc.querySelector('.content') || 
                 doc.querySelector('.showtxt') ||
                 doc.querySelector('#bookText');
    
    if (!cDiv) {
        console.error(`[Wanbenge] Content not found for ${chapter.url}. Page title: ${doc.querySelector('title')?.textContent}`);
        throw new Error("Content div not found");
    }

    cDiv.querySelectorAll('p.text-center, a, script, div[style*="display:none"]').forEach(el => el.remove());
    
    // 统一处理所有换行和 HTML 实体喵~
    let text = cDiv.innerHTML
      .replace(/<br\s*\/?>/gi, '\n')
      .replace(/&nbsp;/g, ' ')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&amp;/g, '&');
    
    // 使用单个临时 div 处理所有剩余的 HTML 标签喵~
    const tempDiv = document.createElement('div');
    tempDiv.innerHTML = text;
    const cleanText = tempDiv.textContent || "";
    
    const lines = cleanText.split('\n');
    const finalLines = lines
      .map(l => l.trim())
      .filter(l => {
        if (l.length === 0) return false;
        
        // 过滤掉导航词和垃圾信息喵~
        const junkKeywords = [
          'jizai', '投票推荐', '加入书签', 'search', '完本阁', 'www.', 
          '目录', '上一页', '下一页', '尾页', '首页', 'Top', '返回目录',
          '获取失败', '第阅读记录页', '推荐本书', '举报错误', '本章以完，期待您的下一章'
        ];
        
        // 如果行很短且包含导航词，或者是纯导航词行喵~
        if (l.length < 20) {
          const navTerms = ['目录', '上一页', '下一页', '尾页', '首页', 'Top', '阅读记录'];
          if (navTerms.some(term => l === term || l.includes(` ${term} `) || l.startsWith(`${term} `) || l.endsWith(` ${term}`))) {
            return false;
          }
          // 检查是否是一串导航词喵~
          const words = l.split(/\s+/);
          if (words.length > 1 && words.every(w => navTerms.includes(w) || /^[0-9\-\/]+$/.test(w))) {
            return false;
          }
        }

        return !junkKeywords.some(kw => l.includes(kw));
      });

    return finalLines.join('\n\n');
  }
}
