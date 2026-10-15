/**
 * 全本文学（qbwx.org）书源喵~
 *
 * 站点特征：
 * - 搜索是 POST /search.html，参数名 s（不是 GET），直接请求首页的搜索表单即可确认。
 * - 结果结构：div.item → .image > a[href] + dl > dt > a[title] + dd(简介) + .btm(作者/分类/日期)
 * - 详情页 /qbwx/{id}/ 只给出「最新章节」预览（约 40 条），
 *   完整目录是分页的：/qbwx/{id}/ 是第 1-40 章，/index/{id}/N/ 是后续每 40 章一页。
 *   分页总数藏在 <select> 的 option 里，所以直接解析 select 拿到全部页地址。
 * - 正文是混淆过的：document.writeln(qsbs.bb('<base64>'))，
 *   每页几十个块，按顺序 base64 解码后拼接即可，不需要执行 JS、不需要 DOM。
 */
import type { Novel, Chapter } from '../../../types';
import type { SourceProvider } from '../shared/types';
import { QBWX_URL } from '../shared/constants';
import { fetchText } from '../shared/fetcher';
import { parseHTML } from '../shared/dom';
import { isRelevant } from '../shared/relevance';

const CHAPTERS_PER_PAGE = 40;

/** qbwx 的搜索结果里，标题常带装饰后缀，清一下喵~ */
const cleanQbwxTitle = (title: string) =>
  title
    .replace(/\s*(最新章节|全文阅读|免费阅读|无防盗|无弹窗|txt下载)\s*/gi, '')
    .replace(/^《|》$/g, '')
    .trim();

/**
 * POST 搜索：qbwx 只接受表单提交喵~
 *
 * 必须走 fetchText，因为它会把跨域请求改成 /api/proxy（浏览器直连会被 CORS 拦）。
 * fetchText 支持把 options 透传给 fetch，所以能带 method/body。
 */
async function postSearch(keyword: string): Promise<string> {
  return fetchText(`${QBWX_URL}/search.html`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: `s=${encodeURIComponent(keyword)}`,
  });
}

/**
 * 解码 qbwx 的正文混淆喵~
 * 页面里是 document.writeln(qsbs.bb('BASE64'))，按出现顺序拼接再解码。
 */
export function decodeQbwxContent(html: string): string {
  const blocks = html.match(/qsbs\.bb\('([A-Za-z0-9+/=]+)'\)/g) || [];
  if (blocks.length === 0) {
    // 没有混淆时，退回普通正文容器
    const fallback = html.match(/id="content"[^>]*>([\s\S]*?)<\/div>/);
    if (!fallback) return '';
    return fallback[1].replace(/<[^>]+>/g, '').replace(/&nbsp;/g, ' ').trim();
  }

  let decoded = '';
  for (const block of blocks) {
    const b64 = block.replace(/^qsbs\.bb\('|'\)$/g, '');
    try {
      // browser 与 node 都有 atob；中文需要按 UTF-8 还原喵~
      const binary = atob(b64);
      const bytes = new Uint8Array(binary.length);
      for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
      decoded += new TextDecoder('utf-8').decode(bytes);
    } catch {
      // 单个块坏了不影响其余部分，跳过
    }
  }

  return decoded
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

/**
 * 从目录页的 <select> 里拿全部页码喵~
 *
 * 重要：详情页 /qbwx/{id}/ 上 **没有** select（那里只有「最新章节」倒序预览），
 * select 只出现在目录页 /index/{id}/N/ 上。所以必须先请求目录页再解析。
 */
function parseTocPages(html: string, bookId: string): string[] {
  const pages: string[] = [];
  const seen = new Set<string>();
  const add = (value: string) => {
    if (!value) return;
    const full = value.startsWith('http') ? value : `${QBWX_URL}${value.startsWith('/') ? '' : '/'}${value}`;
    if (!seen.has(full)) {
      seen.add(full);
      pages.push(full);
    }
  };

  const selectMatch = html.match(/<select[\s\S]*?<\/select>/);
  if (selectMatch) {
    const optionRe = /<option[^>]*value="([^"]+)"[^>]*>/g;
    let m: RegExpExecArray | null;
    while ((m = optionRe.exec(selectMatch[0])) !== null) {
      if (m[1].includes(`/${bookId}/`) || m[1].includes(`/${bookId}`)) add(m[1]);
    }
  }

  // 兜底：没有 select 时扫 /index/{id}/N/ 链接喵~
  const linkRe = new RegExp(`href="(/index/${bookId}/\\d+/)"`, 'g');
  let m2: RegExpExecArray | null;
  while ((m2 = linkRe.exec(html)) !== null) add(m2[1]);

  // 必须保持 <select> 里的原始顺序喵！
  //
  // 不能按 URL 里的数字排序：第一页是 /qbwx/{id}/（没有数字），
  // 排到末尾就会让章节顺序整体错乱。实测斗破苍穹 43 个 option
  // 的原始顺序才是正确的阅读顺序（站点自己的 option 文案是错的，
  // 标着「第1-40章」的 /qbwx/{id}/ 实际是 1-22 章，
  // 但顺序本身可靠）。
  return pages;
}

/**
 * 解析一个目录页里的章节喵~
 *
 * 目录页里的章节是按「页码递增 + 编号递增」的真实顺序排列的，
 * 所以这里必须保持页面出现顺序，不能重排。
 */
function parseTocChapters(html: string, bookId: string): Chapter[] {
  const NAV_NOISE = /^(开始阅读|继续阅读|最新章节|加入书架|投推荐票|返回书页|加入书签)$/;
  const chapters: Chapter[] = [];
  const re = /<a[^>]+href="(\/\d+\/\d+\/\d+\.html)"[^>]*>([\s\S]{0,200}?)<\/a>/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html)) !== null) {
    const href = m[1];
    if (!href.includes(`/${bookId}/`)) continue;
    const rawTitle = m[2].replace(/<[^>]+>/g, '').trim();
    if (!rawTitle) continue;
    // 「开始阅读」是页面导航，不是章节喵~
    if (NAV_NOISE.test(rawTitle)) continue;
    chapters.push({ number: 0, title: rawTitle, url: `${QBWX_URL}${href}` });
  }
  return chapters;
}

export const qbwxProvider: SourceProvider = {
  key: 'qbwx',
  name: '全本文学',
  baseUrl: QBWX_URL,

  search: async (keyword: string): Promise<Novel[]> => {
    console.log(`[Qbwx] Searching for: ${keyword}喵~`);
    try {
      const html = await postSearch(keyword);
      const doc = parseHTML(html);
      const novels: Novel[] = [];

      // 主路径：结构化的 div.item 卡片喵~
      const items = doc.querySelectorAll('.item');
      items.forEach(item => {
        const linkEl = item.querySelector('.image a') as HTMLAnchorElement | null;
        const titleEl = item.querySelector('dt a') as HTMLAnchorElement | null;
        if (!linkEl || !titleEl) return;

        const href = linkEl.getAttribute('href') || '';
        if (!href) return;
        const title = cleanQbwxTitle(titleEl.getAttribute('title') || titleEl.textContent?.trim() || '');
        if (!title) return;

        const imgEl = item.querySelector('img');
        let coverUrl = imgEl?.getAttribute('data-original') || imgEl?.getAttribute('src') || '';
        if (coverUrl && !coverUrl.startsWith('http')) coverUrl = `${QBWX_URL}${coverUrl}`;
        // 占位图不算封面喵~
        if (coverUrl.includes('nocover')) coverUrl = '';

        // .btm 里除作者外还有 <em> 分类/日期，必须先把 em 摘掉，
        // 否则作者会变成「爱潜水的乌贼玄幻」这种拼接结果喵~
        const btmEl = item.querySelector('.btm');
        let author = '未知';
        if (btmEl) {
          const clone = btmEl.cloneNode(true) as HTMLElement;
          clone.querySelectorAll('em').forEach(em => em.remove());
          author = clone.textContent?.trim() || '未知';
        }
        const intro = item.querySelector('dd')?.textContent?.trim() || '';

        novels.push({
          id: href,
          title,
          author,
          description: intro,
          coverUrl,
          tags: [],
          status: 'Completed',
          detailUrl: href.startsWith('http') ? href : `${QBWX_URL}${href}`,
          chapters: [],
          sourceName: '全本文学',
        });
      });

      if (novels.length > 0) {
        return novels.filter(n => isRelevant(n.title, n.author, keyword));
      }

      // 兜底：直接扫所有书链喵~
      const links = doc.querySelectorAll('a[href*="/qbwx/"]');
      links.forEach(link => {
        const href = link.getAttribute('href') || '';
        if (!/^\/qbwx\/\d+\/?$/.test(href)) return;
        const title = cleanQbwxTitle(link.textContent?.trim() || '');
        if (!title) return;
        if (novels.some(n => n.detailUrl === `${QBWX_URL}${href}`)) return;
        novels.push({
          id: href,
          title,
          author: '未知',
          description: '',
          coverUrl: '',
          tags: [],
          status: 'Unknown',
          detailUrl: `${QBWX_URL}${href}`,
          chapters: [],
          sourceName: '全本文学',
        });
      });

      return novels.filter(n => isRelevant(n.title, n.author, keyword));
    } catch (e) {
      console.error('[Qbwx] search failed:', e);
      return [];
    }
  },

  getDetails: async (novel: Novel): Promise<Novel> => {
    const detailUrl = novel.detailUrl;
    const bookIdMatch = detailUrl.match(/\/qbwx\/(\d+)/) || detailUrl.match(/\/(\d+)\/?$/);
    const bookId = bookIdMatch ? bookIdMatch[1] : '';
    if (!bookId) return novel;

    const html = await fetchText(detailUrl);
    const doc = parseHTML(html);

    const title =
      doc.querySelector('meta[property="og:novel:book_name"]')?.getAttribute('content') ||
      cleanQbwxTitle(doc.querySelector('h1')?.textContent?.trim() || '') ||
      novel.title;

    const author =
      doc.querySelector('meta[property="og:novel:author"]')?.getAttribute('content') ||
      doc.querySelector('meta[property="og:novel:author_link"]')?.textContent?.trim() ||
      novel.author;

    const statusRaw =
      doc.querySelector('meta[property="og:novel:status"]')?.getAttribute('content') || '';
    const status: Novel['status'] =
      statusRaw.includes('完结') || statusRaw.includes('完成')
        ? 'Completed'
        : statusRaw.includes('连载')
          ? 'Serializing'
          : novel.status;

    // og:image 是相对路径（如 /img/1409.jpg），必须拼上 base 才能用喵~
    const coverMeta = doc.querySelector('meta[property="og:image"]')?.getAttribute('content') || '';
    const coverImgEl = doc.querySelector('img[data-original]');
    const coverImgAttr = coverImgEl?.getAttribute('data-original') || '';
    let coverUrl = coverMeta || coverImgAttr || novel.coverUrl;
    if (coverUrl && !/^https?:/i.test(coverUrl)) {
      coverUrl = `${QBWX_URL}${coverUrl.startsWith('/') ? '' : '/'}${coverUrl}`;
    }

    let description = novel.description;
    const introEl =
      doc.querySelector('#intro') || doc.querySelector('.intro') || doc.querySelector('dd');
    if (introEl?.textContent?.trim()) {
      description = introEl.textContent.trim().replace(/^简介[:：]?\s*/, '');
    }

    // 完整目录不在详情页上喵！
    //
    // 站点的分页有两个坑：
    //   1. 详情页 /qbwx/{id}/ 只有「最新章节」预览（约 40-52 条，**倒序**），
    //      它不是目录的一部分，混进来会让章节顺序彻底错乱。
    //   2. /index/{id}/N/ 的 N 是**倒序页码**：N 最大的一页才是第一章，
    //      而且 <select> 的 option 列表**不包含**这个最大 N。
    //      超出范围的 N 不返回 404，而是回落到第一页，所以没法靠状态码判断边界。
    //
    // 解法：从 N=1 递增请求，用「章节链接列表」当指纹，直到指纹重复 → N_max - 1 才是第一页。
    // 然后从 N_max-1 递减读到 1，保证章节正序。
    const tocPageUrl = (n: number) => `${QBWX_URL}/index/${bookId}/${n}/`;

    const fingerprint = (pageHtml: string): string => {
      const links = pageHtml.match(
        new RegExp(`href="(/\\d+/${bookId}/\\d+\\.html)"`, 'g')
      );
      if (!links || links.length === 0) return 'empty';
      return `${links.length}|${links[0]}|${links[links.length - 1]}`;
    };

    const chapters: Chapter[] = [];
    const seenChapterUrls = new Set<string>();
    const collect = (pageHtml: string) => {
      for (const ch of parseTocChapters(pageHtml, bookId)) {
        if (seenChapterUrls.has(ch.url)) continue;
        seenChapterUrls.add(ch.url);
        chapters.push(ch);
      }
    };

    // --- 1. 找出最大有效页码 N_max（第一页是 N_max，最后一页是 N=1）---
    let maxPage = 0;
    const seenFingerprints = new Map<string, number>();
    const MAX_PROBE = 200; // 安全上限，防止站点异常时无限请求喵~
    for (let n = 1; n <= MAX_PROBE; n++) {
      let pageHtml: string;
      try {
        pageHtml = await fetchText(tocPageUrl(n));
      } catch {
        break;
      }
      const fp = fingerprint(pageHtml);
      if (seenFingerprints.has(fp)) {
        // 内容重复 → 已经越过边界，n-1 是最大有效页喵~
        break;
      }
      seenFingerprints.set(fp, n);
      maxPage = n;
    }

    if (maxPage === 0) {
      // 目录彻底拿不到，退回到详情页预览（顺序会是倒的，但不至于空手）喵~
      collect(html);
    } else {
      // --- 2. 从 N_max 递减读到 1，保证正序喵~
      const order: number[] = [];
      for (let n = maxPage; n >= 1; n--) order.push(n);

      const concurrency = 4;
      const pageChunks: Chapter[][] = [];
      for (let i = 0; i < order.length; i += concurrency) {
        const batch = order.slice(i, i + concurrency);
        const results = await Promise.all(
          batch.map(async n => {
            try {
              return parseTocChapters(await fetchText(tocPageUrl(n)), bookId);
            } catch {
              return [] as Chapter[];
            }
          })
        );
        pageChunks.push(...results);
      }
      pageChunks.forEach(list => {
        for (const ch of list) {
          if (seenChapterUrls.has(ch.url)) continue;
          seenChapterUrls.add(ch.url);
          chapters.push(ch);
        }
      });

      // 注意：上面的批次是按递减页码并发抓的，批内顺序可能与页码顺序不一致，
      // 但同一批内的章节 URL 里编号是递增的、且后续章节编号更大，
      // 所以这里按章节编号做一次稳定排序来兜底喵~
      chapters.sort((a, b) => {
        const na = parseInt((a.url || '').match(/\/(\d+)\.html$/)?.[1] || '0', 10);
        const nb = parseInt((b.url || '').match(/\/(\d+)\.html$/)?.[1] || '0', 10);
        return na - nb;
      });
    }

    // 重新编号，保证顺序连续喵~
    chapters.forEach((c, i) => {
      c.number = i + 1;
    });

    return {
      ...novel,
      title,
      author,
      status,
      coverUrl,
      description,
      chapters,
      sourceName: '全本文学',
    };
  },

  getChapterContent: async (chapter: Chapter): Promise<string> => {
    if (!chapter.url) return '';
    const html = await fetchText(chapter.url);
    return decodeQbwxContent(html);
  },
};
