/**
 * ElementTracker — 自适应元素追踪系统
 * 借鉴 Scrapling 的 Smart Element Tracking：
 *   网站结构变化时，基于元素签名相似度自动重新定位目标元素
 *
 * 核心机制：
 *   1. 首次抓取时记录目标的"结构签名"（标签层级、类名、属性、文本模式）
 *   2. 后续抓取时如果原始选择器失效，自动搜索 DOM 找到最相似的元素
 *   3. 支持多级 fallback（CSS → XPath → 相似度搜索）
 */

import { SmartSelector, SelectorGroup, SelectorRule, ExtractionResult } from './SmartSelector';

// ==================== 类型定义 ====================

export interface ElementSignature {
  /** 标签名 */
  tagName: string;
  /** CSS 类名列表 */
  classList: string[];
  /** 父元素标签名 */
  parentTag: string;
  /** 祖先路径（从根到当前，只含标签名） */
  ancestorPath: string[];
  /** 深度（距文档根的层级数） */
  depth: number;
  /** 属性键列表 */
  attributeKeys: string[];
  /** 关键属性值哈希 */
  keyAttributeHash: string;
  /** 直接子元素标签分布 */
  childTagDistribution: Record<string, number>;
  /** 文本长度区间 */
  textLenBucket: number;
  /** 文本前 50 字符的哈希 */
  textPrefixHash: string;
  /** 同级位置索引（第几个同标签兄弟） */
  siblingIndex: number;
}

export interface TrackedElement {
  /** 选择器组名称 */
  name: string;
  /** 原始选择器规则 */
  originalRules: SelectorRule[];
  /** 成功时的元素签名 */
  signature: ElementSignature | null;
  /** 最近成功的选择器规则 */
  lastSuccessfulRule: SelectorRule | null;
  /** 最近成功时间 */
  lastSuccessAt: number;
  /** 失败次数（用于统计网站改版频率） */
  failureCount: number;
}

// ==================== 核心类 ====================

export class ElementTracker {
  private tracked: Map<string, TrackedElement> = new Map();
  private selector: SmartSelector;

  constructor(html: string, url?: string) {
    this.selector = new SmartSelector(html, url);
  }

  get smartSelector(): SmartSelector {
    return this.selector;
  }

  /**
   * 自适应提取：先用规则链尝试，失败后基于签名搜索相似元素
   */
  extract(group: SelectorGroup): ExtractionResult {
    const tracked = this.tracked.get(group.name);

    // 如果有之前成功的规则，优先用它尝试
    const rules = group.rules.slice();
    if (tracked?.lastSuccessfulRule && !rules.some(r => r.expr === tracked.lastSuccessfulRule!.expr)) {
      rules.unshift({ ...tracked.lastSuccessfulRule, priority: -1 });
    }

    const adjustedGroup: SelectorGroup = { ...group, rules };
    const result = this.selector.extract(adjustedGroup);

    // 如果所有规则都失败，尝试相似度搜索
    if (result.confidence === 0 && tracked?.signature) {
      const similarValue = this.searchBySignature(tracked);
      if (similarValue) {
        return {
          name: group.name,
          value: group.multiple ? [similarValue] : similarValue,
          matchedRule: { mode: 'css', expr: '[similarity-match]', description: '相似度自动匹配' },
          confidence: 0.5, // 相似度匹配置信度较低
        };
      }
    }

    // 更新追踪信息
    if (result.confidence > 0) {
      const el = this.findMatchingElement(result);
      this.updateTracking(group, result, el);
    } else {
      this.recordFailure(group);
    }

    return result;
  }

  /**
   * 批量自适应提取
   */
  extractAll(groups: SelectorGroup[]): ExtractionResult[] {
    return groups.map(g => this.extract(g));
  }

  /**
   * 获取追踪统计信息
   */
  getTrackingStats(): Array<{
    name: string;
    lastSuccessRule: string | null;
    failureCount: number;
  }> {
    return Array.from(this.tracked.values()).map(t => ({
      name: t.name,
      lastSuccessRule: t.lastSuccessfulRule?.expr ?? null,
      failureCount: t.failureCount,
    }));
  }

  /**
   * 导出追踪数据（可持久化，下次加载时恢复）
   */
  exportTrackingData(): Record<string, {
    lastSuccessfulRule: SelectorRule | null;
    failureCount: number;
  }> {
    const data: Record<string, any> = {};
    this.tracked.forEach((t, key) => {
      data[key] = {
        lastSuccessfulRule: t.lastSuccessfulRule,
        failureCount: t.failureCount,
      };
    });
    return data;
  }

  /**
   * 导入追踪数据（从持久化存储恢复）
   */
  importTrackingData(data: Record<string, any>): void {
    Object.entries(data).forEach(([key, value]) => {
      if (this.tracked.has(key)) {
        const t = this.tracked.get(key)!;
        t.lastSuccessfulRule = value.lastSuccessfulRule;
        t.failureCount = value.failureCount;
      }
    });
  }

  // ==================== 私有方法 ====================

  /**
   * 基于签名在 DOM 中搜索相似元素
   */
  private searchBySignature(tracked: TrackedElement): string | null {
    const sig = tracked.signature;
    if (!sig) return null;

    // 在相同标签名下搜索
    const candidates = this.selector.document.querySelectorAll(sig.tagName);
    let bestMatch: Element | null = null;
    let bestScore = 0;

    for (const candidate of candidates) {
      const candidateSig = this.buildSignature(candidate);
      const score = this.calculateSignatureSimilarity(sig, candidateSig);

      if (score > bestScore && score > 0.4) {
        bestScore = score;
        bestMatch = candidate;
      }
    }

    return bestMatch ? (bestMatch.textContent ?? '').trim() : null;
  }

  /**
   * 查找匹配提取结果的元素
   */
  private findMatchingElement(result: ExtractionResult): Element | null {
    const rule = result.matchedRule;
    if (!rule) return null;

    try {
      switch (rule.mode) {
        case 'css':
          return this.selector.document.querySelector(rule.expr);
        case 'xpath': {
          const xr = this.selector.document.evaluate(
            rule.expr, this.selector.document, null,
            XPathResult.FIRST_ORDERED_NODE_TYPE, null
          );
          return xr.singleNodeValue as Element | null;
        }
        default:
          return null;
      }
    } catch {
      return null;
    }
  }

  /**
   * 更新元素追踪记录
   */
  private updateTracking(
    group: SelectorGroup,
    result: ExtractionResult,
    el: Element | null
  ): void {
    const existing = this.tracked.get(group.name);
    const signature = el ? this.buildSignature(el) : null;

    this.tracked.set(group.name, {
      name: group.name,
      originalRules: group.rules,
      signature: signature ?? existing?.signature ?? null,
      lastSuccessfulRule: result.matchedRule ?? existing?.lastSuccessfulRule ?? null,
      lastSuccessAt: Date.now(),
      failureCount: 0,
    });
  }

  /**
   * 记录提取失败
   */
  private recordFailure(group: SelectorGroup): void {
    const existing = this.tracked.get(group.name);
    if (existing) {
      existing.failureCount++;
    } else {
      this.tracked.set(group.name, {
        name: group.name,
        originalRules: group.rules,
        signature: null,
        lastSuccessfulRule: null,
        lastSuccessAt: 0,
        failureCount: 1,
      });
    }
  }

  /**
   * 构建元素的完整结构签名
   */
  private buildSignature(el: Element): ElementSignature {
    // 祖先路径
    const ancestorPath: string[] = [];
    let current: Element | null = el.parentElement;
    while (current) {
      ancestorPath.unshift(current.tagName.toLowerCase());
      current = current.parentElement;
    }

    // 子元素标签分布
    const childTagDistribution: Record<string, number> = {};
    Array.from(el.children).forEach(child => {
      const tag = child.tagName.toLowerCase();
      childTagDistribution[tag] = (childTagDistribution[tag] || 0) + 1;
    });

    // 文本特征
    const text = (el.textContent ?? '').trim();
    const textLenBucket = Math.floor(text.length / 50);
    const textPrefixHash = text.slice(0, 50).replace(/\s/g, '');

    // 关键属性哈希
    const keyAttrs = ['href', 'src', 'id', 'data-url', 'data-id', 'alt', 'title'];
    const keyAttrParts = keyAttrs
      .map(attr => el.getAttribute(attr))
      .filter(Boolean)
      .join('|');

    // 同级位置
    let siblingIndex = 0;
    const parent = el.parentElement;
    if (parent) {
      const siblings = parent.children;
      for (let i = 0; i < siblings.length; i++) {
        if (siblings[i] === el) {
          siblingIndex = i;
          break;
        }
      }
    }

    return {
      tagName: el.tagName.toLowerCase(),
      classList: Array.from(el.classList),
      parentTag: el.parentElement?.tagName.toLowerCase() ?? '',
      ancestorPath,
      depth: ancestorPath.length,
      attributeKeys: Array.from(el.attributes).map(a => a.name),
      keyAttributeHash: keyAttrParts,
      childTagDistribution,
      textLenBucket,
      textPrefixHash,
      siblingIndex,
    };
  }

  /**
   * 计算两个元素签名的加权相似度
   */
  private calculateSignatureSimilarity(
    a: ElementSignature,
    b: ElementSignature
  ): number {
    const weights = {
      tagName: 0.15,
      classList: 0.20,
      parentTag: 0.10,
      ancestorPath: 0.10,
      keyAttributeHash: 0.15,
      childTagDistribution: 0.10,
      textLenBucket: 0.05,
      siblingIndex: 0.05,
      depth: 0.10,
    };

    const scores: number[] = [];

    // 标签名
    scores.push(a.tagName === b.tagName ? weights.tagName : 0);

    // 类名 Jaccard
    const clsIntersection = a.classList.filter(c => b.classList.includes(c)).length;
    const clsUnion = new Set([...a.classList, ...b.classList]).size;
    scores.push(clsUnion > 0 ? (clsIntersection / clsUnion) * weights.classList : 0);

    // 父标签
    scores.push(a.parentTag === b.parentTag ? weights.parentTag : 0);

    // 祖先路径（后缀匹配度）
    const minLen = Math.min(a.ancestorPath.length, b.ancestorPath.length);
    let pathMatch = 0;
    for (let i = 1; i <= minLen; i++) {
      if (a.ancestorPath[a.ancestorPath.length - i] === b.ancestorPath[b.ancestorPath.length - i]) {
        pathMatch++;
      }
    }
    scores.push(minLen > 0 ? (pathMatch / minLen) * weights.ancestorPath : 0);

    // 关键属性哈希
    scores.push(
      a.keyAttributeHash && a.keyAttributeHash === b.keyAttributeHash
        ? weights.keyAttributeHash
        : 0
    );

    // 子元素分布 Cosine
    const allChildTags = new Set([
      ...Object.keys(a.childTagDistribution),
      ...Object.keys(b.childTagDistribution),
    ]);
    let dotProduct = 0;
    let normA = 0;
    let normB = 0;
    for (const tag of allChildTags) {
      const va = a.childTagDistribution[tag] || 0;
      const vb = b.childTagDistribution[tag] || 0;
      dotProduct += va * vb;
      normA += va * va;
      normB += vb * vb;
    }
    const childSim = normA > 0 && normB > 0
      ? dotProduct / (Math.sqrt(normA) * Math.sqrt(normB))
      : 0;
    scores.push(childSim * weights.childTagDistribution);

    // 文本长度区间
    scores.push(a.textLenBucket === b.textLenBucket ? weights.textLenBucket : 0);

    // 同级位置
    scores.push(a.siblingIndex === b.siblingIndex ? weights.siblingIndex : 0);

    // 深度
    scores.push(a.depth === b.depth ? weights.depth : 0);

    return scores.reduce((sum, s) => sum + s, 0);
  }
}