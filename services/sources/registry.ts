/**
 * 书源注册表喵~
 *
 * PROVIDERS 是「参与聚合搜索」的书源集合；
 * 注意 wanbenge / dingdian / alicesw 虽然未列入 PROVIDERS，
 * 但可通过 getProviderByName 按名字取到（见 ../api.ts）。
 */
import type { SourceProvider } from './shared/types';
import { shukugeProvider } from './providers/shukuge';
import { bqguiProvider } from './providers/bqgui';
import { localProvider } from './providers/local';

import type { LegadoBookSource } from '../legadoConverter';
import { createLegadoProvider, convertLegadoSource } from '../legadoConverter';

export const PROVIDERS: SourceProvider[] = [shukugeProvider, bqguiProvider, localProvider];
export const SOURCE_UNAVAILABLE_REASONS: Readonly<Record<string, string>> = {
  '书库阁': '站点当前不可稳定访问',
  '完本阁': '域名不可达',
  '顶点小说网': '原域名 DNS 已失效',
  '爱丽丝书屋': '站点连接持续超时',
};
export const SOURCE_DESCRIPTIONS: Readonly<Record<string, string>> = {
  '本地书库': '仅搜索已添加的本地文件',
};
const LEGADO_SOURCES_STORAGE_KEY = 'inkstream_legado_sources';
const legadoProviderKeys = new Set<string>();

const isLegadoSource = (value: unknown): value is LegadoBookSource => {
  if (!value || typeof value !== 'object') return false;
  const source = value as Partial<LegadoBookSource>;
  return Boolean(source.bookSourceName && source.bookSourceUrl && source.searchUrl);
};

const registerLegadoSource = (source: LegadoBookSource): string => {
  const config = convertLegadoSource(source);
  const provider = createLegadoProvider(config);
  const existingIndex = PROVIDERS.findIndex(item => legadoProviderKeys.has(item.key) && item.key === provider.key);
  if (existingIndex >= 0) PROVIDERS.splice(existingIndex, 1, provider);
  else PROVIDERS.push(provider);
  legadoProviderKeys.add(provider.key);
  SOURCE_ENABLED_CONFIG[provider.name] ??= source.enabled !== false;
  return provider.name;
};

export const loadLegadoSources = (): LegadoBookSource[] => {
  if (typeof localStorage === 'undefined') return [];
  try {
    const saved = localStorage.getItem(LEGADO_SOURCES_STORAGE_KEY);
    if (!saved) return [];
    const parsed: unknown = JSON.parse(saved);
    const sources = (Array.isArray(parsed) ? parsed : [parsed]).filter(isLegadoSource);
    sources.forEach(registerLegadoSource);
    return sources;
  } catch (error) {
    console.warn('[Source] Failed to load imported Legado sources', error);
    return [];
  }
};

export const importLegadoSources = (json: string): string[] => {
  const parsed: unknown = JSON.parse(json);
  const incoming = (Array.isArray(parsed) ? parsed : [parsed]).filter(isLegadoSource);
  if (incoming.length === 0) {
    throw new Error('没有找到有效的阅读书源，必须包含书源名称、地址和搜索地址');
  }

  const existing = loadLegadoSources();
  const merged = new Map(existing.map(source => [`${source.bookSourceName}\n${source.bookSourceUrl}`, source]));
  incoming.forEach(source => merged.set(`${source.bookSourceName}\n${source.bookSourceUrl}`, source));
  localStorage.setItem(LEGADO_SOURCES_STORAGE_KEY, JSON.stringify(Array.from(merged.values())));
  return incoming.map(registerLegadoSource);
};

export const removeLegadoSource = (name: string): void => {
  if (typeof localStorage === 'undefined') return;
  const remaining = loadLegadoSources().filter(source => source.bookSourceName !== name);
  localStorage.setItem(LEGADO_SOURCES_STORAGE_KEY, JSON.stringify(remaining));
  for (let index = PROVIDERS.length - 1; index >= 0; index -= 1) {
    const provider = PROVIDERS[index];
    if (provider.name === name && legadoProviderKeys.has(provider.key)) {
      legadoProviderKeys.delete(provider.key);
      PROVIDERS.splice(index, 1);
    }
  }
  delete SOURCE_ENABLED_CONFIG[name];
};

// 书源启用/禁用配置喵~ (所有书源均已启用)
export const SOURCE_ENABLED_CONFIG: Record<string, boolean> = {
  '完本阁': true,
  '书库阁': false,
  '顶点小说网': false,
  '笔趣阁(GUI)': true,
  '爱丽丝书屋': false,
  '本地书库': true
};

// 设置书源启用状态喵~
export const setSourceEnabled = (sourceName: string, enabled: boolean): void => {
  SOURCE_ENABLED_CONFIG[sourceName] = sourceName in SOURCE_UNAVAILABLE_REASONS ? false : enabled;
  try {
    localStorage.setItem('inkstream_source_config', JSON.stringify(SOURCE_ENABLED_CONFIG));
  } catch (e) {
    console.warn('[Source] Failed to save source config to localStorage喵~', e);
  }
};

// 从 localStorage 加载书源配置喵~
export const loadSourceConfig = (): Record<string, boolean> => {
  loadLegadoSources();
  // 确保默认所有书源都是启用的
  const defaultConfig: Record<string, boolean> = Object.fromEntries(
    PROVIDERS.map(provider => [
      provider.name,
      provider.name in SOURCE_UNAVAILABLE_REASONS
        ? false
        : (provider.name in SOURCE_ENABLED_CONFIG ? SOURCE_ENABLED_CONFIG[provider.name] : true),
    ])
  );
  
  // 先重置为默认配置
  Object.assign(SOURCE_ENABLED_CONFIG, defaultConfig);
  
  try {
    const saved = localStorage.getItem('inkstream_source_config');
    if (saved) {
      const parsed = JSON.parse(saved);
      // 只合并已有的书源配置，保持默认值的同时允许用户自定义
      Object.keys(parsed).forEach(key => {
        if (key in SOURCE_ENABLED_CONFIG) {
          SOURCE_ENABLED_CONFIG[key] = key in SOURCE_UNAVAILABLE_REASONS ? false : parsed[key];
        }
      });
    }
  } catch (e) {
    console.warn('[Source] Failed to load source config from localStorage喵~', e);
  }
  return SOURCE_ENABLED_CONFIG;
};
