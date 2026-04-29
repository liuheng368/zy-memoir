---
name: feature-commit
description: Feature 开发阶段 5：完成提交。验证前置条件后，直接执行提交。
---

# 阶段 5：完成提交

验证前置条件后，执行提交并推送到远程。

## 前置条件验证

逐项检查，任一不满足则停止并告知用户：

1. **所有任务完成** — `docs/features/<feature-name>/plan.md`（默认）中 **实现计划** 所有 checkbox 均已勾选（`- [x]`）；旧文档若在 **`spec.md`** 则同判

## 提交流程

### 1. 展示变更摘要

向用户展示：

- 本次 feature 的名称和描述
- 修改/新增的文件列表
- 通过的验收标准

### 2. 执行提交

- 使用 Conventional Commits 格式：`<type>: <subject>`
- 允许的 type：`feat`, `fix`, `docs`, `style`, `refactor`, `perf`, `test`, `build`, `ci`, `chore`, `revert`
- 提交信息简洁明了，描述 feature 的核心变更

### 3. 推送确认

提交完成后：

- 显示 commit hash
- **询问用户确认**：是否推送到远程？

### 4. 执行推送

用户确认后：

- 执行 `git push`（**会触发 `check:all`**）
- 等待检查完成：
  - **通过**：推送成功
  - **失败**：根据错误信息修复问题，重新推送
- 告知用户 feature 开发流程已完成
- 提示后续操作：使用 yunxiao-mr-review 创建 MR 等
