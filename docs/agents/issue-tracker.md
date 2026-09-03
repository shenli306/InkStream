# Issue Tracker

## Configuration

**Type**: GitHub Issues

**CLI Tool**: `gh` (GitHub CLI)

## Workflow

使用 `gh` CLI 与 GitHub Issues 交互：

```bash
# 列出 issues
gh issue list

# 查看特定 issue
gh issue view <number>

# 创建 issue
gh issue create --title "Title" --body "Body"

# 添加标签
gh issue edit <number> --add-label "needs-triage"
```

## 参考文档

- GitHub CLI: https://cli.github.com/
- GitHub Issues: https://docs.github.com/en/issues
