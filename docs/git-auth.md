# Git / GitHub 认证方式（本机）

> 记录于 2026-10-15。事实来源：`~/.ssh/`、opencode 会话 `ses_f0a7125eaffewnbc0WMZMMCYMy`（2025-10-01）实测。

## 结论：走 SSH 密钥，没有 token

本机对 GitHub 的认证是 **SSH 密钥**，没有配置 Personal Access Token，也没有 `gh` CLI。
凭据文件 `~/.git-credentials`、`~/.netrc` **都不存在**，全局 `credential.helper` **为空**。
所以任何 `git@github.com:...` 的推送靠的都是下面这把密钥。

## 密钥

| 项 | 值 |
|---|---|
| 私钥 | `~/.ssh/id_ed25519` （`-----BEGIN OPENSSH PRIVATE KEY-----`，权限 600） |
| 公钥 | `~/.ssh/id_ed25519.pub` |
| 类型 | `ssh-ed25519` |
| 指纹 | `SHA256:6Xfrn6iO81zO1ed4Kq0guQi8Uj60H2SrOvbqzQnL8zU` |
| 注释 | `shenli306` |
| 创建时间 | 2025-10-01 12:22 |

公钥全文：

```
ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIDLMVI2mU72KQQFCrc6NIp7AnGyI+8R1GkrKWQdtCFCt shenli306
```

该公钥已添加到 GitHub 账号 **shenli306**（Settings → SSH and GPG keys）。

## 连通性验证

```bash
ssh -T git@github.com
# → Hi shenli306! You've successfully authenticated, but GitHub does not provide shell access.
```

实测通过（2025-10-15 复验）。

## git 身份

全局 `user.name` / `user.email` **未设置**。身份配在**仓库级**：

```bash
git config user.name   # shenli306
git config user.email  # shenli306@users.noreply.github.com
```

新仓库要提交，先补仓库级身份（或改用 `--global`）：

```bash
git config user.name  shenli306
git config user.email shenli306@users.noreply.github.com
```

## 本机各仓库的 remote

| 仓库 | remote |
|---|---|
| `/home/elysia/code/InkStream` | `git@github.com:shenli306/InkStream.git` （SSH） |
| `/home/elysia/code/InkStream-uploaded` | `https://github.com/shenli306/InkStream.git` |
| `/home/elysia/code/penetration` | `git@github.com:shenli306/sast.git` （SSH） |
| `/home/elysia/code/agent2api` | `https://github.com/aimod-cc/agent2api.git` |

## 代理注意

GitHub 直连 TLS 有时会失败，此前用过本地代理 `127.0.0.1:7897`：

```bash
export http_proxy=http://127.0.0.1:7897 https_proxy=http://127.0.0.1:7897
git config --global http.proxy  http://127.0.0.1:7897
git config --global https.proxy http://127.0.0.1:7897
# 用完记得取消
git config --global --unset http.proxy
git config --global --unset https.proxy
```

SSH 直连当前是通的，一般不需要代理。

## 换机器 / 重装恢复

1. 把上面的**私钥** `~/.ssh/id_ed25519` 复制过去（`chmod 600`），连同 `.pub`。
2. `ssh-keyscan github.com >> ~/.ssh/known_hosts`（或首次连接确认指纹）。
3. `ssh -T git@github.com` 应显示 `Hi shenli306!`。私钥不丢失就无需在 GitHub 重新登记。

若密钥丢失需重新生成：

```bash
ssh-keygen -t ed25519 -C "shenli306"
cat ~/.ssh/id_ed25519.pub
# 到 GitHub → Settings → SSH and GPG keys → New SSH key → 粘贴
ssh -T git@github.com
```
