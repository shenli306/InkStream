import { JSDOM } from 'jsdom';
import JSZip from 'jszip';
import { writeFile } from 'node:fs/promises';
import { convertLegadoSource, createLegadoProvider, type LegadoBookSource } from '../services/legadoConverter.ts';
import { generateEpub } from '../services/epub.ts';

(globalThis as any).DOMParser = new JSDOM('').window.DOMParser;
(globalThis as any).Element = new JSDOM('').window.Element;

const source: LegadoBookSource = {
  bookSourceName: '幻梦轻小说',
  bookSourceUrl: 'https://www.huanmengacg.com',
  searchUrl: '/index.php/book/search?action=search&key={{key}}',
  header: '@js: \nJSON.stringify({\n  "User-Agent": "InkStream-Test"\n})',
  ruleSearch: {
    bookList: '.boxbd@.common-list',
    bookUrl: 'a@href',
    coverUrl: 'img@data-original',
    name: 'dt@text',
    author: '.book-module@text##··.*',
    intro: '.book-profile@text',
    kind: '.book-module@text##.*··',
  },
  ruleBookInfo: {
    name: '.book-title@text',
    author: '.book-metas.0@text##作者：',
    coverUrl: 'dt@img@src',
    intro: '.book-summary@text',
    tocUrl: 'text.章节列表@href',
  },
  ruleToc: {
    chapterList: '#chapterlist li a',
    chapterName: 'text',
    chapterUrl: 'href',
    nextTocUrl: 'text.下一页@href',
  },
  ruleContent: {
    content: '#BookText@p@text##本文来自 幻梦轻小说',
    nextContentUrl: 'text.下一页@href',
  },
};

const pages: Record<string, string> = {
  'https://www.huanmengacg.com/index.php/book/search?action=search&key=%E6%B5%8B%E8%AF%95': `
    <div class="boxbd"><div class="common-list">
      <a href="/book/1"><img data-original="/covers/1.jpg"></a>
      <dt>测试轻小说</dt>
      <div class="book-module">作者甲··奇幻</div>
      <div class="book-profile">搜索简介</div>
    </div></div>`,
  'https://www.huanmengacg.com/book/1': `
    <dt><img src="/covers/detail.jpg"></dt>
    <h1 class="book-title">测试轻小说完整版</h1>
    <div class="book-metas">作者：作者甲</div>
    <div class="book-metas">分类：奇幻</div>
    <div class="book-summary">详情简介</div>
    <a href="/book/1/chapters">章节列表</a>`,
  'https://www.huanmengacg.com/book/1/chapters': `
    <ul id="chapterlist">
      <li><a href="/chapter/1">第一章 开始</a></li>
      <li><a href="/chapter/2">第二章 继续</a></li>
    </ul>
    <a href="/book/1/chapters/2">下一页</a>`,
  'https://www.huanmengacg.com/book/1/chapters/2': `
    <ul id="chapterlist">
      <li><a href="/chapter/3">第三章 结束</a></li>
    </ul>`,
  'https://www.huanmengacg.com/chapter/1': `
    <div id="BookText"><p>第一段正文</p><p>第二段正文</p><p>本文来自 幻梦轻小说</p></div>
    <a href="/chapter/1/2">下一页</a>`,
  'https://www.huanmengacg.com/chapter/1/2': `
    <div id="BookText"><p>第三段正文</p></div>`,
  'https://www.huanmengacg.com/chapter/2': `
    <div id="BookText"><p>第二章正文内容，用于验证 EPUB 章节不是空文件。</p></div>`,
  'https://www.huanmengacg.com/chapter/3': `
    <div id="BookText"><p>第三章正文内容，故事在这里结束。</p></div>`,
};

const requested: string[] = [];
const provider = createLegadoProvider(source, async (url, headers) => {
  requested.push(`${url}|${headers?.['User-Agent'] || ''}`);
  const html = pages[url];
  if (!html) throw new Error(`Unexpected URL: ${url}`);
  return html;
});

const assert = (condition: unknown, message: string) => {
  if (!condition) throw new Error(message);
};

const config = convertLegadoSource(source);
assert(config.name === '幻梦轻小说', 'source name conversion failed');
assert(config.headers['User-Agent'] === 'InkStream-Test', 'header conversion failed');

const results = await provider.search('测试');
assert(results.length === 1, 'search result count failed');
assert(results[0].title === '测试轻小说', 'title extraction failed');
assert(results[0].author === '作者甲', 'author cleanup failed');
assert(results[0].coverUrl === 'https://www.huanmengacg.com/covers/1.jpg', 'cover URL conversion failed');

const novel = await provider.getDetails(results[0]);
assert(novel.title === '测试轻小说完整版', 'detail title extraction failed');
assert(novel.author === '作者甲', 'indexed author extraction failed');
assert(novel.chapters.length === 3, 'chapter extraction or TOC pagination failed');
assert(novel.chapters[0].url === 'https://www.huanmengacg.com/chapter/1', 'chapter URL conversion failed');

const content = await provider.getChapterContent(novel.chapters[0]);
assert(content === '第一段正文\n\n第二段正文\n\n第三段正文', 'content extraction, cleanup, or pagination failed');
assert(requested.every(item => item.endsWith('|InkStream-Test')), 'custom header forwarding failed');

const chaptersWithContent = await Promise.all(novel.chapters.map(async chapter => ({
  ...chapter,
  content: await provider.getChapterContent(chapter),
})));
const completeNovel = { ...novel, chapters: chaptersWithContent };
const epubBlob = await generateEpub(completeNovel);
const epubBytes = Buffer.from(await epubBlob.arrayBuffer());
const outputUrl = new URL('../output/legado-pipeline-test.epub', import.meta.url);
await writeFile(outputUrl, epubBytes);

const epub = await JSZip.loadAsync(epubBytes);
const chapterFiles = Object.keys(epub.files).filter(name => /^OEBPS\/chapter_\d+\.xhtml$/.test(name));
assert(chapterFiles.length === novel.chapters.length, 'EPUB chapter file count failed');
const verifiedChapters = await Promise.all(chapterFiles.map(async name => {
  const xhtml = await epub.file(name)?.async('string');
  assert(xhtml && /<p>[^<]{4,}<\/p>/.test(xhtml), `EPUB chapter has no content: ${name}`);
  return { name, textLength: (xhtml || '').replace(/<[^>]+>/g, '').trim().length };
}));

console.log(JSON.stringify({
  passed: true,
  source: config.name,
  searchResults: results.length,
  chapters: novel.chapters.length,
  content,
  epub: {
    path: outputUrl.pathname.replace(/^\/[A-Za-z]:/, match => match.slice(1)),
    bytes: epubBytes.length,
    chapters: verifiedChapters,
  },
  requestedUrls: requested.map(item => item.split('|')[0]),
}, null, 2));
