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
