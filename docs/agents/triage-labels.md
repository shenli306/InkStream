# Triage Labels

## Label Mapping

使用 GitHub Labels 表示 triage 状态。

| Role | Label | Description |
|------|-------|-------------|
| `needs-triage` | `needs-triage` | 维护者需要评估 |
| `needs-info` | `needs-info` | 等待报告者提供更多信息 |
| `ready-for-agent` | `ready-for-agent` | 已完全指定，AFK agent 可领取 |
| `ready-for-human` | `ready-for-human` | 需要人工实现 |
| `wontfix` | `wontfix` | 不会处理 |

## Category Labels

| Category | Label | Description |
|----------|-------|-------------|
| Bug | `bug` | 某些功能损坏 |
| Enhancement | `enhancement` | 新功能或改进 |

## State Machine

```
未标记 → needs-triage → needs-info → needs-triage
                    → ready-for-agent
                    → ready-for-human
                    → wontfix
```

## 使用示例

```bash
# 添加 triage 标签
gh issue edit <number> --add-label "needs-triage"
gh issue edit <number> --add-label "bug"
gh issue edit <number> --add-label "ready-for-agent"

# 移除标签
gh issue edit <number> --remove-label "needs-triage"
```
