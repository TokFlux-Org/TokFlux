# Git 操作说明

本文档面向当前仓库维护者，整理日常开发、同步上游、解决冲突和将 fork 作为独立项目维护时的 Git 操作。

## 1. 远程仓库约定

建议保留两个远程：

- `origin`：你自己的仓库
- `upstream`：上游原始仓库

检查当前配置：

```bash
git remote -v
```

如果缺少上游远程，补充：

```bash
git remote add upstream https://github.com/QuantumNous/new-api.git
```

## 2. 日常开发流程

拉取自己的最新代码：

```bash
git checkout main
git pull origin main
```

开始新功能开发：

```bash
git checkout -b feat/your-feature-name
```

提交本地修改：

```bash
git status
git add -A
git commit -m "feat: describe your change"
```

推送到自己的仓库：

```bash
git push origin feat/your-feature-name
```

如果直接在 `main` 上维护：

```bash
git push origin main
```

## 3. 同步上游更新

先抓取上游最新代码：

```bash
git fetch upstream
```

查看自己与上游的差异：

```bash
git log --oneline --decorate --graph --max-count=20 main upstream/main
```

将上游合并到本地 `main`：

```bash
git checkout main
git merge upstream/main
```

同步完成后推送到自己的仓库：

```bash
git push origin main
```

说明：

- 本仓库建议优先使用 `merge` 同步上游，历史更直观，也更适合长期维护自定义修改的 fork。
- 如果你使用 `rebase`，需要更谨慎处理历史改写，且推送时可能需要强推，不建议在共享分支上默认使用。

## 4. 处理合并冲突

发起合并后，如果出现冲突：

```bash
git status
```

查看冲突文件：

```bash
git diff --name-only --diff-filter=U
```

处理原则：

- 保留你自己仓库的定制功能
- 合入上游的 bugfix 和安全修复
- 不要直接无脑选 `ours` 或 `theirs`

解决冲突后：

```bash
git add -A
git commit
```

如果只是想放弃这次合并：

```bash
git merge --abort
```

## 5. 常用检查命令

查看工作区状态：

```bash
git status
```

查看最近提交：

```bash
git log --oneline --decorate --graph --max-count=20
```

查看某次提交修改了什么：

```bash
git show <commit>
```

查看某个文件的修改：

```bash
git diff -- path/to/file
```

查看已暂存但未提交的内容：

```bash
git diff --cached
```

## 6. 推荐的上游同步流程

适合当前仓库的稳定流程：

```bash
git checkout main
git pull origin main
git fetch upstream
git merge upstream/main
git status
git push origin main
```

如果担心冲突较多，可以先创建一个同步分支：

```bash
git checkout main
git pull origin main
git checkout -b chore/sync-upstream-YYYYMMDD
git fetch upstream
git merge upstream/main
```

确认无误后再合回 `main`。

## 7. 将 fork 当独立项目维护

即使 GitHub 页面不显示 fork，你仍然可以继续同步上游。关键不在 GitHub 页面，而在本地是否保留 `upstream` 远程。

独立维护建议：

- GitHub 仓库展示层面：使用独立仓库，不依赖 GitHub fork 关系
- Git 层面：本地始终保留 `upstream`
- 日常同步层面：定期执行 `git fetch upstream` 和 `git merge upstream/main`

推荐习惯：

- 上游同步只合并到 `main`
- 功能开发尽量从最新 `main` 切分支
- 大版本同步前先打备份标签

打标签示例：

```bash
git tag backup-before-upstream-sync-20260515
git push origin backup-before-upstream-sync-20260515
```

## 8. 不建议的操作

除非你非常确定后果，否则不要在日常维护中使用以下操作：

- `git reset --hard`
- `git push --force`
- `git checkout -- <file>`
- 在未确认内容前直接覆盖冲突文件

这些操作容易丢失你自己的定制改动。

## 9. 出问题时的回退方式

如果刚合并完还没提交：

```bash
git merge --abort
```

如果已经提交，但想回到上一个提交：

```bash
git log --oneline --max-count=5
git reset --hard <previous-commit>
```

注意：`git reset --hard` 会丢失当前未保存修改，只适合你明确要回退整个工作区时使用。

更安全的方式是新建修复提交，而不是重写历史：

```bash
git revert <commit>
```

## 10. 建议提交信息风格

建议统一使用简短前缀：

- `feat:` 新功能
- `fix:` 修复问题
- `refactor:` 重构
- `docs:` 文档修改
- `chore:` 杂项维护
- `sync:` 同步上游

示例：

```bash
git commit -m "sync: merge upstream main"
git commit -m "fix: resolve topup invitation merge conflicts"
git commit -m "docs: add git operations guide"
```

