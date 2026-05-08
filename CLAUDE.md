# InkStream - AI Agent Skills

本项目使用了 mattpocock/skills 的工程最佳实践技能集合。

## Agent skills

### Issue tracker
Issues 托管在 GitHub Issues。See `docs/agents/issue-tracker.md`.

### Triage labels
使用标准 triage 标签：`needs-triage`, `needs-info`, `ready-for-agent`, `ready-for-human`, `wontfix`。See `docs/agents/triage-labels.md`.

### Domain docs
单一上下文布局：`CONTEXT.md` 和 `docs/adr/` 在项目根目录。See `docs/agents/domain.md`.

## 可用技能

### Planning & Design
- `/to-prd` — 从当前对话上下文生成 PRD 并发布到 issue tracker
- `/to-issues` — 将计划/PRD 分解为独立可领取的 issues（使用 tracer-bullet 垂直切片）
- `/grill-me` — 深入访谈用户以验证计划，直到达成共识
- `/design-an-interface` — 使用并行子代理生成多个完全不同的接口设计
- `/request-refactor-plan` — 通过用户访谈创建详细的重构计划

### Development
- `/tdd` — 测试驱动开发，遵循 red-green-refactor 循环
- `/triage-issue` — 调查 bug 根因并创建带 TDD 修复计划的 GitHub issue
- `/improve-codebase-architecture` — 探索代码库寻找架构改进机会
- `/migrate-to-shoehorn` — 将测试文件从 `as` 类型断言迁移到 @total-typescript/shoehorn
- `/scaffold-exercises` — 创建练习目录结构

### Engineering
- `/diagnose` — 严格的 bug 诊断循环：复现 → 最小化 → 假设 → 插桩 → 修复 → 回归测试
- `/triage` — 通过 triage 角色状态机管理 issues
- `/zoom-out` — 放大视角，获得更广阔的上下文
- `/prototype` — 构建一次性原型以验证设计
- `/setup-matt-pocock-skills` — 设置本项目的 per-repo 配置

### Tooling & Setup
- `/setup-pre-commit` — 设置 Husky pre-commit hooks
- `/git-guardrails-claude-code` — 阻止危险的 git 命令

### Writing & Knowledge
- `/write-a-skill` — 创建新的 agent skills
- `/edit-article` — 编辑和改进文章
- `/ubiquitous-language` — 从对话中提取 DDD 风格的统一语言词汇表

### Productivity
- `/caveman` — 超压缩通信模式，减少 75% token 使用
