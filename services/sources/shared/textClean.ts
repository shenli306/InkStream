/**
 * 章节正文的通用残渣清洗（各书源共用）喵~
 *
 * 背景：书库阁这类站点把翻页导航直接塞进正文容器里：
 *   <a href="javascript:;" onclick="vote(18756);">投推荐票</a>
 *   <a href="/book/18756/4015766.html">上一章</a> &larr;
 *   <a href="http://www.shukuge.com/book/18756/index.html">章节目录</a> &rarr;
 *   <a href="/book/18756/4015768.html">下一章</a> <a href="#">加入书签</a>
 * provider 里都只 remove 掉 <a>，但两个箭头实体（← →）是**文本节点**，会活下来
 * 并单独成行（实测书库阁每章首尾各一行「←  →」），或者和正文挤在同一行。
 *
 * 三个角度兜住它：
 *   ① 行内夹着的箭头（导航和正文被挤在一行）→ 换成空格；
 *   ② 行首行尾粘着的箭头/竖线/项目符号等装饰 → 裁掉；
 *   ③ 整行只有符号、既没文字也没数字 → 整行丢掉。
 *
 * 注意：**不能**把 `「」“”，。` 这类 CJK 标点当装饰，否则会啃掉正文喵~
 */

/** 箭头族（U+2190–U+21FF 等）喵~ */
const ARROW = new RegExp('[\u2190-\u21FF\u27F0-\u27FF\u2900-\u297F\u2B00-\u2BFF]', 'u');

/** 行内夹着的箭头：连同两侧空白一起换成空格（「上一章 ← 目录 → 下一章」→「上一章 目录 下一章」） */
const INLINE_ARROWS = /[\s\u2190-\u21FF\u27F0-\u27FF\u2900-\u297F\u2B00-\u2BFF\u25A0-\u25FF\u2022\u2023\u00B7\u203B\u3000|\uFF5C/\\]*[\u2190-\u21FF\u27F0-\u27FF\u2900-\u297F\u2B00-\u2BFF][\s\u2190-\u21FF\u27F0-\u27FF\u2900-\u297F\u2B00-\u2BFF\u25A0-\u25FF\u2022\u2023\u00B7\u203B\u3000|\uFF5C/\\]*/gu;

/** 行首/行尾的装饰（箭头、竖线、项目符号、※、斜杠、空白；不含任何标点字母数字） */
const EDGE_DECORATION = /^[\s\u2190-\u21FF\u27F0-\u27FF\u2900-\u297F\u2B00-\u2BFF\u25A0-\u25FF\u2022\u2023\u00B7\u203B\u3000|\uFF5C/\\]+|[\s\u2190-\u21FF\u27F0-\u27FF\u2900-\u297F\u2B00-\u2BFF\u25A0-\u25FF\u2022\u2023\u00B7\u203B\u3000|\uFF5C/\\]+$/gu;

/** 整行既没有文字（含 CJK）也没有数字 → 纯装饰行 */
const SYMBOL_ONLY_LINE = /^[^\p{L}\p{N}]+$/u;

/** 行内箭头换成空格，并把因此产生的连续空格压成一个 */
export function stripInlineArrows(line: string): string {
  if (!ARROW.test(line)) return line;
  return line.replace(INLINE_ARROWS, ' ').replace(/[ \t]{2,}/g, ' ');
}

/** 裁掉行首行尾的箭头/装饰符号，中间文字原样保留 */
export function stripEdgeDecoration(line: string): string {
  return line.replace(EDGE_DECORATION, '').trim();
}

/** 该行是否只是装饰（或空行）→ 应从正文里丢弃 */
export function isDecorationLine(line: string): boolean {
  const t = line.trim();
  if (t.length === 0) return true;
  return SYMBOL_ONLY_LINE.test(t);
}

/** 逐行清洗：行内箭头 → 空格，行首尾装饰 → 裁掉，纯装饰行/空行 → 丢掉喵~ */
export function cleanChapterLines(lines: string[]): string[] {
  return lines
    .map(line => stripEdgeDecoration(stripInlineArrows(line)))
    .filter(line => !isDecorationLine(line));
}
