---
name: feature-requirements
description: >-
  Feature 阶段 1：需求澄清。在 docs/features 下起草 **spec.md**（问题定义、需求描述、分支名）与 **plan.md**（**`## 验收标准`** / AC，默认与模板一致）。
  当 feature 路由判定为阶段 1，或用户要开始新功能需求分析时使用。
---

# Feature 阶段 1 — 需求澄清

## 目标

产出可用的 **`docs/features/<feature-name>/spec.md`**（问题定义、需求描述、分支名称）及 **`plan.md`** 内 **`## 验收标准`**（可测试 AC）。**不写实现计划**（阶段 2）。旧文档若 AC 仍在 **`spec.md`**，可暂保留，与 **feature/SKILL**「兼容」检测一致。

## 必读共享约定

`.cursor/skills/feature/workflow-reference.md`（文档路径、分支命名、checkbox 规则）。

工程分层与 Android 研发约定：**`android/DEV_GUIDE.md`**。

## 执行步骤

1. 与用户确认 **feature 名称**（kebab-case，用于目录名）；若从分支推断，分支应形如 `feat/<feature-name>`。
2. 若 `docs/features/<feature-name>/` 不存在，创建目录。
3. 编写或补全 **`spec.md`**：
   - **问题定义** / **需求描述**：背景、目标用户、范围与非目标。
   - **分支名称**：`feat/<feature-name>`，并与用户确认后再建议建分支（见 workflow-reference）。
4. 编写或补全 **`plan.md`** 的 **`## 验收标准`**：可测试的 AC（输入 / 操作 / 预期），每条编号如 AC-1、AC-2（与 **create-feature-spec** 模板默认位置一致）。
5. **禁止**：在此阶段大段改业务代码；仅可建立空 spec 或占位文件若团队允许。

## 完成判据

- **`spec.md`** 含完整「问题定义」或实质「需求描述」、「分支名称」；**`plan.md`**（或兼容旧版 **`spec.md`**）含实质 **`## 验收标准`** 与 AC。
- 用户明确认可需求表述或书面确认可进入阶段 2。

## 下一步

提示用户执行 **`/assist plan`** 进入阶段 2（架构设计与实现计划）。
