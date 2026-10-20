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


const ALICESW_COVER_ORIGIN = 'https://www.alicesw.com';

/**
 * 封面地址归一化喵~
 *
 * 站点同时用两个图床：源站 www.alicesw.com 与 CDN img.321cdn.com。
 * 实测（2026-10）CDN 只镜像了一部分对象：同一个 /uploads/20251224/xxxx.webp
 * 在 CDN 上 404、在源站 200；而 /img/62.webp 这类站点内置图只在 CDN 上有。
 * 所以 /uploads/** 一律指到源站，其余（/img/** 等）保持原样。
 */
const normalizeCoverUrl = (raw: string): string => {
  const m = raw.match(/^https?:\/\/(?:img\.321cdn\.com|(?:www\.)?alicesw\.com)(\/.*)$/i);
  if (m && m[1].startsWith('/uploads/')) return `${ALICESW_COVER_ORIGIN}${m[1]}`;
  return raw;
};

/**
 * 目录里的「第X卷 完）」是分卷标记，不是章节喵~
 *
 * 实测第一~六卷的「完）」全都返回同一张 23554B 的卷末页，当成章节会白抓一遍、
 * 还会被计进灵动岛的失败数（[失败N]），所以解析目录时直接丢掉喵~
 */
const isVolumeMarker = (title: string): boolean => {
  const t = title.replace(/\s+/g, ' ').trim();
  return t.length <= 12 && /^第[一二三四五六七八九十百千0-9]+卷[\s、]*完[）)]?$/.test(t);
};
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
    
    // 搜索页 1~3 并发抓取喵~
    // 串行时每页要一次 RTT（经 /api/proxy 实测每页 1.5~3s），三页累计经常撞上
    // api.ts 里的每源搜索超时，结果整个源的结果被丢掉，所以这里改成并发喵~
    const buildSearchUrl = (page: number) =>
      `${ALICESW_URL}/search?q=${encodeURIComponent(keyword)}&f=_all&sort=relevance&p=${page}&serialize=`;

    const parseSearchPage = (html: string): { items: Novel[]; titleCount: number } => {
      const doc = parseHTML(html);

      // 搜索结果结构：每个结果在 <h4><a href="/novel/xxx.html">标题</a></h4>
      const titleElements = doc.querySelectorAll('h4 a, h3 a, h5 a');
      const items: Novel[] = [];

      titleElements.forEach(el => {
        const href = el.getAttribute('href') || '';
        if (!href.includes('/novel/') && !href.includes('/book/')) return;

        const rawTitle = el.textContent?.trim() || '';
        const title = cleanTitle(rawTitle);
        if (!title || title.length < 2) return;

        let detailUrl = href.startsWith('http') ? href : `${ALICESW_URL}${href.startsWith('/') ? '' : '/'}${href}`;

        if (items.some(r => r.detailUrl === detailUrl)) return;

        // 从父容器提取作者、简介、连载状态、标签
        let author = '未知';
        let description = '';
        // 搜索列表页没有封面（真封面只在详情页 / img.321cdn.com/uploads/ 下），
        // 之前写死的 img/01.png 是站点占位图，会被 isPlaceholderCoverUrl 之外的路径带进 EPUB 喵~
        let coverUrl = '';
        let status: Novel['status'] = 'Unknown';
        let tags: string[] = [];

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

          // 连载状态：<small class="text-muted ms-2">[已完结]</small>
          const stateText = listItem.querySelector('small')?.textContent?.trim() || '';
          if (stateText.includes('完结')) status = 'Completed';
          else if (stateText.includes('连载')) status = 'Serializing';

          // 标签：<a href="/search?q=..&f=tag"><span>#</span><em>斗破</em></a>
          tags = Array.from(listItem.querySelectorAll('a[href*="f=tag"]'))
            .map(tagEl => (tagEl.textContent?.trim() || '').replace(/^#\s*/, '').trim())
            .filter(tag => tag.length > 0 && tag.length < 20)
            .slice(0, 6);

          // 爱丽丝书屋搜索结果页面没有封面图片
          // 封面需要从详情页获取（getDetails 会补上）
        }

        if (!isRelevant(title, author, keyword)) return;

        items.push({
          id: detailUrl,
          title,
          author,
          description,
          coverUrl: coverUrl ? proxifyImage(normalizeCoverUrl(coverUrl)) : undefined,
          tags,
          status,
          detailUrl,
          chapters: [],
          sourceName: '爱丽丝书屋'
        });
      });

      return { items, titleCount: titleElements.length };
    };

    const pageResults = await Promise.all([1, 2, 3].map(async (page) => {
      try {
        const html = await fetchText(buildSearchUrl(page));
        if (!html || html.length < 200) {
          console.log(`[AliceSw] Page ${page} returned empty result喵~`);
          return { page, items: [] as Novel[], more: false };
        }
        const parsed = parseSearchPage(html);
        console.log(`[AliceSw] Page ${page} found ${parsed.titleCount} title elements, ${parsed.items.length} relevant喵~`);
        return { page, items: parsed.items, more: parsed.titleCount >= 10 };
      } catch (err) {
        console.warn(`[AliceSw] Page ${page} fetch failed: ${err}喵~`);
        return { page, items: [] as Novel[], more: false };
      }
    }));

    // 合并顺序与串行版一致：页码小的先入，重复 URL 只留一次；
    // 某一页不足 10 条就不再接收后面的页（与原来的 break 语义相同）喵~
    const seenUrls = new Set<string>();
    for (const pr of pageResults.sort((a, b) => a.page - b.page)) {
      for (const novel of pr.items) {
        if (seenUrls.has(novel.detailUrl)) continue;
        seenUrls.add(novel.detailUrl);
        results.push(novel);
      }
      if (!pr.more) break;
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
      novel.coverUrl = proxifyImage(normalizeCoverUrl(coverSrc));
      saveCoverCache(novel.title, novel.coverUrl);
      console.log(`[AliceSw] Cover saved: ${novel.coverUrl}喵~`);
    } else if (!novel.coverUrl || novel.coverUrl.includes('img/01.png')) {
      // 详情页也没找到封面就保持空值：BookCard 会渲染内置占位，
      // 比塞站点占位图（img/01.png）干净，也避免 EPUB 里带一张广告图喵~
      console.log(`[AliceSw] No valid cover found, leave empty喵~`);
      novel.coverUrl = undefined;
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
      
      if (isChapter && !isVolumeMarker(text)) {
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
          // 目录页首选 ul.mulu_list li a（实测与全部 /book/ 链接数量一致，但不会夹带站内导航）喵~
          const muluLinks = allChaptersDoc.querySelectorAll('ul.mulu_list li a');
          const allChaptersLinks = muluLinks.length > 0 ? muluLinks : allChaptersDoc.querySelectorAll('a');
          const newChapters: Chapter[] = [];
          
          allChaptersLinks.forEach(link => {
            const href = link.getAttribute('href');
            const text = link.textContent?.trim() || '';
            if (!href) return;
            
            const isChapter = (text.includes('第') && text.includes('章')) || 
                             (href.includes('/book/') && href.includes('.html') && !href.includes('/novel/'));
            
            if (isChapter && !isVolumeMarker(text)) {
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
      // 同一章 URL 有两套模板喵~
      // 桌面 UA: #j_chapterBox .read-content；移动 WAP UA: article#chapterContent > section.read-section > div.content_txt
      // （代理出去的 UA 就是浏览器真实 UA，PC 上和手机上会落到不同模板）
      const contentEl = doc.querySelector('#j_chapterBox .read-content') ||
                      doc.querySelector('#j_chapterBox .main-text-wrap') ||
                      doc.querySelector('.read-content') ||
                      doc.querySelector('.read-section.jsChapterWrapper .content_txt') ||
                      doc.querySelector('.read-section .content_txt') ||
                      doc.querySelector('.content_txt') ||
                      doc.querySelector('.text-content') ||
                      doc.querySelector('#content') || 
                      doc.querySelector('.content') || 
                      doc.querySelector('article .read-section') ||
                      doc.querySelector('article');
      
      if (contentEl) {
        // 桌面模板的翻页导航/广告 + 移动 WAP 模板的加载器、页顶页脚与 #user_ad 广告位一起摘掉喵~
        contentEl.querySelectorAll([
          'script', 'style', 'ins', '.ads', '.ad', '.advertisement',
          '.bottem1', '.bottem2', '.bottem3', '.bottem', 'a',
          '#user_ad', '.read-load-prev', '.read-load-next', '.read-load-p',
          '.read-page-mark', '.read-book-name', '.read-page-opt', '.read-page-top',
          '.read-opt-header', 'nav', 'header'
        ].join(',')).forEach(el => el.remove());
        
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
        
        // 移动 WAP 模板的 <h3> 章节名会被一起选中（桌面模板的 h3 在 .read-content 之外，不受影响），
        // EPUB 每章正文已经自带 <h1>标题</h1>，所以首行等于章节名就丢掉喵~
        const norm = (s: string) => s.replace(/[\s\u3000]/g, '');
        const titleNorm = norm(chapter.title || '');
        if (titleNorm.length >= 4) {
          const head = cleanText.split('\n').find(l => l.trim().length > 0) || '';
          const headNorm = norm(head);
          if (
            headNorm.length >= 4 &&
            (headNorm === titleNorm || titleNorm.endsWith(headNorm) || headNorm.endsWith(titleNorm))
          ) {
            cleanText = cleanText.replace(head, '');
          }
        }
        
        const lines = cleanChapterLines(cleanText.split('\n'))
          .filter(line => {
            if (line.length === 0) return false;
            if (line.length < 20) {
              const navTerms = [
                '目录', '上一页', '下一页', '尾页', '首页', '返回目录',
                '上一章', '下一章', '章节目录', '投推荐票', '加入书签', '返回书页', '加入书架'
              ];
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
    //    正文是服务端渲染的（实测 #j_chapterBox .read-content 直接就有几千字），
    //    所以判据只看「正文解析结果」，不要在整页里搜「加载中...」——
    //    章节页 #j_catalogListWrap .loading 里那处隐藏的「加载中...」会让整页匹配恒为真，
    //    于是每章都被推去 browser API 兜底（Vercel 上没有该接口 → 直接失败）喵~
    try {
      const html = await fetchText(chapter.url);
      const content = parseContent(html);
      if (content && content.length >= 30) {
        console.log(`[AliceSw] Direct content fetch successful喵~`);
        return content;
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
