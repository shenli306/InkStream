# Domain Docs

## Layout

**Single-context**: 本项目使用单一上下文布局。

## 文件位置

### CONTEXT.md (项目根目录)

项目的领域词汇表和通用语言。包含：
- 领域术语定义
- 同义词和避免使用的别名
- 关键概念之间的关系

### docs/adr/ (项目根目录)

架构决策记录 (Architecture Decision Records)。包含：
- 重要的技术决策
- 决策的原因和上下文
- 决策的日期和状态

## 使用指南

当使用以下技能时，会自动读取这些文档：
- `/improve-codebase-architecture`
- `/diagnose`
- `/tdd`
- `/zoom-out`

确保在这些文件中使用项目特定的领域术语，这有助于 AI 更好地理解代码库。
