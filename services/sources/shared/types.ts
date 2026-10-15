/**
 * 书源共享类型喵~
 */
import type { Novel, Chapter } from '../../../types';

export interface SourceProvider {
  key: string;
  name: string;
  baseUrl: string;
  search: (keyword: string) => Promise<Novel[]>;
  getDetails: (novel: Novel) => Promise<Novel>;
  getChapterContent?: (chapter: Chapter) => Promise<string>;
}

/** 内部使用的 provider 集合 */
export type ProviderList = SourceProvider[];
