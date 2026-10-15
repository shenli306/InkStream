/**
 * 书库阁书源喵~
 */
import type { Novel, Chapter } from '../../../types';
import type { SourceProvider } from '../shared/types';
import { SHUKUGE_URL } from '../shared/constants';
import { parseHTML } from '../shared/dom';
import { fetchText, proxifyImage } from '../shared/fetcher';
import { isRelevant } from '../shared/relevance';

const cleanShukugeTitle = (title: string) => {
  return (title || '')
    .replace(/[（(]\s*txt\s*全集\s*[)）]/ig, '')
    .replace(/\s*(txt\s*全集|TXT\s*全集|TXT全集|全集TXT|全集\s*txt|txt\s*下载|TXT\s*下载|全集\s*下载)\s*$/ig, '')
    .trim();
};

export const shukugeProvider: SourceProvider = {
  key: 'shukuge',
  name: '书库阁',
  baseUrl: SHUKUGE_URL,
  search: async (keyword: string): Promise<Novel[]> => {
    console.log(`[Shukuge] Searching for: ${keyword}喵~`);
    let results: Novel[] = [];
    
    const searchUrl = `${SHUKUGE_URL}/Search?wd=${encodeURIComponent(keyword)}`;
    
    try {
      const html = await fetchText(searchUrl);
      const doc = parseHTML(html);
      
      // 搜索结果通常在 .listitem 标签中
      const items = doc.querySelectorAll('.listitem');
      
      items.forEach(item => {
        const titleEl = item.querySelector('h2 a') as HTMLAnchorElement;
        if (!titleEl) return;
        
        const title = cleanShukugeTitle(titleEl.textContent?.trim() || "");
        const href = titleEl.getAttribute('href') || "";
        const authorMatch = item.querySelector('.bookdesc')?.textContent?.match(/作者：(.*?)(?=\s|分类|$)/);
        const author = authorMatch ? authorMatch[1].trim() : "未知";
        
        const imgEl = item.querySelector('img');
        let coverUrl = imgEl?.getAttribute('src') || "";
        if (coverUrl && !coverUrl.startsWith('http')) {
          coverUrl = `${SHUKUGE_URL}${coverUrl}`;
        }
        
        // 解决 HTTPS 下无法加载 HTTP 图片的问题 喵~
        coverUrl = proxifyImage(coverUrl);
        
        // 优化简介提取逻辑
        let description = "";
        const descNodes = item.querySelectorAll('.bookdesc .desc');
        let descEl: Element | null = null;
        if (descNodes.length > 0) {
          descEl = descNodes[descNodes.length - 1];
        } else {
          descEl = item.querySelector('.bookdesc') || item.querySelector('.desc');
        }

        if (descEl) {
          const text = (descEl.textContent || "").trim();
          if (text && !text.includes('热搜小说：')) {
            if (text.includes('简介：')) {
              description = text.split('简介：')[1].trim();
            } else if (text.includes('简介:')) {
              description = text.split('简介:')[1].trim();
            } else {
              description = text.replace(/作者：.*分类：.*/, '').trim();
            }
          }
        }
        
        if (isRelevant(title, author, keyword)) {
          results.push({
            id: href,
            title,
            author,
            coverUrl,
            description,
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
          const title = cleanShukugeTitle(link.textContent?.trim() || "");
          if (title && isRelevant(title, "未知", keyword)) {
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
    } catch (e) {
      console.warn(`[Shukuge] Direct fetch failed: ${e}喵~`);
    }

    // Fallback to browser search
    if (results.length === 0) {
      try {
        const browserSearchUrl = `/api/browser-search?site=shukuge&keyword=${encodeURIComponent(keyword)}`;
        const response = await fetch(browserSearchUrl);
        const data = await response.json();
        if (data.success && data.results) {
          results = data.results.map((item: any) => ({
            id: item.detailUrl,
            title: item.title,
            author: item.author || '未知',
            coverUrl: item.coverUrl || '',
            description: item.description || '',
            tags: [],
            status: 'Unknown',
            chapters: [],
            sourceName: '书库阁',
            detailUrl: item.detailUrl
          }));
        }
      } catch (e) {
        console.warn("Shukuge browser search fallback failed", e);
      }
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
    if (titleEl) novel.title = cleanShukugeTitle(titleEl.textContent?.trim() || novel.title);
    
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
      let src = coverImg.getAttribute('src');
      if (src) {
        src = src.startsWith('http') ? src : `${SHUKUGE_URL}${src}`;
        novel.coverUrl = proxifyImage(src);
      }
    }

    // 提取简介
    const descEl = detailDoc.querySelector('.bookintro') || detailDoc.querySelector('.intro') || 
                   Array.from(detailDoc.querySelectorAll('p')).find(p => p.textContent?.length > 50 && !p.textContent?.includes('热搜小说：'));
    
    if (descEl) {
      const text = descEl.textContent?.trim() || "";
      if (text && !text.includes('热搜小说：')) {
        novel.description = text;
      }
    }

    const chapters: Chapter[] = [];
    const seenUrls = new Set<string>();

    // 尝试直接从详情页提取章节，减少一次请求喵~
    let links = detailDoc.querySelectorAll('a[href*=".html"]');
    // 如果详情页链接太少（可能是推荐位），或者明确没有目录结构，再请求目录页
    const listContainer = detailDoc.querySelector('#list') || detailDoc.querySelector('.listmain');
    
    if (links.length < 20 && !listContainer) {
       console.log(`[Shukuge] Chapters not sufficient in detail page, fetching from: ${indexUrl}喵~`);
       try {
         const indexHtml = await fetchText(indexUrl);
         const indexDoc = parseHTML(indexHtml);
         links = indexDoc.querySelectorAll('a[href*=".html"]');
       } catch (e) {
         console.warn(`[Shukuge] Failed to fetch chapter list from ${indexUrl}喵~`, e);
         // 如果失败了，就只能用详情页的了
       }
    } else {
       console.log(`[Shukuge] Found chapters directly in detail page, skipping extra request喵~`);
    }
    
    // 提取章节
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
    const html = await fetchText(chapter.url);
    const doc = parseHTML(html);
    const contentEl = doc.querySelector('#content');
    if (!contentEl) throw new Error("未找到章节内容喵~");
    
    // 清理广告
    contentEl.querySelectorAll('script, a, div[style*="display:none"]').forEach(el => el.remove());
    
    let text = contentEl.innerHTML
      .replace(/<br\s*\/?>/gi, '\n')
      .replace(/&nbsp;/g, ' ')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&amp;/g, '&');
      
    const tempDiv = document.createElement('div');
    tempDiv.innerHTML = text;
    
    const cleanText = tempDiv.textContent || "";
    const lines = cleanText.split('\n');
    
    const finalLines = lines
      .map(line => line.trim())
      .filter(l => {
        if (l.length === 0) return false;
        
        const junkKeywords = [
          '书库阁', 'www.', '目录', '上一页', '下一页', '尾页', '首页', 
          'Top', '返回目录', '获取失败', '第阅读记录页', '推荐本书', '举报错误'
        ];
        
        if (l.length < 20) {
          const navTerms = ['目录', '上一页', '下一页', '尾页', '首页', 'Top', '阅读记录'];
          if (navTerms.some(term => l === term || l.includes(` ${term} `) || l.startsWith(`${term} `) || l.endsWith(` ${term}`))) {
            return false;
          }
          const words = l.split(/\s+/);
          if (words.length > 1 && words.every(w => navTerms.includes(w) || /^[0-9\-\/]+$/.test(w))) {
            return false;
          }
        }
        
        return !junkKeywords.some(kw => l.includes(kw));
      });

    return finalLines.join('\n\n');
  }
};
