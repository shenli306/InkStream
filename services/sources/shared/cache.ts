/**
 * 搜索缓存维护喵~
 */
import { searchCache, CACHE_DURATION } from './constants';

export const cleanupSearchCache = (): void => {
  const now = Date.now();
  let cleanedCount = 0;
  
  Array.from(searchCache.entries()).forEach(([key, value]) => {
    if (now - value.timestamp > CACHE_DURATION) {
      searchCache.delete(key);
      cleanedCount++;
    }
  });
  
  if (cleanedCount > 0) {
    console.log(`[Cache] Cleaned ${cleanedCount} expired search entries喵~`);
  }
  
  // 如果缓存太大，清理最老的50个条目喵
  if (searchCache.size > 100) {
    const entries = Array.from(searchCache.entries());
    entries.sort((a, b) => a[1].timestamp - b[1].timestamp);
    
    const toDelete = entries.slice(0, Math.min(50, entries.length));
    toDelete.forEach(([key]) => searchCache.delete(key));
    
    console.log(`[Cache] Cleaned ${toDelete.length} oldest entries due to size limit喵~`);
  }
};
