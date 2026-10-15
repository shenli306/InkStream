/**
 * 智能抓取喵~
 *
 * 独立于书源注册表，直接用规则 + /api/scraper/extract 提取正文。
 */
import type { Novel } from '../../types';
import { SmartSelector, AdaptiveFetcher, ElementTracker, selectorRegistry } from '../../scrapling';
import type { SelectorGroup, ExtractionResult } from '../../scrapling';
import type { SourceKey } from './shared/constants';
import { getRequestUrls } from './shared/fetcher';

// ==================== SmartSelector 增强搜索 ====================

/**
 * 使用 SmartSelector 进行自适应搜索（Scrapling 风格）
 * 当传统选择器失效时自动 fallback 到相似度匹配
 */
export async function smartSearchNovel(
  keyword: string,
  sourceKey: SourceKey,
  searchUrl: string,
  containerSelector: string,
  itemSelectors: {
    title: { css?: string; xpath?: string; text?: string };
    author: { css?: string; xpath?: string; text?: string };
    cover: { css?: string; attribute?: string };
    detailUrl: { css?: string; attribute?: string };
  }
): Promise<Novel[]> {
  try {
    const config = selectorRegistry.get(sourceKey);
    const searchConfig = config?.search;
    const targetUrl = new URL(searchUrl);
    targetUrl.searchParams.set('keyword', keyword);

    const response = await fetch(getRequestUrls(targetUrl.href)[0]);

    if (!response.ok) return [];

    const html = await response.text();
    const selector = new SmartSelector(html);
    const doc = selector.document;

    const containers = doc.querySelectorAll(containerSelector);
    if (containers.length === 0) return [];

    const novels: Novel[] = [];

    containers.forEach((container) => {
      const containerHtml = container.outerHTML;
      const itemSelector = new SmartSelector(containerHtml);

      const titleResult = searchConfig
        ? itemSelector.extract(searchConfig.title)
        : { value: itemSelector.css(itemSelectors.title.css || 'a', 'textContent'), confidence: 0.5 };

      const authorResult = searchConfig
        ? itemSelector.extract(searchConfig.author)
        : { value: itemSelector.css(itemSelectors.author.css || '.author', 'textContent'), confidence: 0.5 };

      const title = typeof titleResult.value === 'string' ? titleResult.value : '';
      const author = typeof authorResult.value === 'string' ? authorResult.value : '未知';

      if (!title.trim()) return;

      let detailUrl = '';
      if (itemSelectors.detailUrl.css) {
        const linkEl = container.querySelector(itemSelectors.detailUrl.css);
        const href = linkEl?.getAttribute(itemSelectors.detailUrl.attribute || 'href') || '';
        detailUrl = href.startsWith('http') ? href : `${config?.baseUrl || ''}${href}`;
      }

      let coverUrl = '';
      if (itemSelectors.cover.css) {
        const imgEl = container.querySelector(itemSelectors.cover.css);
        coverUrl = imgEl?.getAttribute(itemSelectors.cover.attribute || 'src') || '';
      }

      novels.push({
        id: detailUrl || title,
        title,
        author,
        description: '',
        coverUrl,
        tags: [],
        status: 'Unknown',
        detailUrl,
        chapters: [],
        sourceName: config?.sourceKey || sourceKey,
      });
    });

    return novels;
  } catch (err) {
    console.error('[SmartSearch] Error:', err);
    return [];
  }
}

/**
 * 使用 SmartSelector + ElementTracker 在服务端提取章节正文
 */
export async function smartFetchChapter(
  chapterUrl: string,
  sourceKey: SourceKey
): Promise<string | null> {
  try {
    const config = selectorRegistry.get(sourceKey);
    if (!config) return null;

    const response = await fetch('/api/scraper/extract', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        url: chapterUrl,
        selectors: [config.content.body],
      }),
    });

    const data = await response.json();
    if (data.success && data.results?.[0]?.value) {
      return data.results[0].value;
    }

    return null;
  } catch (err) {
    console.error('[SmartFetch] Error:', err);
    return null;
  }
}
