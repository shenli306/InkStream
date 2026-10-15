/**
 * 封面缓存喵~
 *
 * 仅浏览器可用（依赖 localStorage）。
 * alicesw 等站点：抓到一次封面就记住，避免重复请求。
 */
const COVER_CACHE_KEY = 'inkstream_alicesw_cover_cache';
const COVER_CACHE_EXPIRY = 7 * 24 * 60 * 60 * 1000; // 7天过期喵~

export const getCoverCache = (): Record<string, string> => {
  try {
    const cached = localStorage.getItem(COVER_CACHE_KEY);
    if (cached) {
      const { data, timestamp } = JSON.parse(cached);
      if (Date.now() - timestamp < COVER_CACHE_EXPIRY) {
        return data;
      }
    }
  } catch {}
  return {};
};

export const saveCoverCache = (title: string, coverUrl: string) => {
  try {
    const cache = getCoverCache();
    cache[title] = coverUrl;
    localStorage.setItem(COVER_CACHE_KEY, JSON.stringify({
      data: cache,
      timestamp: Date.now()
    }));
  } catch {}
};
