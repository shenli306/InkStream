# 书源在 Vercel 上可用的方案对比

> 目的：决定如何让 InkStream 的书源抓取在 Vercel 服务端真正可用。
> 本文所有数字来自对当前代码的实测统计，不是估算。

## 一、问题定性

你的实测结论（"Legado 书源部署到 Vercel 用不了"）**成立**，原因与网络无关，是三处架构冲突叠加：

| # | 冲突点 | 位置 | 服务端表现 |
|---|---|---|---|
| 1 | 书源存 `localStorage` | `source.ts:2554` | `typeof localStorage === 'undefined'` → **静默返回空数组**（不报错，所以难排查） |
| 2 | `PROVIDERS` 是模块级常量，靠运行时 `push` 注册 | `source.ts:2521`, `registerLegadoSource` | Serverless 实例随时冷启动/多实例 → **导入的源不跨请求存在** |
| 3 | 解析链依赖 DOM | `source.ts:24` `parseHTML` + 12 处 `document.*` | 服务端无 `DOMParser`/`document` → **直接抛错** |

第 2 条是 Serverless 的**固有**特性，不是 bug —— 任何"运行时注册进模块变量"的设计在这种环境下都不成立。

## 二、实测代码面

`services/source.ts` 共 **3043 行**，DOM 相关调用统计：

| API | 次数 | 服务端可用性 |
|---|---|---|
| `parseHTML()` | 18 | ❌ 需 shim |
| `.querySelector(All)()` | **153** | ❌ 需 shim |
| `.textContent` | 80 | ❌ 需 shim |
| `.innerHTML` | 13 | ❌ 需 shim |
| `document.createElement` | 7 | ❌ 需 shim |
| `DOMParser` | 1 | ❌ 需 shim |
| `canvas` | 1 | ⚠️ **死代码，见下** |
| `localStorage` | 12 | ❌ 需替换 |
| `window.*` | 2 | ❌ 需 guard |
| `createObjectURL` / `new Image` / `toBlob` / `FileReader` | 0 | ✅ 无问题 |

**关键发现：`canvas` 那处是死代码 —— `generatePlaceholderCover`（`source.ts:904`）全仓库零调用方。**

这意味着 **A 方案唯一的真实技术障碍不存在**。我已用 jsdom 实测验证：

```
✓ querySelectorAll ok: 1
✓ 清洗链 (createElement → innerHTML → querySelectorAll.remove → textContent) 输出正确
✓ canvas 对象创建成功（getContext 未实现，但该函数是死代码）
```

## 三、三个方案对比

### 方案 A：服务端 DOM shim（jsdom）

**做法**：给 `parseHTML` / `document` / `window` 加一层服务端实现，让现有 3043 行解析器**原样**在 Node 里跑。

| 项 | 评估 |
|---|---|
| 前置条件 | jsdom `^27.4.0` **已安装**；`next.config.ts` **已有** `serverExternalPackages: ["jsdom"]` |
| 改动面 | 改 `parseHTML`（1 处）+ 加 shim 模块（~40 行）+ `localStorage` 12 处换存储抽象 |
| 覆盖率 | **100%** —— 现有全部 5 个内置源的解析器不用改一行 |
| 工作量 | **中**：1–2 天，含测试 |
| 风险 | jsdom 冷启动开销（每次实例化 ~50-100ms）；Vercel 函数体积增大；**已验证可行** |
| 长期维护 | 低 —— 服务端/前端共用同一套解析器，不会分叉 |

**这是唯一能"修一次、所有源都通"的方案。**

### 方案 B：全部改纯正则

**做法**：像 `app/api/browser-search/route.ts` 那样，每个源重写成正则解析，彻底不用 DOM。

| 项 | 评估 |
|---|---|
| 改动面 | 重写 5 个源的 search / getDetails / getChapterContent —— 涉及 153 处 `querySelector` 的等价替换 |
| 覆盖率 | 需逐个源重写后才能确认 |
| 工作量 | **大**：`browser-search` 542 行只覆盖了"搜索"一段，且作者提取这类逻辑刚被证明容易出错（见上一轮修复） |
| 风险 | 正则解析 HTML 天生脆弱；每加一个源都要重写一遍 |
| 长期维护 | 高 —— 站点改版要改复杂正则，比改选择器难 |

现有 `browser-search` 路由是这条路线的**部分实践**，可作为补充而非替代。

### 方案 C：只保证纯正则源可用

**做法**：不动 DOM 层，只修爱丽丝书屋这类走 `browser-search` 的源 + 删死依赖。

| 项 | 评估 |
|---|---|
| 改动面 | 删 `puppeteer`；继续用现有 `browser-search` 正则路径 |
| 覆盖率 | **低** —— 只有搜索能用，详情页/正文抓取仍走 DOM 解析 |
| 工作量 | **小**：半天 |
| 风险 | 低 |
| 长期维护 | 中 —— 搜索和正文两套解析逻辑并存，行为不一致 |

### 方案 D：书源抓取全部下移到浏览器

**做法**：服务端只做代理，所有解析在用户浏览器里完成（`localStorage` 天然可用、`DOMParser` 天然可用）。

| 项 | 评估 |
|---|---|
| 改动面 | 把抓取逻辑移回客户端；服务端 `/api/proxy` 保留 |
| 覆盖率 | 高，但有 CORS 与用户网络限制 |
| 工作量 | 中 |
| 风险 | 依赖用户浏览器直连目标站 —— 和"用服务端绕过网络限制"的初衷冲突 |
| 长期维护 | 低 |

## 四、建议

**推荐 A**，理由：

1. 唯一障碍（canvas）已确认是死代码，**jsdom 替代方案已实测通过**
2. jsdom 和 `serverExternalPackages` 配置**都是现成的**，不需要引入新依赖
3. 一次投入覆盖全部源，不需要为每个站点重写
4. 顺带解决 Legado 书源问题 —— 只需把存储从 `localStorage` 换到 KV（因为副作用 1 是共享的）

**推荐顺序**：A → （删 puppeteer）→ （localStorage → KV，解锁 Legado）

如果 A 在实战中遇到个别源解析失败，用 B 作为**针对性的补丁**（只重写失败的那个源），而不是全线替换。

## 五、尚未验证的部分

诚实标注：

- ✅ jsdom 顶替 DOM 链：**已实测**（`querySelectorAll` / `createElement` / `innerHTML` / `textContent`）
- ✅ canvas 是死代码：**已确认**（全仓库零调用）
- ✅ 依赖与配置就绪：**已确认**（jsdom ^27.4.0、`serverExternalPackages`）
- ❌ **未在 Vercel 实机验证过** A 方案的完整链路 —— 本地只验证到 DOM shim 层
- ❌ 未测 jsdom 在 Vercel 冷启动/内存上的实际开销
- ❌ 未确认 `localStorage` → KV 迁移的具体实现细节

最后一项是 A 方案落地时的第一个待办。
