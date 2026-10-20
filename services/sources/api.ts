/**
 * 书源公共 API 喵~
 *
 * 搜索聚合、详情获取、下载解析。
 */
import pLimit from 'p-limit';
import type { Novel, Chapter, NovelSource } from '../../types';
import type { SourceProvider } from './shared/types';
import { PROVIDERS, SOURCE_ENABLED_CONFIG, SOURCE_UNAVAILABLE_REASONS, loadSourceConfig } from './registry';
import { searchCache, CACHE_DURATION } from './shared/constants';
import { cleanupSearchCache } from './shared/cache';
import { isRelevant } from './shared/relevance';
import { isUrl } from './shared/fetcher';
import { setMaxInflight } from './shared/ratelimit';
import { wanbengeProvider } from './providers/wanbenge';
import { dingdianProvider } from './providers/dingdian';
import { aliceswProvider } from './providers/alicesw';
import { localProvider } from './providers/local';
import { shukugeProvider } from './providers/shukuge';
import { bqguiProvider } from './providers/bqgui';
import { qbwxProvider } from './providers/qbwx';

/** 取消就抛它：调用方按「取消」而不是「失败」处理喵~ */
const throwIfCancelled = (signal?: AbortSignal) => {
  if (signal?.aborted) throw new DownloadCancelledError();
};

/** 用户取消下载时抛出的哨兵错误喵~ */
export class DownloadCancelledError extends Error {
  constructor(message = '下载已取消') {
    super(message);
    this.name = 'DownloadCancelledError';
  }
}

/** 取消哨兵 or AbortError 都认成「取消」，用来区分「真失败」喵~ */
export const isDownloadCancelled = (e: unknown): boolean =>
  e instanceof DownloadCancelledError || (e instanceof Error && e.name === 'AbortError');

export const searchNovel = async (keyword: string, source: any = 'auto', respectConfig: boolean = true): Promise<Novel[]> => {
  // Check if keyword is a URL
  if (isUrl(keyword)) {
      console.log(`[Search] Detected URL: ${keyword}喵~`);
      
      // 可以在这里扩展其他站点的 URL 支持喵~
  }

  console.log(`[Search] Starting search for "${keyword}" across all providers 喵~`);
  
  const resultsByProvider: Record<string, number> = {};
  
  // 加载书源配置喵~
  if (respectConfig) {
    loadSourceConfig();
  }
  
  const promises = PROVIDERS.map(p => {
    const unavailableReason = SOURCE_UNAVAILABLE_REASONS[p.name];
    if (unavailableReason) {
      console.info(`[Search] Skipping unavailable source: ${p.name} (${unavailableReason})`);
      return Promise.resolve([] as Novel[]);
    }

    // 如果配置禁用且 respectConfig 为 true，则跳过该书源喵~
    if (respectConfig && SOURCE_ENABLED_CONFIG[p.name] === false) {
      console.log(`[Search] Skipping disabled source: ${p.name}喵~`);
      return Promise.resolve([] as Novel[]);
    }
    
    // 给每个源的搜索设置超时限制喵~
    const searchPromise = p.search(keyword).then(res => {
      resultsByProvider[p.name] = res.length;
      console.log(`[Search] ${p.name} returned ${res.length} results 喵~`);
      return res;
    }).catch(e => {
      resultsByProvider[p.name] = 0;
      console.error(`[Search] ${p.name} failed:`, e.message || e);
      return [] as Novel[];
    });

    // 8 秒超时，超时后返回空数组，不让它拖慢整体速度喵~
    let timeoutId: ReturnType<typeof setTimeout>;
    const timeoutPromise = new Promise<Novel[]>((resolve) => {
      timeoutId = setTimeout(() => {
        console.warn(`[Search] ${p.name} timed out after 8s 喵~`);
        resolve([]);
      }, 8000);
    });

    return Promise.race([searchPromise, timeoutPromise]).finally(() => clearTimeout(timeoutId));
  });

  const results = await Promise.all(promises);
  const allNovels = results.flat();
  
  console.log(`[Search] Aggregated results summary喵~:`);
  Object.entries(resultsByProvider).forEach(([name, count]) => {
      console.log(`- ${name}: ${count} results`);
  });
  console.log(`[Search] Total raw results: ${allNovels.length}喵~`);

  const localNovels = allNovels.filter(n => n.sourceName === '本地书库');
  const networkNovels = allNovels.filter(n => n.sourceName !== '本地书库');

  // Group network novels by title + author + source to avoid duplicate entries from SAME source
  const networkNovelsByBook: Record<string, Novel[]> = {};
  networkNovels.forEach(n => {
      const title = n.title.trim().toLowerCase();
      const author = n.author.trim().toLowerCase();
      const source = n.sourceName || '未知';
      // 改为按书名+作者+书源进行分组，这样不同书源的同名书就会分开显示喵~
      const key = `${title}_${author}_${source}`;
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

  // Final filtering to ensure relevance
  return [...localNovels, ...filteredNetworkNovels].filter(n => isRelevant(n.title, n.author, keyword));
}

const getProviderByName = (name: string): SourceProvider | undefined => {
  const registered = PROVIDERS.find(provider => name.includes(provider.name) || name.includes(provider.key));
  if (registered) return registered;
  if (name.includes('本地书库')) return localProvider;
  if (name.includes('完本阁')) return wanbengeProvider;
  if (name.includes('书库阁')) return shukugeProvider;
  if (name.includes('顶点小说网')) return dingdianProvider;
  if (name.includes('笔趣阁')) return bqguiProvider;
  if (name.includes('爱丽丝')) return aliceswProvider;
  if (name.includes('全本文学') || name.includes('qbwx')) return qbwxProvider;
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

/** 可被取消打断的 sleep：取消时立刻醒来，不拖慢取消响应喵~ */
const sleepWithAbort = (ms: number, signal?: AbortSignal) =>
  new Promise<void>(resolve => {
    if (signal?.aborted) return resolve();
    const timer = setTimeout(resolve, ms);
    const onAbort = () => { clearTimeout(timer); resolve(); };
    signal?.addEventListener('abort', onAbort, { once: true });
  });

const retry = async <T>(fn: () => Promise<T>, retries = 3, delayMs = 1000, context: string = '', signal?: AbortSignal): Promise<T> => {
  try {
    return await fn();
  } catch (error) {
    // 用户取消：不再退避重试，立刻冒泡喵~
    if (signal?.aborted) throw error;
    if (retries <= 0) throw error;
    console.warn(`Retry attempt remaining: ${retries} for ${context}. Error: ${error instanceof Error ? error.message : String(error)}`);
    // 退避也能被取消打断，否则点了取消还要干等 2s 才收尾喵~
    await sleepWithAbort(delayMs, signal);
    return retry(fn, retries - 1, delayMs * 2, context);
  }
};

export const downloadAndParseNovel = async (
  novel: Novel,
  onProgress: (msg: string, percent: number) => void,
  signal?: AbortSignal,
): Promise<Novel> => {
  const name = novel.sourceName || '';
  const isScrapable = PROVIDERS.some(p => name.includes(p.name) || name.includes(p.key));

  throwIfCancelled(signal);

  if (novel.chapters.length > 0 && isScrapable) {
    onProgress(`准备下载 ${novel.chapters.length} 章...`, 0);

    // 完本阁对频率限制非常严格，所以我们要慢一点喵~
    // 真实节流已经下沉到 shared/ratelimit.ts（按 host 串行 + 最小间隔）喵~
    // 这里的 concurrency 只是「同时排队的章节数」，不是同时在途的请求数——
    // 在途数量由 ratelimit 的全局闸门（默认 6）和 host 闸门共同决定喵~
    const isWanbenge = name.includes('完本阁');
    const isBqgui = name.includes('笔趣阁') || name.includes('bqgui');

    // 完本阁维持 2，笔趣阁 20，其他源 10 喵~
    const concurrency = isWanbenge ? 2 : (isBqgui ? 20 : 10);
    console.log(`[Download] Starting download with concurrency: ${concurrency} for ${name}喵~`);

    // 全局在途上限：并发越高，越要压住在途请求数喵~
    // 完本阁 / 全本文学这种整本 1000+ 章的，压到 4 更安全喵~
    const isQbwx = name.includes('全本文学') || name.includes('qbwx');
    setMaxInflight(isWanbenge ? 2 : (isQbwx ? 4 : 6));
    console.log(`[Download] Global in-flight cap: ${isWanbenge ? 2 : (isQbwx ? 4 : 6)}喵~`);

    const limit = pLimit(concurrency); 
    let completed = 0;
    let failedCount = 0;
    
    const fetchChapter = async (chapter: Chapter) => {
      if (!chapter.url) return;
      // 取消后：立刻返回，把 pLimit 队列快速排空（不再发新请求）喵~
      if (signal?.aborted) return;

      // 在下载前随机休息一下，假装是真人在翻页喵~
      if (isWanbenge) {
        const jitter = Math.random() * 800 + 300; // 0.3s - 1.1s
        await sleepWithAbort(jitter, signal);
        if (signal?.aborted) return;
      }

      try {
        await retry(async () => {
          // Find the provider that can handle this chapter's URL
          let provider = PROVIDERS.find(p => {
            // Check by URL matching
            try {
              const urlMatch = (p.baseUrl && chapter.url?.includes(new URL(p.baseUrl).hostname)) || 
                               (p.name === '完本阁' && chapter.url?.includes('jizai22.com'));
              return urlMatch;
            } catch {
              return false;
            }
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
        }, 2, 2000, `Chapter ${chapter.title}`, signal);

      } catch (e) {
        // 取消：不计失败、不上报进度，安静收尾喵~
        if (signal?.aborted) return;
        console.warn(`Failed to fetch chapter ${chapter.title}`, e);
        chapter.content = "获取失败";
        failedCount++;
      } finally {
        completed++;
        if (!signal?.aborted) {
          const percent = Math.floor((completed / novel.chapters.length) * 100);
          // 每一章都汇报进度，不让主人等得心急喵！
          onProgress(`下载中: ${chapter.title} (${completed}/${novel.chapters.length}) ${failedCount > 0 ? `[失败${failedCount}]` : ''}`, percent);
        }
      }
    };

    const input = novel.chapters.map(c => limit(() => fetchChapter(c)));
    await Promise.all(input);

    // 队列排空后再判一次：取消时不进入打包阶段喵~
    throwIfCancelled(signal);

    if (failedCount > 0) {
      onProgress(`下载完成，${failedCount} 章失败`, 100);
    } else {
      onProgress("所有章节下载完成", 100);
    }

    // 过滤掉下载失败或内容为空的章节喵~
    novel.chapters = novel.chapters.filter(c => c.content && c.content !== "获取失败" && c.content.trim().length > 0);
    // 重新编号喵~
    novel.chapters.forEach((c, i) => c.number = i + 1);

    return novel;

  } else {
    throw new Error("无法下载：该小说不支持自动抓取");
  }
};
