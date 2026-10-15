/**
 * 本地书源喵~
 */
import type { Novel, Chapter } from '../../../types';
import type { SourceProvider } from '../shared/types';
import { parseHTML } from '../shared/dom';
import { fetchText } from '../shared/fetcher';

export const localProvider: SourceProvider = {
  key: 'local',
  name: '本地书库',
  baseUrl: '',
  search: async (keyword: string): Promise<Novel[]> => {
    try {
      const response = await fetch(`/api/list-downloads?keyword=${encodeURIComponent(keyword)}`);
      if (!response.ok) return [];
      const files: any[] = await response.json();

      const matched = files.filter(f => f.title.includes(keyword));

      return matched.map(f => ({
        id: f.filename,
        title: f.title,
        author: f.author || "本地下载",
        description: f.description || `已下载文件 | 大小: ${(f.size / 1024 / 1024).toFixed(2)} MB`,
        coverUrl: f.coverUrl || "",
        tags: ["本地"],
        status: 'Completed',
        detailUrl: f.url,
        chapters: f.chapters || [],
        sourceName: '本地书库'
      }));
    } catch (e) {
      console.warn("Local search failed", e);
      return [];
    }
  },
  getDetails: async (novel: Novel): Promise<Novel> => {
    return novel;
  },
  getChapterContent: async (chapter: Chapter): Promise<string> => {
    const html = await fetchText(chapter.url);
    const doc = parseHTML(html);
    const cDiv = doc.querySelector('#content, .chapter-content, .novel-content');
    if (!cDiv) throw new Error("Content not found");

    let text = cDiv.innerHTML;
    // Clean specific ads
    const ads = [
      "(http://www.shuwuwan.com/book/F72W-1.html)",
      "章节错误,点此举报(免注册)",
      "请记住本书首发域名：http://www.shuwuwan.com",
      "www.shuwuwan.com",
      "shuwuwan.com",
      "书屋湾",
      "首发域名"
    ];
    ads.forEach(ad => {
      text = text.split(ad).join('');
    });

    // Remove URLs
    text = text.replace(/https?:\/\/[^\s<>"]+|www\.[^\s<>"]+/g, '');
    // Remove brackets
    text = text.replace(/\([^)]*\)|（[^）]*）|【[^】]*】|\[[^\]]*\]|「[^」]*」|『[^』]*』/g, '');

    const tempDiv = document.createElement('div');
    tempDiv.innerHTML = text;
    tempDiv.querySelectorAll('script, div, a').forEach(el => el.remove());
    
    let content = tempDiv.innerHTML.replace(/<br\s*\/?>/gi, '\n');
    const finalDiv = document.createElement('div');
    finalDiv.innerHTML = content;
    return finalDiv.textContent?.trim() || "";
  }
};

/**
 * 为没有封面的小说生成一张漂亮的蓝粉渐变封面喵~
 */
