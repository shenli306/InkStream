/**
 * 书源共享常量喵~
 * 各站点的 base URL、搜索缓存、类型定义。
 */
import type { Novel } from '../../../types';

export const WANBENGE_URL = 'https://www.jizai22.com';
export const BASE_URL = 'https://www.jizai22.com'; // Fallback
export const SHIJIEMINGZHU_URL = 'https://www.shijiemingzhu.com';
export const SHUKUGE_URL = 'http://www.shukuge.com';
export const DINGDIAN_URL = 'https://www.23ddw.net';
export const BQGUI_URL = 'https://www.bqgicq.cc';
export const BQGUI_HOSTS = new Set(['www.bqgicq.cc', 'bqgicq.cc', 'www.bqgui.cc', 'bqgui.cc']);
export const ALICESW_URL = 'https://www.alicesw.com';

/** 搜索缓存：避免重复请求，5 分钟过期喵~ */
export const searchCache = new Map<string, { results: Novel[]; timestamp: number }>();
export const CACHE_DURATION = 5 * 60 * 1000; // 5分钟喵~

/** 站点标识 */
export type SourceKey = 'wanbenge' | 'local' | 'shukuge' | 'dingdian' | 'bqgui' | 'alicesw';
