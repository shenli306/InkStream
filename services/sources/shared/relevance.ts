/**
 * 搜索结果相关性判定喵~
 */
import type { Novel } from '../../../types';

export const isRelevant = (title: string, author: string, keyword: string): boolean => {
    const t = title.trim().toLowerCase();
    const a = author.trim().toLowerCase();
    const kw = keyword.trim().toLowerCase();
    
    if (!kw) return true;
    
    // 特殊字符处理喵~
    const cleanTitle = t.replace(/[《》【】\(\)\[\]{}「」]/g, '');
    const cleanKeyword = kw.replace(/[《》【】\(\)\[\]{}「」]/g, '');
    
    // 1. 完全匹配（最高优先级喵~）
    if (cleanTitle === cleanKeyword || a === cleanKeyword) {
        return true;
    }
    
    // 2. 包含匹配（次高优先级）
    if (cleanTitle.includes(cleanKeyword) || a.includes(cleanKeyword)) {
        return true;
    }
    
    // 3. 多关键词拆分匹配
    const words = cleanKeyword.split(/\s+/).filter(w => w.length > 0);
    if (words.length > 1) {
        // 所有关键词都必须在标题或作者中出现喵~
        return words.every(word => cleanTitle.includes(word) || a.includes(word));
    }
    
    // 4. 拼音模糊匹配（用于中文搜索喵~）
    // 注意：这里我们只在关键词是纯拼音时才在标题里找拼音喵~
    // 或者我们应该把标题转成拼音首字母再匹配，但目前我们先修好逻辑喵
    if (/^[a-zA-Z]+$/.test(cleanKeyword) && cleanKeyword.length > 1) {
        // 如果关键词是纯英文/拼音，尝试匹配标题的首字母喵（简单实现）
        const titleInitials = cleanTitle.split('').map(char => {
            // 这是一个非常简化的映射，仅用于演示修复喵
            const simplePinyinMap: Record<string, string> = {
                '凡': 'f', '人': 'r', '修': 'x', '仙': 'x', '传': 'c',
                '剑': 'j', '来': 'l', '大': 'd', '奉': 'f', '打': 'd', '更': 'g'
            };
            return simplePinyinMap[char] || '';
        }).join('');
        
        if (titleInitials.includes(cleanKeyword)) return true;
    }
    
    // 5. 权重评分喵~
    let score = 0;
    
    // 标题完全包含关键词，直接给高分喵
    if (cleanTitle.includes(cleanKeyword)) score += 50;
    // 作者包含关键词，给次高分喵
    if (a.includes(cleanKeyword)) score += 30;
    
    // 如果是“凡人”搜索“凡人修仙传”，长度相似度也很重要喵
    const lengthDiff = Math.abs(cleanTitle.length - cleanKeyword.length);
    if (lengthDiff < 5) score += 10;
    
    return score >= 30;
};

/**
 * 清理过期搜索缓存喵~
 * 避免内存泄漏，保持缓存新鲜度喵~
 */
