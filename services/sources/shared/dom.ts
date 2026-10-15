/**
 * DOM 解析工具喵~
 *
 * 注意：依赖 DOMParser，仅在浏览器环境可用。
 * 服务端（Vercel/Node）没有 DOMParser —— 见 docs/source-vercel-options.md。
 */
export const parseHTML = (html: string) => new DOMParser().parseFromString(html, 'text/html');
