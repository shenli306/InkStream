/**
 * 封面获取与占位图喵~
 *
 * fetchCoverFromOtherSources 会遍历 PROVIDERS，
 * 从其它书源反查同一本书的封面。
 */
import type { Novel } from '../../types';
import { PROVIDERS } from './registry';
import { isPlaceholderCoverUrl } from './shared/fetcher';

export const generatePlaceholderCover = (title: string, author: string): string => {
  const canvas = document.createElement('canvas');
  canvas.width = 300;
  canvas.height = 400;
  const ctx = canvas.getContext('2d');
  if (!ctx) return '';

  // 绘制蓝粉渐变背景
  const gradient = ctx.createLinearGradient(0, 0, 300, 400);
  gradient.addColorStop(0, '#ff9ece'); // 猫娘粉
  gradient.addColorStop(1, '#82c3f9'); // 猫娘蓝
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, 300, 400);

  // 绘制装饰性小猫爪或边框 (可选，这里先画个简约边框)
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.5)';
  ctx.lineWidth = 10;
  ctx.strokeRect(15, 15, 270, 370);

  // 绘制标题
  ctx.fillStyle = '#ffffff';
  ctx.shadowColor = 'rgba(0, 0, 0, 0.2)';
  ctx.shadowBlur = 10;
  
  // 标题自动换行处理
  ctx.font = 'bold 28px "Microsoft YaHei", sans-serif';
  ctx.textAlign = 'center';
  const words = title.split('');
  let line = '';
  let y = 150;
  for (let n = 0; n < words.length; n++) {
    const testLine = line + words[n];
    const metrics = ctx.measureText(testLine);
    if (metrics.width > 220 && n > 0) {
      ctx.fillText(line, 150, y);
      line = words[n];
      y += 40;
    } else {
      line = testLine;
    }
  }
  ctx.fillText(line, 150, y);

  // 绘制作者
  ctx.font = '18px "Microsoft YaHei", sans-serif';
  ctx.fillText(author === '未知' ? '佚名' : author, 150, y + 60);

  // 底部加个可爱的标记
  ctx.font = '14px "Microsoft YaHei", sans-serif';
  ctx.fillText('InkStream 喵~', 150, 370);

  return canvas.toDataURL('image/png');
};

/**
 * 尝试从其他书源获取封面喵~
 */
export const fetchCoverFromOtherSources = async (novel: Novel): Promise<string | null> => {
  console.log(`[Cover] 正在为《${novel.title}》尝试从其他源抓取封面喵~`);
  // 排除掉已经确认为空的本地书库
  const otherProviders = PROVIDERS.filter(p => p.key !== 'local');
  
  // 并发搜索，提高效率喵~
  const searchPromises = otherProviders.map(async (provider) => {
    try {
      const results = await provider.search(novel.title);
      const match = results.find(n => n.title === novel.title && 
        (n.author.includes(novel.author) || novel.author.includes(n.author) || n.author === '未知' || novel.author === '未知'));
      if (match && match.coverUrl && !isPlaceholderCoverUrl(match.coverUrl)) {
        return match.coverUrl;
      }
    } catch (e) {
      // 忽略单个源失败
    }
    return null;
  });

  const results = await Promise.all(searchPromises);
  let foundCover = results.find(url => url !== null);
  
  // 如果其他书源都没找到，动用浏览器搜索绝招喵~
  if (!foundCover) {
    foundCover = await fetchCoverFromBrowser(novel.title, novel.author);
  }
  
  if (foundCover) {
    // console.log(`[Cover] 找到了封面喵！URL: ${foundCover}`);
  }
  return foundCover;
};

/**
 * 最后的绝招：去浏览器（豆瓣/百度）搜寻封面喵~
 */
export const fetchCoverFromBrowser = async (title: string, author: string): Promise<string | null> => {
  try {
    console.log(`[Cover] 正在通过浏览器为《${title}》寻找封面喵~`);
    const response = await fetch(`/api/browser-cover?title=${encodeURIComponent(title)}&author=${encodeURIComponent(author)}`);
    const data = await response.json();
    if (data.success && data.coverUrl) {
      return data.coverUrl;
    }
  } catch (e) {
    console.warn("[Cover] Browser cover search failed喵~", e);
  }
  return null;
};
