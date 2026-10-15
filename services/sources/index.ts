/**
 * 书源统一出口喵~
 *
 * 这里把拆分后的模块重新聚合成原来的公共 API，
 * 因此 `import { ... } from './source'` 的调用方无需改动。
 */

// 类型
export type { SourceProvider } from './shared/types';
export type { SourceKey } from './shared/constants';

// 抓取工具
export { fetchBlob } from './shared/fetcher';

// 相关性判定
export { isRelevant } from './shared/relevance';

// 封面
export { generatePlaceholderCover, fetchCoverFromOtherSources, fetchCoverFromBrowser } from './cover';

// 注册表
export {
  PROVIDERS,
  SOURCE_UNAVAILABLE_REASONS,
  SOURCE_DESCRIPTIONS,
  SOURCE_ENABLED_CONFIG,
  setSourceEnabled,
  loadSourceConfig,
  loadLegadoSources,
  importLegadoSources,
  removeLegadoSource,
} from './registry';

// 公共 API
export { searchNovel, getNovelDetails, downloadAndParseNovel } from './api';

// 智能抓取
export { smartSearchNovel, smartFetchChapter } from './smart';

// 各 provider（按需）
export { wanbengeProvider } from './providers/wanbenge';
export { dingdianProvider } from './providers/dingdian';
export { aliceswProvider } from './providers/alicesw';
