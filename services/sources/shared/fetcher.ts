/**
 * HTTP 抓取与代理 URL 构造喵~
 *
 * 请求策略（见 getRequestUrls）：
 *   1. 跨域 → 走 /api/proxy（本地与生产统一）
 *   2. 兜底 → 直连目标站
 */
import type { Novel } from '../../../types';

import { WANBENGE_URL } from './constants';
import { acquireHostSlot, acquireGlobalSlot, hostOf } from './ratelimit';

/**
 * 全局取消信号喵~
 *
 * 用户点「取消下载」时，希望**在途的抓取请求**立刻断掉，而不是干等 15s 超时。
 * provider 层不传 signal（7 个 provider 全要改签名，收益不成正比），
 * 所以这里放一个模块级的活动信号：
 *   registerAbortSignal(controller.signal)  下载开始
 *   clearAbortSignal(controller.signal)     下载结束 / 取消
 * 同一时刻只会有一个下载任务（UI 上也是单任务），所以不会有互相干扰喵~
 */
let activeAbortSignal: AbortSignal | null = null;

export const registerAbortSignal = (signal: AbortSignal | null) => { activeAbortSignal = signal; };
export const clearAbortSignal = (signal?: AbortSignal | null) => {
  if (!signal || activeAbortSignal === signal) activeAbortSignal = null;
};
export const isAbortRequested = () => activeAbortSignal?.aborted === true;
const abortError = () => new DOMException('Request aborted by user', 'AbortError');

export const getRequestUrls = (targetUrl: string): string[] => {
  if (typeof window === 'undefined') return [targetUrl];

  const target = new URL(targetUrl);
  const sameOrigin = target.origin === window.location.origin;
  const apiProxyUrl = `/api/proxy?url=${encodeURIComponent(targetUrl)}`;

  // Next.js 迁移后 vite 时代的 /proxy/<site> 中间件已不存在，
  // 本地与生产统一走 /api/proxy 喵~
  return sameOrigin ? [targetUrl] : [apiProxyUrl, targetUrl];
};

export const fetchText = async (url: string, options?: RequestInit, encoding = 'utf-8'): Promise<string> => {
  if (isAbortRequested()) throw abortError();

  if (url.startsWith('/')) {
    console.log(`[Fetch] Local request: ${url}喵~`);
    const response = await fetch(url, options);
    if (!response.ok) throw new Error(`HTTP ${response.status} for ${url}`);
    const buffer = await response.arrayBuffer();
    const decoder = new TextDecoder(encoding === 'gbk' ? 'gb18030' : encoding);
    return decoder.decode(buffer);
  }

  const targetUrl = url.startsWith('http') ? url : `${WANBENGE_URL}${url.startsWith('/') ? '' : '/'}${url}`;

  if (targetUrl.includes('jizai22.com')) {
    const searchDelay = Math.random() * 300 + 200;
    await new Promise(resolve => setTimeout(resolve, searchDelay));
  }

  let lastError: unknown;

  for (const requestUrl of getRequestUrls(targetUrl)) {
    if (isAbortRequested()) throw abortError();

    const external = activeAbortSignal;

    // 全局限流 + 按 host 串行闸门喵~
    // 浏览器端才需要（Node 端没有并发连接数限制，也不该被 UI 拖慢）喵~
    // 顺序很关键：**先排队拿到闸门，再起 15s 超时**。
    // 反过来的话，多章书（如 45 章）排队时排在后面的请求会在还没发出请求时
    // 就把 15s 预算烧完、被 abort 掉，表现成大量「获取章节内容失败」+ AbortError 重试喵~
    const isBrowser = typeof window !== 'undefined';
    const releaseGlobal = isBrowser ? await acquireGlobalSlot(external) : () => {};
    const releaseHost = isBrowser ? await acquireHostSlot(hostOf(targetUrl) || 'unknown', external) : () => {};

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 15000);
    // 外部取消（用户点了取消下载）→ 立刻掐断本次请求喵~
    const onExternalAbort = () => controller.abort();
    if (external) {
      if (external.aborted) controller.abort();
      else external.addEventListener('abort', onExternalAbort, { once: true });
    }

    try {
      if (isAbortRequested()) throw abortError();
      const target = new URL(targetUrl);
      const headers = {
        'User-Agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.0 Mobile/15E148 Safari/604.1',
        'Referer': `${target.protocol}//${target.host}/`,
        ...(options?.headers || {})
      };
      const response = await fetch(requestUrl, {
        ...options,
        headers,
        signal: controller.signal
      });

      if (!response.ok) throw new Error(`HTTP ${response.status}`);

      const buffer = await response.arrayBuffer();
      if (buffer.byteLength < 10) throw new Error('Empty response');

      const decoder = new TextDecoder(encoding === 'gbk' ? 'gb18030' : encoding);
      const text = decoder.decode(buffer);
      if (text.includes('Just a moment...') || text.includes('Attention Required! | Cloudflare') || (text.length < 200 && !text.includes('html'))) {
        throw new Error('Anti-bot page detected');
      }

      return text;
    } catch (error) {
      lastError = error;
      console.warn(`Request failed for ${targetUrl}:`, error);
      // 取消：不再尝试下一个 URL，直接冒泡（finally 仍会释放闸门）喵~
      if (isAbortRequested()) throw error;
    } finally {
      clearTimeout(timeoutId);
      external?.removeEventListener('abort', onExternalAbort);
      releaseHost();
      releaseGlobal();
    }
  }

  throw lastError || new Error('Request failed');
};

// Helper to fetch blob (for download)
export const fetchBlob = async (url: string): Promise<Blob> => {
  if (isAbortRequested()) throw abortError();

  if (url.startsWith('/')) {
    const response = await fetch(url);
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return await response.blob();
  }

  const targetUrl = url.startsWith('http') ? url : `${WANBENGE_URL}${url.startsWith('/') ? '' : '/'}${url}`;

  const external = activeAbortSignal;
  const controller = new AbortController();
  const onExternalAbort = () => controller.abort();
  if (external) {
    if (external.aborted) controller.abort();
    else external.addEventListener('abort', onExternalAbort, { once: true });
  }

  try {
    const response = await fetch(`/api/proxy?url=${encodeURIComponent(targetUrl)}`, {
      signal: controller.signal,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Referer': new URL(targetUrl).origin + '/',
      }
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return await response.blob();
  } catch (e) {
    if (isAbortRequested()) throw abortError();
    console.error(`Blob fetch failed`, e);
    throw new Error("Download failed");
  } finally {
    external?.removeEventListener('abort', onExternalAbort);
  }
};

export const isUrl = (str: string) => {
    try {
        new URL(str);
        return true;
    } catch {
        return false;
    }
};

export const proxifyImage = (url: string) => {
  if (!url) return '';
  
  if (url.startsWith('/api/proxy?url=')) return url;
  
  let decodedUrl = url;
  try {
    decodedUrl = decodeURIComponent(url);
  } catch {}
  
  if (url.startsWith('//')) return `https:${url}`;
  if (url.startsWith('http://') || url.startsWith('https://')) {
    const checkUrl = decodedUrl.toLowerCase();
    if (checkUrl.includes('321cdn.com') || 
        checkUrl.includes('alicdn.com') || 
        checkUrl.includes('taobao.org') ||
        checkUrl.includes('alipay.com') ||
        checkUrl.includes('doubaocdn.com') ||
        checkUrl.includes('aka.doubaocdn.com')) {
      return decodedUrl;
    }
    return `/api/proxy?url=${encodeURIComponent(url)}`;
  }

  return `/api/proxy?url=${encodeURIComponent(url)}`;
};

export const isPlaceholderCoverUrl = (url: string) => {
  if (!url) return true;
  let decoded = url;
  try {
    decoded = decodeURIComponent(url);
  } catch {
  }
  const lower = decoded.toLowerCase();
  return lower.includes('nocover') || lower.includes('no-cover') || lower.includes('nopic') ||
    lower.includes('noimage') || lower.includes('default') || lower.includes('placeholder') ||
    decoded.includes('暂无封面');
};

