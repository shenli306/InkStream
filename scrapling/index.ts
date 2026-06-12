/**
 * Scrapling for TypeScript — 统一导出入口
 *
 * 借鉴 D4Vinci/Scrapling 的设计理念，为 InkStream 提供：
 *   - SmartSelector: 智能多模式选择器（CSS/XPath/Text/Regex）
 *   - AdaptiveFetcher: 自适应 HTTP 抓取器（TLS 伪装、编码检测、智能重试）
 *   - ElementTracker: 自适应元素追踪（网站改版容错）
 *   - SelectorRegistry: 选择器注册表（集中管理、热更新）
 */

export { SmartSelector } from './SmartSelector';
export type { SelectorMode, SelectorRule, SelectorGroup, ExtractionResult } from './SmartSelector';

export { AdaptiveFetcher, FetcherSession } from './AdaptiveFetcher';
export type { FetcherOptions, FetcherResponse, FetchMethod } from './AdaptiveFetcher';

export { ElementTracker } from './ElementTracker';
export type { ElementSignature, TrackedElement } from './ElementTracker';

export { SelectorRegistry, selectorRegistry } from './SelectorRegistry';
export type { SourceSelectorConfig } from './SelectorRegistry';