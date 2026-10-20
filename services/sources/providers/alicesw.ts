/**
 * 爱丽丝书屋书源喵~
 */
import type { Novel, Chapter } from '../../../types';
import type { SourceProvider } from '../shared/types';
import { ALICESW_URL } from '../shared/constants';
import { parseHTML } from '../shared/dom';
import { fetchText, proxifyImage } from '../shared/fetcher';
import { isRelevant } from '../shared/relevance';
import { getCoverCache, saveCoverCache } from '../shared/coverCache';
import { cleanChapterLines } from '../shared/textClean';


export const aliceswProvider: SourceProvider = {
  key: 'alicesw',
  name: '爱丽丝书屋',
  baseUrl: ALICESW_URL,
  search: async (keyword: string): Promise<Novel[]> => {
    console.log(`[AliceSw] Searching for: ${keyword}喵~`);
    const results: Novel[] = [];
    
    const cleanTitle = (title: string) => {
      return title
        // 去掉形如 "1." / "2、" / "3 " 的序号前缀，以及紧跟的《
        .replace(/^\s*\d+\s*[\.\、\:\：\)\]]\s*/, '')
        .replace(/^\s*\d+\s+/, '')
        .replace(/^《\s*/, '')
        // 去掉结尾的 》
        .replace(/\s*》$/, '')
        .trim();
    };
    
    for (let page = 1; page <= 3; page++) {
      try {
        const searchUrl = `${ALICESW_URL}/search?q=${encodeURIComponent(keyword)}&f=_all&sort=relevance&p=${page}&serialize=`;
        console.log(`[AliceSw] Fetching page ${page}: ${searchUrl}喵~`);
        
        const html = await fetchText(searchUrl);
        
        if (!html || html.length < 200) {
          console.log(`[AliceSw] Page ${page} returned empty result, stopping pagination喵~`);
          break;
        }
        
        const doc = parseHTML(html);
        
        // 搜索结果结构：每个结果在 <h4><a href="/novel/xxx.html">标题</a></h4>
        const titleElements = doc.querySelectorAll('h4 a, h3 a, h5 a');
        console.log(`[AliceSw] Page ${page} found ${titleElements.length} title elements喵~`);
        
        titleElements.forEach(el => {
          const href = el.getAttribute('href') || '';
          if (!href.includes('/novel/') && !href.includes('/book/')) return;
          
          const rawTitle = el.textContent?.trim() || '';
          const title = cleanTitle(rawTitle);
          if (!title || title.length < 2) return;
          
          let detailUrl = href.startsWith('http') ? href : `${ALICESW_URL}${href.startsWith('/') ? '' : '/'}${href}`;
          
          if (results.some(r => r.detailUrl === detailUrl)) return;
          
          // 从父容器提取作者和简介
          let author = '未知';
          let description = '';
          let coverUrl = 'https://img.321cdn.com/img/01.png';
          
          // 根据HTML结构提取数据（.list-group-item 结构）
          const listItem = el.closest('.list-group-item');
          if (listItem) {
            // 提取作者
            const authorEl = listItem.querySelector('p.mb-1 a');
            if (authorEl) {
              author = authorEl.textContent?.trim() || '未知';
            }
            
            // 提取简介 - 匹配 class="content-txt" 的段落
            const descEl = listItem.querySelector('p.content-txt');
            if (descEl) {
              const descText = descEl.textContent?.trim() || '';
              if (descText && descText.length > 5 && descText !== '暂无简介') {
                description = descText.substring(0, 200) || '';
              }
            }
            
            // 爱丽丝书屋搜索结果页面没有封面图片
            // 封面需要从详情页获取
          }
          
          if (!isRelevant(title, author, keyword)) return;
          
          results.push({
            id: detailUrl,
            title,
            author,
            description,
            coverUrl: proxifyImage(coverUrl),
            tags: [],
            status: 'Unknown',
            detailUrl,
            chapters: [],
            sourceName: '爱丽丝书屋'
          });
        });
        
        console.log(`[AliceSw] Page ${page} total results so far: ${results.length}喵~`);
        
        // 如果当前页结果少于10条，说明没有更多页了
        if (titleElements.length < 10) {
          console.log(`[AliceSw] Page ${page} has less than 10 results, stopping pagination喵~`);
          break;
        }
      } catch (e) {
        console.warn(`[AliceSw] Page ${page} fetch failed: ${e}喵~`);
        break;
      }
    }
    
    console.log(`[AliceSw] Total search results: ${results.length}喵~`);
    
    // 从本地缓存恢复封面（只恢复/uploads/下的真实封面）喵~
    const coverCache = getCoverCache();
    results.forEach(novel => {
      const cached = coverCache[novel.title];
      if (cached && cached.includes('/uploads/')) {
        novel.coverUrl = cached;
      }
    });
    
    return results;
  },
  getDetails: async (novel: Novel): Promise<Novel> => {
    console.log(`[AliceSw] Getting details for: ${novel.title} from ${novel.detailUrl}喵~`);
    
    let html = '';
    try {
      html = await fetchText(novel.detailUrl);
      console.log(`[AliceSw] HTML length: ${html.length}喵~`);
    } catch (e) {
      console.warn(`[AliceSw] Failed to fetch page: ${e}喵~`);
      throw new Error("获取详情页失败喵~");
    }
    
    const doc = parseHTML(html);
    
    const titleEl = doc.querySelector('.novel_title');
    if (titleEl) novel.title = titleEl.textContent?.trim() || novel.title;
    
    const authorEl = doc.querySelector('.novel_info p a[href*="author"]');
    if (authorEl) novel.author = authorEl.textContent?.trim() || novel.author;
    
    const coverSelectors = [
      '.pic img.lazyload_book_cover',
      '.pic img.fengmian2',
      'img.lazyload_book_cover.fengmian2',
      '.box_intro .pic img',
      '.novel-detail .pic img',
      '.cover-img',
      '.book-cover img',
      '.novel-pic img',
      'img[data-original]',
      'img[data-lazy]',
      'img[data-src]',
      '.content img'
    ];
    
    // 方案五：智能封面评分函数喵~
    const scoreCoverCandidate = (img: HTMLImageElement): number => {
      let score = 0;
      const src = img.getAttribute('src') || img.getAttribute('data-src') || 
                  img.getAttribute('data-original') || img.getAttribute('data-lazy') || '';

      // 父容器 class 特征加分
      let parent = img.parentElement;
      for (let i = 0; i < 4 && parent; i++) {
        const cls = (parent.className || '').toLowerCase();
        if (/cover|fengmian|book-?img|novel-?pic|book-?cover/.test(cls)) { score += 10; break; }
        parent = parent.parentElement;
      }

      // URL 特征加分
      const lowerSrc = src.toLowerCase();
      if (lowerSrc.includes('cover')) score += 8;
      if (lowerSrc.includes('fengmian')) score += 8;
      if (lowerSrc.includes('/uploads/')) score += 5;
      if (/\.(jpg|jpeg|png|webp)/i.test(lowerSrc)) score += 4;

      // 尺寸启发式加分
      const w = parseInt(img.getAttribute('width') || '0');
      const h = parseInt(img.getAttribute('height') || '0');
      if (w > 100 && h > 150) score += 6;

      // 减分项
      if (lowerSrc.includes('icon') || lowerSrc.includes('logo')) score -= 20;
      if (w > 0 && h > 0 && (w < 50 || h < 50)) score -= 15;

      return score;
    };

    // 方案二：放宽的 URL 过滤器（排除法，替代白名单）
    const isValidCoverUrl = (url: string): boolean => {
      if (!url || url.length < 10) return false;
      const lower = url.toLowerCase();
      // 排除明显非封面的 URL
      const exclusions = ['icon', 'logo', 'avatar', 'banner', 'ad.', 'favicon', 'qr-code', '/static/js/', 'pixel', 'tracking'];
      if (exclusions.some(e => lower.includes(e))) return false;
      // 接受：HTTP/HTTPS、相对路径、data:image
      return url.startsWith('http') || url.startsWith('/') || url.startsWith('data:image');
    };

    // 从 img 元素提取候选 URL 列表
    const extractUrls = (img: HTMLImageElement): string[] => {
      return [
        img.getAttribute('data-src') || '',
        img.getAttribute('data-original') || '',
        img.getAttribute('data-lazy') || '',
        img.getAttribute('src') || ''
      ].filter(u => u.length > 0);
    };

    let coverImg: Element | null = null;
    let coverSrc = '';

    // 第一层：固定 CSS 选择器
    for (const selector of coverSelectors) {
      const img = doc.querySelector(selector) as HTMLImageElement | null;
      if (img) {
        const urls = extractUrls(img);
        const valid = urls.find(isValidCoverUrl);
        if (valid) {
          coverImg = img;
          coverSrc = valid;
          console.log(`[AliceSw] Found cover with selector: ${selector} -> ${coverSrc}喵~`);
          break;
        }
        // 选择器命中但 URL 无效，继续尝试下一个
        coverImg = null;
      }
    }

    // 第二层：meta 标签兜底（方案二）
    if (!coverSrc && !coverImg) {
      const ogImage = doc.querySelector('meta[property="og:image"]')?.getAttribute('content') || '';
      const twitterImage = doc.querySelector('meta[name="twitter:image"]')?.getAttribute('content') || '';
      const metaUrl = [ogImage, twitterImage].find(isValidCoverUrl);
      if (metaUrl) {
        coverSrc = metaUrl;
        console.log(`[AliceSw] Found cover via meta tag: ${coverSrc}喵~`);
      }
    }

    // 第三层：智能评分兜底（方案五）
    if (!coverSrc && !coverImg) {
      const allImgs = Array.from(doc.querySelectorAll('img'));
      const scored = allImgs
        .map(img => {
          const urls = extractUrls(img);
          const valid = urls.find(isValidCoverUrl);
          if (!valid) return null;
          return { img, url: valid, score: scoreCoverCandidate(img) };
        })
        .filter((c): c is { img: HTMLImageElement; url: string; score: number } => c !== null && c.score > 0)
        .sort((a, b) => b.score - a.score);

      if (scored.length > 0) {
        coverSrc = scored[0].url;
        coverImg = scored[0].img;
        console.log(`[AliceSw] Found cover via smart scoring: ${coverSrc} (score: ${scored[0].score})喵~`);
      }
    }

    console.log(`[AliceSw] Cover img found: ${coverImg !== null}喵~`);
    if (!coverSrc) {
      console.log(`[AliceSw] All cover sources empty or invalid喵~`);
    }
    
    // 最终降级：默认占位图
    if (coverSrc) {
      if (!coverSrc.startsWith('http') && !coverSrc.startsWith('data:')) {
        coverSrc = 'https://www.alicesw.com' + (coverSrc.startsWith('/') ? coverSrc : '/' + coverSrc);
      }
      novel.coverUrl = proxifyImage(coverSrc);
      saveCoverCache(novel.title, novel.coverUrl);
      console.log(`[AliceSw] Cover saved: ${novel.coverUrl}喵~`);
    } else {
      console.log(`[AliceSw] No valid cover found, using default 01.png喵~`);
      const defaultCover = 'https://img.321cdn.com/img/01.png';
      novel.coverUrl = proxifyImage(defaultCover);
    }
    
    const jianjieEl = doc.querySelector('.jianjie');
    if (jianjieEl) {
      const pEls = jianjieEl.querySelectorAll('p');
      for (const p of pEls) {
        const text = p.textContent?.trim() || '';
        if (text.length > 5 && !text.includes('内容简介') && 
            !text.includes('爱丽丝书屋所有小说中的人物') &&
            !text.includes('如果您对') && text !== '暂无简介') {
          novel.description = text;
          break;
        }
      }
    }
    
    const chapters: Chapter[] = [];
    // 爱丽丝书屋的章节获取 - 优先级最高
    const allLinks = doc.querySelectorAll('a');
    console.log(`[AliceSw] Found ${allLinks.length} total links on page喵~`);
    
    allLinks.forEach((link, index) => {
      const href = link.getAttribute('href');
      const text = link.textContent?.trim() || '';
      if (!href) return;
      
      // 检查是否是章节链接：包含"第"和"章"，或者链接包含/book/和.html
      const isChapter = (text.includes('第') && text.includes('章')) || 
                       (href.includes('/book/') && href.includes('.html') && !href.includes('/novel/'));
      
      if (isChapter) {
        console.log(`[AliceSw] Found potential chapter: "${text}" -> ${href}喵~`);
        const fullUrl = href.startsWith('http') ? href : new URL(href, novel.detailUrl).href;
        if (!chapters.find(c => c.url === fullUrl)) {
          chapters.push({
            number: chapters.length + 1,
            title: text,
            url: fullUrl
          });
        }
      }
    });
    
    console.log(`[AliceSw] After first pass: ${chapters.length} chapters found喵~`);
    
    // 检查是否有"查看所有章节"链接
    const allChaptersLink = Array.from(allLinks).find(link => 
      link.textContent?.trim().includes('查看所有章节') || 
      link.getAttribute('href')?.includes('/other/chapters')
    );
    
    if (allChaptersLink) {
      const allChaptersHref = allChaptersLink.getAttribute('href');
      console.log(`[AliceSw] Found "查看所有章节" link: ${allChaptersHref}喵~`);
      
      if (allChaptersHref) {
        try {
          const allChaptersUrl = allChaptersHref.startsWith('http') 
            ? allChaptersHref 
            : new URL(allChaptersHref, novel.detailUrl).href;
          
          const allChaptersHtml = await fetchText(allChaptersUrl);
          const allChaptersDoc = parseHTML(allChaptersHtml);
          console.log(`[AliceSw] Fetched all chapters page, length: ${allChaptersHtml.length}喵~`);
          
          // 从所有章节页面获取章节
          const allChaptersLinks = allChaptersDoc.querySelectorAll('a');
          const newChapters: Chapter[] = [];
          
          allChaptersLinks.forEach(link => {
            const href = link.getAttribute('href');
            const text = link.textContent?.trim() || '';
            if (!href) return;
            
            const isChapter = (text.includes('第') && text.includes('章')) || 
                             (href.includes('/book/') && href.includes('.html') && !href.includes('/novel/'));
            
            if (isChapter) {
              console.log(`[AliceSw] Found chapter from all-chapters page: "${text}" -> ${href}喵~`);
              const fullUrl = href.startsWith('http') ? href : new URL(href, allChaptersUrl).href;
              if (!newChapters.find(c => c.url === fullUrl)) {
                newChapters.push({
                  number: newChapters.length + 1,
                  title: text,
                  url: fullUrl
                });
              }
            }
          });
          
          if (newChapters.length > 0) {
            console.log(`[AliceSw] Found ${newChapters.length} chapters from all-chapters page, replacing current list喵~`);
            chapters.length = 0; // 清空现有章节
            chapters.push(...newChapters);
          }
        } catch (e) {
          console.error(`[AliceSw] Failed to fetch all chapters page: ${e}喵~`);
        }
      }
    }
    
    // 如果没找到，再尝试其他书源的通用选择器
    if (chapters.length === 0) {
      const chapterLinks = doc.querySelectorAll('[class*="chapter"] a, .catalog a, #list a, .chapterlist a, .list-chapter a');
      chapterLinks.forEach((link, index) => {
        const href = link.getAttribute('href');
        if (!href) return;
        
        const fullUrl = href.startsWith('http') ? href : new URL(href, novel.detailUrl).href;
        const title = link.textContent?.trim() || `第${index + 1}章`;
        
        if (!chapters.find(c => c.url === fullUrl)) {
          chapters.push({
            number: chapters.length + 1,
            title,
            url: fullUrl
          });
        }
      });
    }
    
    if (chapters.length === 0) {
      allLinks.forEach((link, index) => {
        const href = link.getAttribute('href');
        const text = link.textContent?.trim() || '';
        if (!href) return;
        
        const isChapter = text.includes('章') || text.includes('第') || 
                         (href.includes('/chapter/') || href.includes('/read/'));
        if (!isChapter) return;
        
        const fullUrl = href.startsWith('http') ? href : new URL(href, novel.detailUrl).href;
        if (!chapters.find(c => c.url === fullUrl)) {
          chapters.push({
            number: chapters.length + 1,
            title: text,
            url: fullUrl
          });
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
    console.log(`[AliceSw] Getting content for: ${chapter.title}喵~`);
    
    const parseContent = (html: string): string | null => {
      const doc = parseHTML(html);
      const contentEl = doc.querySelector('#j_chapterBox .read-content') ||
                      doc.querySelector('#j_chapterBox .main-text-wrap') ||
                      doc.querySelector('.read-content') ||
                      doc.querySelector('.text-content') ||
                      doc.querySelector('#content') || 
                      doc.querySelector('.content') || 
                      doc.querySelector('article');
      
      if (contentEl) {
        contentEl.querySelectorAll('script, style, ins, .ads, .ad, .advertisement, .bottem1, .bottem2, .bottem3, .bottem, a').forEach(el => el.remove());
        
        let text = contentEl.innerHTML
          .replace(/<br\s*\/?>/gi, '\n')
          .replace(/<p[^>]*>/gi, '')
          .replace(/<\/p>/gi, '\n\n')
          .replace(/&nbsp;/g, ' ')
          .replace(/&lt;/g, '<')
          .replace(/&gt;/g, '>')
          .replace(/&amp;/g, '&');
        
        const tempDiv = document.createElement('div');
        tempDiv.innerHTML = text;
        let cleanText = tempDiv.textContent || "";
        
        const junkKeywords = [
          '爱丽丝书屋', 'alicesw.com', 'www.alicesw.com', 'https://www.alicesw.com',
          '目录', '上一页', '下一页', '尾页', '首页', '返回目录',
          '章节报错', '免登录', '推荐本书', '加入书架', '章节加载中', '加载中...'
        ];
        
        const lines = cleanChapterLines(cleanText.split('\n'))
          .filter(line => {
            if (line.length === 0) return false;
            if (line.length < 20) {
              const navTerms = ['目录', '上一页', '下一页', '尾页', '首页', '返回目录'];
              if (navTerms.some(term => line === term)) return false;
            }
            return !junkKeywords.some(kw => line.includes(kw));
          });
        
        if (lines.length > 0) {
          return lines.join('\n\n');
        }
      }
      return null;
    };
    
    // 1. 优先尝试直接 fetch 喵~
    try {
      const html = await fetchText(chapter.url);
      const isLoadingPage = html.includes('章节加载中') || html.includes('加载中...');
      
      if (!isLoadingPage) {
        const content = parseContent(html);
        if (content) {
          console.log(`[AliceSw] Direct content fetch successful喵~`);
          return content;
        }
      }
    } catch (e) {
      console.warn("[AliceSw] Direct content fetch failed, fallback to browser", e);
    }
    
    // 2. 使用 browser details API 来等待页面加载完成（处理异步内容）
    try {
      const browserDetailsUrl = `/api/browser-details?url=${encodeURIComponent(chapter.url)}`;
      console.log(`[AliceSw] Using browser API to fetch: ${browserDetailsUrl}喵~`);
      const response = await fetch(browserDetailsUrl);
      const data = await response.json();
      
      if (data.success && data.html) {
        const content = parseContent(data.html);
        if (content) {
          console.log(`[AliceSw] Browser API content fetch successful喵~`);
          return content;
        }
      }
    } catch (e) {
      console.error("[AliceSw] Browser API content fetch failed", e);
    }
    
    throw new Error("获取章节内容失败喵~");
  }
};
