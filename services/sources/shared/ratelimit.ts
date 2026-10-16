/**
 * 按主机名的请求节流闸门喵~
 *
 * 为什么需要它：
 *   之前唯一的节流是 fetchText 里写死的 "jizai22.com 随机延迟"，
 *   全本文学 / 其他源都是裸奔。下载一整本书是 1000+ 次请求，
 *   高并发 + 零间隔会直接触发站点封 IP（bqgicq 已被封过一次）。
 *
 * 设计：
 *   - 以 hostname 为粒度，每个 host 独立一条队列
 *   - 保证「同一 host 的两次请求间隔 >= minInterval」
 *   - 关键点：间隔是在「上一个请求**完成**后」才开始计时的，
 *     所以慢响应天然会拉长队列，不会堆积成突发流量
 *   - 后端 / 服务端调用无队列（那里跑的是 Node 的 http，不受浏览器并发限制）
 */

type HostState = {
  /** 上一个请求完成的时间戳 */
  lastFinishedAt: number;
  /** 串行链，保证同一 host 不并发发起 */
  chain: Promise<void>;
  /** 累计请求数，用于观测 */
  count: number;
};

const hostStates = new Map<string, HostState>();

/**
 * 每个 host 的最小请求间隔（毫秒）喵~
 * 没列出的 host 用 DEFAULT_INTERVAL。
 */
const HOST_INTERVALS: Record<string, number> = {
  // 全本文学：实测可承受较高并发，但 1000+ 章不能裸奔喵~
  'www.qbwx.org': 350,
  // 书库阁：证书过期 + 老站，慢慢来喵~
  'www.shukuge.com': 500,
  // 完本阁对频率限制非常严格喵~
  'www.jizai22.com': 600,
  'www.yizai22.com': 600,
  // 爱丽丝书屋：要代理，连接本身很慢喵~
  'www.alicesw.com': 500,
};

const DEFAULT_INTERVAL = 250;

const sleep = (ms: number) => new Promise<void>(resolve => setTimeout(resolve, ms));

const getInterval = (host: string): number => HOST_INTERVALS[host] ?? DEFAULT_INTERVAL;

/**
 * 在真正发起请求前调用，会把调用点挂到该 host 的串行队列上喵~
 *
 * 用法：
 *   const release = await acquireHostSlot(host);
 *   try { ...fetch... } finally { release(); }
 *
 * 这样「上一个请求完成」的时间戳才准确，间隔才不会被慢响应吃掉。
 */
export const acquireHostSlot = async (host: string): Promise<() => void> => {
  let state = hostStates.get(host);
  if (!state) {
    state = { lastFinishedAt: 0, chain: Promise.resolve(), count: 0 };
    hostStates.set(host, state);
  }

  // 把自己接到队尾喵~
  const previous = state.chain;
  let releaseSlot!: () => void;
  state.chain = new Promise<void>(resolve => { releaseSlot = resolve; });

  await previous;

  const interval = getInterval(host);
  const sinceLast = Date.now() - state.lastFinishedAt;
  if (sinceLast < interval) {
    await sleep(interval - sinceLast);
  }

  state.count++;

  return () => {
    state!.lastFinishedAt = Date.now();
    releaseSlot();
  };
};

/** 把 URL 归一成 hostname 键；非法 URL 返回空串（不节流）喵~ */
export const hostOf = (url: string): string => {
  try {
    return new URL(url, 'https://placeholder.invalid').hostname;
  } catch {
    return '';
  }
};

/**
 * 全局最大在途请求数（跨 host）喵~
 * 下载 1000+ 章时防止把浏览器 / 代理打爆。
 */
let inflight = 0;
let maxInflight = 6;

export const setMaxInflight = (n: number) => { maxInflight = Math.max(1, n); };
export const getInflight = () => inflight;

export const acquireGlobalSlot = async (): Promise<() => void> => {
  while (inflight >= maxInflight) {
    await sleep(50);
  }
  inflight++;
  return () => { inflight--; };
};

/** 观测用：当前各 host 的请求计数喵~ */
export const getHostStats = (): Record<string, number> => {
  const out: Record<string, number> = {};
  hostStates.forEach((v, k) => { out[k] = v.count; });
  return out;
};
