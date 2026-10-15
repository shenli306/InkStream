/**
 * 书源模块入口喵~
 *
 * 实现已按职责拆分到 ./sources/ 目录：
 *   sources/shared/    —— 常量、类型、DOM、抓取、缓存等基础设施
 *   sources/providers/ —— 各站点书源实现
 *   sources/registry.ts—— 书源注册表与启用配置
 *   sources/api.ts     —— 搜索 / 详情 / 下载聚合
 *   sources/smart.ts   —— 规则驱动的智能抓取
 *   sources/cover.ts   —— 封面获取与占位图
 *
 * 本文件保留为统一出口，调用方 `from './source'` 无需改动。
 */
export * from './sources/index';
