import type { Chapter, Novel } from '../types';

/** Subset of the Legado source format used by the converter. */
export interface LegadoBookSource {
  bookSourceName: string;
  bookSourceUrl: string;
  enabled?: boolean;
  header?: string;
  searchUrl?: string;
  ruleSearch?: Record<string, string>;
  ruleBookInfo?: Record<string, string>;
  ruleToc?: Record<string, string>;
  ruleContent?: Record<string, string>;
}

export interface ConvertedBookSource {
  key: string;
  name: string;
  baseUrl: string;
  searchUrl: string;
  headers: Record<string, string>;
  rules: {
    search: Record<string, string>;
    bookInfo: Record<string, string>;
    toc: Record<string, string>;
    content: Record<string, string>;
  };
}

export interface ConvertedProvider {
  key: string;
  name: string;
  baseUrl: string;
  search: (keyword: string) => Promise<Novel[]>;
  getDetails: (novel: Novel) => Promise<Novel>;
  getChapterContent: (chapter: Chapter) => Promise<string>;
}

const parseDocument = (html: string): Document => {
  if (typeof DOMParser === 'undefined') {
    throw new Error('DOMParser is unavailable in this runtime');
  }
  return new DOMParser().parseFromString(html, 'text/html');
};

const absoluteUrl = (value: string, baseUrl: string): string => {
  if (!value) return '';
  try {
    return new URL(value, baseUrl).href;
  } catch {
    return value;
  }
};

const sourceKey = (name: string): string => {
  const key = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  if (key) return key;
  let hash = 2166136261;
  for (const char of name) {
    hash ^= char.codePointAt(0) || 0;
    hash = Math.imul(hash, 16777619);
  }
  return `legado-${(hash >>> 0).toString(36)}`;
};

const parseHeaders = (header?: string): Record<string, string> => {
  if (!header) return {};
  let json = header.replace(/^\s*@js:\s*/, '').trim();
  const stringifyMatch = json.match(/^JSON\.stringify\(\s*({[\s\S]*})\s*\)\s*;?$/);
  if (stringifyMatch) json = stringifyMatch[1];
  try {
    const parsed = JSON.parse(json);
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
};

const splitPostProcess = (rule: string): { selector: string; remove?: string } => {
  const index = rule.indexOf('##');
  if (index < 0) return { selector: rule.trim() };
  return { selector: rule.slice(0, index).trim(), remove: rule.slice(index + 2) };
};

const stripJs = (value: string): string => value
  .replace(/<js>[\s\S]*?<\/js>/gi, '')
  .trim();

const cleanValue = (value: string, rule: string): string => {
  const post = splitPostProcess(stripJs(rule)).remove;
  if (!post) return value.trim();
  // Legado uses ##text to remove a literal prefix/suffix or a regex.
  const expression = post.replace(/^\s+|\s+$/g, '');
  try {
    const regex = new RegExp(expression, 'g');
    return value.replace(regex, '').trim();
  } catch {
    return value.split(expression).join('').trim();
  }
};

const normalizeRule = (rule?: string): { selector: string; attribute: string; remove?: string } => {
  const raw = stripJs(rule || '');
  const { selector: base, remove } = splitPostProcess(raw);
  const parts = base.split('@').map(p => p.trim()).filter(Boolean);
  let selector = parts.shift() || '';
  let attribute = 'textContent';

  // text.<label>@href means find an anchor containing the label.
  const textMatch = selector.match(/^text\.(.+)$/i);
  if (textMatch) selector = `a`; // label matching is handled in selectElements.
  if (parts.length > 0) {
    const last = parts[parts.length - 1].toLowerCase();
    if (['text', 'href', 'src', 'data-original', 'textcontent'].includes(last)) {
      attribute = last === 'text' ? 'textContent' : last;
      parts.pop();
    }
  }
  if (parts.length > 0) selector = `${selector} ${parts.join(' ')}`;
  return { selector, attribute, remove };
};

const selectElements = (root: ParentNode, rule?: string): Element[] => {
  const raw = stripJs(rule || '');
  const { selector } = normalizeRule(raw);
  if (/^(text|href|src|data-original|textcontent)$/i.test(raw.trim())) {
    return typeof (root as Element).tagName === 'string' ? [root as Element] : [];
  }
  const indexed = selector.match(/^(.*)\.(\d+)$/);
  const baseSelector = indexed ? indexed[1] : selector;
  const index = indexed ? Number(indexed[2]) : 0;
  const textMatch = (splitPostProcess(raw).selector.split('@')[0] || '').match(/^text\.(.+)$/i);
  if (textMatch) {
    const needle = textMatch[1];
    return Array.from(root.querySelectorAll('a')).filter(el => (el.textContent || '').includes(needle));
  }
  if (raw.trim().toLowerCase() === 'text') {
    return typeof (root as Element).tagName === 'string' ? [root as Element] : [];
  }
  if (!baseSelector) return [];
  try {
    const matches = Array.from(root.querySelectorAll(baseSelector));
    return indexed ? (matches[index] ? [matches[index]] : []) : matches;
  } catch {
    return [];
  }
};

const extract = (root: ParentNode, rule?: string, baseUrl = ''): string => {
  if (!rule) return '';
  const normalized = normalizeRule(rule);
  const element = selectElements(root, rule)[0];
  if (!element) return '';
  const raw = stripJs(rule).trim().toLowerCase();
  const attribute = /^(href|src|data-original)$/i.test(raw) ? raw : normalized.attribute;
  const value = attribute === 'textContent'
    ? element.textContent || ''
    : element.getAttribute(attribute) || '';
  const cleaned = cleanValue(value, rule);
  return attribute === 'href' || attribute === 'src' || attribute === 'data-original'
    ? absoluteUrl(cleaned, baseUrl)
    : cleaned;
};

const extractMany = (root: ParentNode, rule?: string, baseUrl = ''): string[] => {
  if (!rule) return [];
  const normalized = normalizeRule(rule);
  const raw = stripJs(rule).trim().toLowerCase();
  const attribute = /^(href|src|data-original)$/i.test(raw) ? raw : normalized.attribute;
  return selectElements(root, rule).map(element => {
    const value = attribute === 'textContent'
      ? element.textContent || ''
      : element.getAttribute(attribute) || '';
    const cleaned = cleanValue(value, rule);
    return attribute === 'href' || attribute === 'src' || attribute === 'data-original'
      ? absoluteUrl(cleaned, baseUrl)
      : cleaned;
  }).filter(Boolean);
};

export const convertLegadoSource = (source: LegadoBookSource): ConvertedBookSource => ({
  key: sourceKey(source.bookSourceName),
  name: source.bookSourceName,
  baseUrl: source.bookSourceUrl,
  searchUrl: source.searchUrl || '',
  headers: parseHeaders(source.header),
  rules: {
    search: source.ruleSearch || {},
    bookInfo: source.ruleBookInfo || {},
    toc: source.ruleToc || {},
    content: source.ruleContent || {},
  },
});

/** Convert a JSON string/file payload after validating the required fields. */
export const convertLegadoJson = (json: string): ConvertedBookSource => {
  const parsed: unknown = JSON.parse(json);
  if (!parsed || typeof parsed !== 'object') {
    throw new Error('Legado source must be a JSON object');
  }
  const source = parsed as Partial<LegadoBookSource>;
  if (!source.bookSourceName || !source.bookSourceUrl) {
    throw new Error('Legado source requires bookSourceName and bookSourceUrl');
  }
  return convertLegadoSource(source as LegadoBookSource);
};

export const createLegadoProvider = (
  input: LegadoBookSource | ConvertedBookSource,
  fetchHtml: (url: string, headers?: Record<string, string>) => Promise<string> = async (url, headers) => {
    const response = await fetch(`/api/proxy?url=${encodeURIComponent(url)}`, { headers });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return response.text();
  }
): ConvertedProvider => {
  const config = 'rules' in input ? input : convertLegadoSource(input);
  const getUrl = (url: string) => absoluteUrl(url, config.baseUrl);

  return {
    key: config.key,
    name: config.name,
    baseUrl: config.baseUrl,
    search: async (keyword) => {
      const searchUrl = getUrl(config.searchUrl.replace(/\{\{key\}\}/g, encodeURIComponent(keyword)));
      const html = await fetchHtml(searchUrl, config.headers);
      const doc = parseDocument(html);
      const items = selectElements(doc, config.rules.search.bookList);
      return items.map(item => {
        const detailUrl = extract(item, config.rules.search.bookUrl, config.baseUrl);
        return {
          id: detailUrl || `${config.key}:${extract(item, config.rules.search.name)}`,
          title: extract(item, config.rules.search.name),
          author: extract(item, config.rules.search.author) || '未知',
          description: extract(item, config.rules.search.intro),
          coverUrl: extract(item, config.rules.search.coverUrl, config.baseUrl),
          tags: extract(item, config.rules.search.kind).split(/[,，]/).filter(Boolean),
          status: 'Unknown',
          detailUrl,
          chapters: [],
          sourceName: config.name,
        } satisfies Novel;
      }).filter(book => book.title && book.detailUrl);
    },
    getDetails: async (novel) => {
      const detailUrl = getUrl(novel.detailUrl);
      const html = await fetchHtml(detailUrl, config.headers);
      const doc = parseDocument(html);
      const tocStartUrl = extract(doc, config.rules.bookInfo.tocUrl, detailUrl) || detailUrl;
      const chapters: Chapter[] = [];
      const seenTocUrls = new Set<string>();
      const seenChapterUrls = new Set<string>();
      let tocUrl = tocStartUrl;

      while (tocUrl && !seenTocUrls.has(tocUrl) && seenTocUrls.size < 50) {
        seenTocUrls.add(tocUrl);
        const tocHtml = tocUrl === detailUrl ? html : await fetchHtml(tocUrl, config.headers);
        const tocDoc = tocUrl === detailUrl ? doc : parseDocument(tocHtml);
        const tocItems = selectElements(tocDoc, config.rules.toc.chapterList);

        tocItems.forEach(item => {
          const url = extract(item, config.rules.toc.chapterUrl, tocUrl);
          if (!url || seenChapterUrls.has(url)) return;
          seenChapterUrls.add(url);
          chapters.push({
            number: chapters.length + 1,
            title: extract(item, config.rules.toc.chapterName, tocUrl) || `第 ${chapters.length + 1} 章`,
            url,
          });
        });

        tocUrl = extract(tocDoc, config.rules.toc.nextTocUrl, tocUrl);
      }

      return {
        ...novel,
        title: extract(doc, config.rules.bookInfo.name) || novel.title,
        author: extract(doc, config.rules.bookInfo.author) || novel.author,
        description: extract(doc, config.rules.bookInfo.intro) || novel.description,
        coverUrl: extract(doc, config.rules.bookInfo.coverUrl, config.baseUrl) || novel.coverUrl,
        chapters,
      };
    },
    getChapterContent: async (chapter) => {
      const pages: string[] = [];
      const seenUrls = new Set<string>();
      let contentUrl = getUrl(chapter.url || '');

      while (contentUrl && !seenUrls.has(contentUrl) && seenUrls.size < 50) {
        seenUrls.add(contentUrl);
        const html = await fetchHtml(contentUrl, config.headers);
        const doc = parseDocument(html);
        const bodies = selectElements(doc, config.rules.content.content);
        if (bodies.length === 0 && pages.length === 0) throw new Error('Content element not found');
        bodies.forEach(body => body.querySelectorAll('script, style').forEach(el => el.remove()));
        const page = cleanValue(bodies.map(body => body.textContent || '').join('\n\n'), config.rules.content.content);
        if (page) pages.push(page);
        contentUrl = extract(doc, config.rules.content.nextContentUrl, contentUrl);
      }

      return pages.join('\n\n')
        .replace(/\u00a0/g, ' ')
        .replace(/[ \t]+\n/g, '\n')
        .replace(/\n{3,}/g, '\n\n')
        .trim();
    },
  };
};
