# Legado 书源转换器

`services/legadoConverter.ts` 将阅读/Legado 格式的书源 JSON 转成 InkStream 可用的标准配置和 provider。

## 在 InkStream 中导入

1. 在小说搜索框输入 `3068`，打开“书源配置”。
2. 点击“导入阅读书源”，选择阅读导出的 `.json` 文件。
3. 确认新书源右侧开关已打开，然后点击左侧光圈保存并返回。
4. 像平常一样搜索书名。导入书源会和内置书源一起搜索，搜索结果可继续查看目录、阅读和打包 EPUB。

支持导入单个书源 JSON，也支持阅读导出的书源数组。导入内容保存在浏览器的 `localStorage` 中；垃圾桶按钮只删除对应的导入书源。

## 代码调用

```ts
import sourceJson from './huanmeng.json';
import { createLegadoProvider } from './services/legadoConverter';

const provider = createLegadoProvider(sourceJson);
const results = await provider.search('小说名');
const novel = await provider.getDetails(results[0]);
const content = await provider.getChapterContent(novel.chapters[0]);
```

如果 JSON 是字符串：

```ts
import { convertLegadoJson, createLegadoProvider } from './services/legadoConverter';

const config = convertLegadoJson(rawJson);
const provider = createLegadoProvider(config);
```

转换器支持常见 Legado 规则：

- `@text`、`@href`、`@src`、`@data-original`
- `##` 清理规则
- `text.链接文字@href`
- `.class.0` 的第一个元素写法
- `{{key}}` 搜索关键词占位符
- 相对 URL 自动转换为绝对 URL
- `ruleBookInfo.tocUrl` 目录页跳转
- `nextTocUrl` 目录分页
- `nextContentUrl` 正文分页
- `@js: JSON.stringify({...})` 格式的静态请求头

`<js>...</js>` 规则会被安全忽略，正文和字段仍会进行基础清理。需要复杂 JavaScript 后处理时，应在 provider 外层增加显式的 TypeScript 后处理函数。

转换器默认通过 `/api/proxy` 拉取网页，也可以注入自定义 `fetchHtml`，用于服务端抓取、Cookie 或特殊编码处理。
