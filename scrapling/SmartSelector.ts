/**
 * SmartSelector — 智能多模式选择器
 * 借鉴 Scrapling 的设计理念：CSS/XPath/Text/Regex 多模式选择 + 自动 fallback
 *
 * 环境兼容：
 *   - Node.js：传入 HTML 字符串，使用 JSDOM 解析
 *   - 浏览器：传入 Document 对象，使用原生 DOM API
 */

// ==================== 类型定义 ====================

export type SelectorMode = 'css' | 'xpath' | 'text' | 'regex' | 'auto';

export interface SelectorRule {
  /** 选择器模式 */
  mode: SelectorMode;
  /** 选择器表达式 */
  expr: string;
  /** 优先级（数值越小越优先，用于自动 fallback） */
  priority?: number;
  /** 描述（便于调试和维护） */
  description?: string;
}

export interface SelectorGroup {
  /** 选择器组名称（对应数据字段，如 title/chapter/author） */
  name: string;
  /** 多个备选选择器规则，按优先级降序排列 */
  rules: SelectorRule[];
  /** 提取属性名（如 'href', 'src', 'textContent'），默认 'textContent' */
  attribute?: string;
  /** 是否为多值提取（如章节列表） */
  multiple?: boolean;
  /** 后处理函数 */
  postProcess?: (value: string) => string;
}

export interface ExtractionResult {
  name: string;
  value: string | string[] | null;
  matchedRule?: SelectorRule;
  confidence: number;
}

// ==================== 核心类 ====================

export class SmartSelector {
  private doc: Document;

  /**
   * 构造函数支持两种模式：
   *   - Node.js：传入 HTML 字符串，内部使用 JSDOM 解析
   *   - 浏览器：传入 Document 对象
   */
  constructor(input: string | Document, url?: string) {
    if (typeof input === 'string') {
      // Node.js 环境：使用 JSDOM
      let JSDOM: any;
      try {
        JSDOM = require('jsdom').JSDOM;
      } catch {
        // 浏览器 fallback：使用 DOMParser
        const parser = new DOMParser();
        const dom = parser.parseFromString(input, 'text/html');
        this.doc = dom;
        return;
      }
      const dom = new JSDOM(input, { url });
      this.doc = dom.window.document;
    } else {
      this.doc = input;
    }
  }

  /** 获取原始 Document（用于传统选择器） */
  get document(): Document {
    return this.doc;
  }

  /**
   * CSS 选择器提取
   */
  css(selector: string, attribute?: string): string | null {
    // 处理 ::text 非标准伪元素（JSDOM 不支持）
    const normalizedSelector = selector.replace(/::text$/i, '');
    const wantText = normalizedSelector !== selector;
    const el = this.doc.querySelector(normalizedSelector);
    if (!el) return null;
    return this.extractFromElement(el, wantText ? 'textContent' : attribute);
  }

  /**
   * CSS 选择器提取全部
   */
  cssAll(selector: string, attribute?: string): string[] {
    const normalizedSelector = selector.replace(/::text$/i, '');
    const wantText = normalizedSelector !== selector;
    const els = this.doc.querySelectorAll(normalizedSelector);
    return Array.from(els).map(el =>
      this.extractFromElement(el, wantText ? 'textContent' : attribute)
    ).filter(Boolean) as string[];
  }

  /**
   * XPath 选择器提取
   */
  xpath(expr: string, attribute?: string): string | null {
    try {
      const result = this.doc.evaluate(
        expr,
        this.doc,
        null,
        XPathResult.FIRST_ORDERED_NODE_TYPE,
        null
      );
      const el = result.singleNodeValue as Element | null;
      if (!el) return null;
      return this.extractFromElement(el, attribute);
    } catch {
      return null;
    }
  }

  /**
   * XPath 选择器提取全部
   */
  xpathAll(expr: string, attribute?: string): string[] {
    try {
      const result = this.doc.evaluate(
        expr,
        this.doc,
        null,
        XPathResult.ORDERED_NODE_ITERATOR_TYPE,
        null
      );
      const results: string[] = [];
      let node = result.iterateNext();
      while (node) {
        if (node instanceof Element) {
          const val = this.extractFromElement(node, attribute);
          if (val) results.push(val);
        }
        node = result.iterateNext();
      }
      return results;
    } catch {
      return [];
    }
  }

  /**
   * 文本内容搜索（根据包含的文本查找元素，然后提取）
   */
  text(containing: string, tag?: string, attribute?: string): string | null {
    const selector = tag ? `${tag}` : '*';
    const els = this.doc.querySelectorAll(selector);
    for (const el of els) {
      if (el.textContent?.includes(containing)) {
        return this.extractFromElement(el, attribute);
      }
    }
    return null;
  }

  /**
   * 文本内容搜索全部
   */
  textAll(containing: string, tag?: string, attribute?: string): string[] {
    const selector = tag ? `${tag}` : '*';
    const els = this.doc.querySelectorAll(selector);
    const results: string[] = [];
    for (const el of els) {
      if (el.textContent?.includes(containing)) {
        const val = this.extractFromElement(el, attribute);
        if (val) results.push(val);
      }
    }
    return results;
  }

  /**
   * 正则搜索（在元素文本中匹配）
   */
  regex(pattern: RegExp, tag?: string, groupIndex?: number): string | null {
    const selector = tag ? `${tag}` : '*';
    const els = this.doc.querySelectorAll(selector);
    const idx = groupIndex ?? 1;
    for (const el of els) {
      const text = el.textContent ?? '';
      const match = text.match(pattern);
      if (match && match[idx] !== undefined) {
        return match[idx];
      }
    }
    return null;
  }

  /**
   * 正则搜索全部
   */
  regexAll(pattern: RegExp, tag?: string, groupIndex?: number): string[] {
    const selector = tag ? `${tag}` : '*';
    const els = this.doc.querySelectorAll(selector);
    const idx = groupIndex ?? 1;
    const results: string[] = [];
    for (const el of els) {
      const text = el.textContent ?? '';
      let match: RegExpExecArray | null;
      while ((match = pattern.exec(text)) !== null) {
        if (match[idx] !== undefined) results.push(match[idx]);
      }
    }
    return results;
  }

  /**
   * 智能提取：按 SelectorGroup 规则链依次尝试，取首个命中结果
   * 这是核心方法 —— 多选择器自动 fallback，网站改版时自动容错
   */
  extract(group: SelectorGroup): ExtractionResult {
    for (let i = 0; i < group.rules.length; i++) {
      const rule = group.rules[i];
      const priority = rule.priority ?? i;

      let value: string | string[] | null = null;

      switch (rule.mode) {
        case 'css':
          value = group.multiple
            ? this.cssAll(rule.expr, group.attribute)
            : this.css(rule.expr, group.attribute);
          break;
        case 'xpath':
          value = group.multiple
            ? this.xpathAll(rule.expr, group.attribute)
            : this.xpath(rule.expr, group.attribute);
          break;
        case 'text':
          value = group.multiple
            ? this.textAll(rule.expr, undefined, group.attribute)
            : this.text(rule.expr, undefined, group.attribute);
          break;
        case 'regex':
          value = group.multiple
            ? this.regexAll(new RegExp(rule.expr, 'g'))
            : this.regex(new RegExp(rule.expr));
          break;
      }

      // 检查是否有有效结果
      const isValid = group.multiple
        ? Array.isArray(value) && value.length > 0
        : typeof value === 'string' && value.trim().length > 0;

      if (isValid) {
        // 应用后处理
        if (group.postProcess && typeof value === 'string') {
          value = group.postProcess(value);
        }
        if (group.postProcess && Array.isArray(value)) {
          value = value.map(v => group.postProcess!(v));
        }

        return {
          name: group.name,
          value,
          matchedRule: rule,
          confidence: 1 - priority * 0.1, // 优先级越高置信度越高
        };
      }
    }

    return {
      name: group.name,
      value: group.multiple ? [] : null,
      confidence: 0,
    };
  }

  /**
   * 批量提取多个字段
   */
  extractAll(groups: SelectorGroup[]): ExtractionResult[] {
    return groups.map(g => this.extract(g));
  }

  /**
   * 查找相似元素（结构相似度算法）
   * 当原始选择器失效时，搜索 DOM 中结构最相似的元素
   */
  findSimilar(
    sampleSelector: string,
    candidatesSelector: string,
    threshold = 0.3
  ): Element | null {
    const sample = this.doc.querySelector(sampleSelector);
    if (!sample) return null;

    const sampleSig = this.getElementSignature(sample);
    const candidates = this.doc.querySelectorAll(candidatesSelector);

    let bestMatch: Element | null = null;
    let bestScore = 0;

    for (const candidate of candidates) {
      const score = this.calculateSimilarity(
        sampleSig,
        this.getElementSignature(candidate)
      );
      if (score > bestScore && score >= threshold) {
        bestScore = score;
        bestMatch = candidate;
      }
    }

    return bestMatch;
  }

  /**
   * 生成元素的"签名"向量（标签结构、类名、属性、文本特征）
   */
  private getElementSignature(el: Element): Record<string, number> {
    const sig: Record<string, number> = {};
    const tagName = el.tagName.toLowerCase();
    sig[`tag:${tagName}`] = 1;

    // 类名
    el.classList.forEach(cls => {
      sig[`class:${cls}`] = 1;
    });

    // 子元素类型分布
    const childTags = Array.from(el.children).map(c => c.tagName.toLowerCase());
    childTags.forEach(t => {
      sig[`child:${t}`] = (sig[`child:${t}`] || 0) + 1;
    });

    // 文本长度区间
    const textLen = (el.textContent ?? '').trim().length;
    sig[`textLen:${Math.floor(textLen / 50)}`] = 1;

    // 属性存在性
    ['href', 'src', 'alt', 'title', 'data-', 'id'].forEach(attr => {
      if (el.hasAttribute(attr) || Array.from(el.attributes).some(a => a.name.startsWith(attr))) {
        sig[`attr:${attr}`] = 1;
      }
    });

    return sig;
  }

  /**
   * Jaccard 相似度计算
   */
  private calculateSimilarity(
    sigA: Record<string, number>,
    sigB: Record<string, number>
  ): number {
    const keysA = Object.keys(sigA);
    const keysB = Object.keys(sigB);

    if (keysA.length === 0 && keysB.length === 0) return 0;

    const intersection = keysA.filter(k => k in sigB).length;
    const union = new Set([...keysA, ...keysB]).size;

    return union === 0 ? 0 : intersection / union;
  }

  /**
   * 从元素中提取指定属性或文本
   */
  private extractFromElement(el: Element, attribute?: string): string {
    if (!attribute || attribute === 'textContent') {
      return (el.textContent ?? '').trim();
    }
    if (attribute === 'innerHTML') {
      return el.innerHTML;
    }
    if (attribute === 'outerHTML') {
      return el.outerHTML;
    }
    const attrVal = el.getAttribute(attribute);
    if (attrVal !== null) return attrVal.trim();

    // 尝试作为属性名访问（如 href, src）
    const propVal = (el as any)[attribute];
    if (typeof propVal === 'string') return propVal.trim();

    return (el.textContent ?? '').trim();
  }
}