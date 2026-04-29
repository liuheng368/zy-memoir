---
name: spec-md-review
description: >-
  审查 docs/features/<slug>/ 下 **spec.md**（需求）及同目录 **plan.md**（默认含 **AC**、实现计划）：是否缺章节/信息、占位与可验收性，以及「架构设计」等是否与
  workflow-reference、android/ARCH.md、android/DEV_GUIDE.md 等工程规范一致；输出校准项与修正建议。
  用户 @ 本 skill、发 /assist specre、或说「spec 校准、spec 文档审查、校对 spec」时启用。
---

# Spec / Plan 文档审查与校准（以 `spec.md` 为主）

## 目标

针对 **`spec.md`** 与（默认）**`plan.md`** 的 Markdown 做审查与校准，不涉及代码 diff 或对照实现逐条验收。聚焦三类结果：

1. **信息完整性**：是否缺章节、缺可测 AC（**`plan.md`** 优先，旧版可在 **`spec.md`**）、缺分支名；**`plan.md`** 中实现计划是否过空（或误仍在 **`spec.md`**）；澄清表与占位是否阻碍落地。
2. **事实与引用**：文中路径、接口、枚举是否与仓库源码一致（抽样验证）。
3. **架构与工程规范**：**`## 架构设计`**（及同类小节）中的模块划分、依赖方向、路径约定是否与 **`android/ARCH.md`**、**`android/DEV_GUIDE.md`**、**`.cursor/skills/feature/workflow-reference.md`** 一致；复杂设计是否建议拆 **`architecture.md`** 并在 spec 中链接。

## 必读

- 目标 **`docs/features/<slug>/spec.md`** 与同目录 **`plan.md`**（用户 `@` 路径或从 **`feat/<rest>`** 按 **feature** Skill 解析 slug；`-` / `_` 候选依次尝试）
- **`.cursor/skills/feature/workflow-reference.md`**（章节等价、checkbox、分支与目录）
- **`android/ARCH.md`**（Android 壳 ↔ KMP 依赖边界、模块职责）
- **`android/DEV_GUIDE.md`**（协作与命名等约定）
- 若 spec 含接口、文件路径：对关键条目 **Grep / Read** 仓库验证

## Agent 执行流程

1. **确定 spec 路径**：优先用户给出的仓库相对路径；否则按当前分支解析 **`docs/features/<slug>/spec.md`**；无法解析则请用户指定路径或 slug。
2. **通读 `spec.md` 与同目录 `plan.md`**，逐项走下方检查清单（**不**打开业务代码做 CR，仅在校验「文档所写是否成立」时读源文件）。
3. **事实抽样**：对文中 **`modules/...`**、**`kmp/...`**、**`android/...`**、**`docs/...`** 及 HTTP path、JSON 字段名验证存在性与描述一致性。
4. **输出**：按「输出格式」给出校准报告；若用户希望直接改文档且修改明确，可 **Edit** `spec.md` / `plan.md` 并写明摘要。
5. **禁止**：编造仓库中不存在的路径或接口；不确定时标 **待确认** 并说明验证方式。

## 检查清单

### 文档结构与信息是否缺失（对照 workflow-reference / spec-creator）

- 是否具备 **需求描述** 或 **问题定义**、**分支名称**（或正文 `` `feat/...` ``）；**验收标准**是否在 **`plan.md`**（默认，须含 **`### AC-`**）或兼容旧版仍在 **`spec.md`**；**实现计划**（`- [ ]` / `- [x]`）是否在 **`plan.md`**（默认）或误留在旧版 **`spec.md`**。
- **验收标准**（在 **`plan.md`** 或旧 **`spec.md`**）是否可测试（输入/操作/预期）；是否大量仍为占位。
- **代码审查** 小节是否在 **`plan.md`**（默认）或旧版 **`spec.md`**（占位「待审查」可接受）。
- 若同目录存在 **`plan.md`**：与 **`spec.md`** 是否互链、职责是否清晰——**`spec.md`** 以**需求阐述**为主，**`plan.md`** 以**技术方案**（**概述**、**现状分析**、**页面交互细节**、**API 梳理**、**架构设计**/**技术选型**（功能模块划分）、**`## 技术方案`**（文件改动清单、新增字段预估）、**`## 方案澄清事项`**（`#### Qn` + 勾选）、风险）**+ 验收标准（AC）+ 开发任务 + 实现计划 + 代码审查**为主（**契约级**接口：**方法**、**路径**、**Response**、**字段映射**在 **`## API 梳理`**；**本页** path 与触发在 **`## 页面交互细节`**；**文件级 / UiState 预估**在 **`## 技术方案`**；**方案分叉**在 **`## 方案澄清事项`**（与 **`spec.md` `### 澄清事项`** 分工）；**层级勾选执行拆解**在 **`## 开发任务`**；全链路并入架构或实现计划，**无**独立「UI 与交互」等章）；技术/接口/UI/Token 大段是否误留在 **`spec.md`** 而应迁至 **`plan.md`**；**验收标准 / 实现计划 / 代码审查**是否误留在 **`spec.md`** 而应迁至 **`plan.md`**（与模板对齐）。
- 章节名是否与 **spec-creator** / **workflow-reference** 严重偏离，导致 **`/assist feat`** 阶段误判（需求侧以 **`spec.md`** 为准；**AC** 与 checkbox / 审查以 **`plan.md`** 为默认真源，见 **workflow-reference**）。

### 分支与目录名

- **`## 分支名称`** 与 **`docs/features/<slug>/`** 是否满足 **workflow-reference**；矛盾处标 **HIGH**。

### 架构设计与工程规范（对照 ARCH / DEV_GUIDE）

- **功能模块划分（`plan.md` → `## 架构设计`）**：Android Feature 模块、**`:app` 壳**、KMP 模块（如 **`:kmp-core`**、**`:onboarding`**）的职责描述是否与 **`android/ARCH.md`** 中的依赖方向一致（例如 **Android → KMP** 单向、**`:app` 无业务代码**等要点）。
- **新增路径 / 包名**：是否与 **`ly.world.worldly…`** 及 **workflow-reference** 中的路径示例一致；是否虚构本仓库不存在的模块树。
- **数据与导航**：跨模块导航、Session/登录等若写入 spec，是否与 **ARCH** 中的导航模式、分层不矛盾。
- **可维护性**：若架构节过长或含大量序列细节，是否建议迁入 **`plan.md`** 或另建 **`architecture.md`**，并在 **`spec.md`** 关联文档中链接（见 **workflow-reference**）。

### 实现计划 checkbox（默认在 **`plan.md`**）

- 每条中的 **仓库相对路径** 是否指向真实文件或目录；**`kmp/`**、**`android/`** 模块是否与 Gradle 一致。
- **测试：** 子句是否具体，避免无法执行的空话。

### 接口与技术描述（文档事实性）

- HTTP **方法、Path、query/body** 是否与引用的 **`LoginAPI`**、KMP 数据类等源码一致。
- 枚举、常量是否与 **Swift/Kotlin** 定义一致。

### 文内引用与素材

- 指向 **`docs/features/...`**、**`docs/architecture.md`** 等的链接是否正确。
- 图片 **`source/*.png`** 与 markdown **相对路径** 是否可解析。

### 占位与脱敏

- 「待补充」「TODO」、spec-creator 默认句是否仍占主篇幅；建议改为可验收描述或澄清表 **Qn**。
- 不包含密钥、真实 token；发现敏感信息时仅标位置，不复述。

## 严重级别（文档问题）

- **HIGH**：缺关键章节或 **验收标准**（**`plan.md`** 或旧 **`spec.md`**）不可测、错误 API/契约、不存在的关键路径、分支与目录冲突、**架构设计与 ARCH 依赖方向明显矛盾**。
- **MEDIUM**：**架构设计** 过空或与 DEV_GUIDE 命名/分层不一致、**`plan.md`** 缺 **实现计划**（且 **`spec.md`** 亦无兼容节）、重要交叉引用断裂。
- **LOW**：笔误、措辞、可选的 mermaid/表格格式优化。

## 输出格式

1. **摘要**：信息完整度与架构规范符合度的结论；最优先修补项（1～3 条）。
2. **校准清单**：表格 — **级别** | **位置**（章节/约略行号）| **问题** | **建议修正**。
3. **与仓库核对抽样**（若已执行）：路径或接口 + 结论（一致 / 不一致）。
4. **若已直接编辑 spec**：**变更摘要**（bullet）。
5. **建议下一步**（文档向）：例如 **`/assist plan`**（补实现计划）、**`/assist req`**（补需求与 **`plan.md`** 内 AC）、**`/assist feat`**（重判阶段）。

## Assist 入口

- Token：**`specre`**（同义词：**`specmd`**、**`calib`**）
- 命令示例：**`/assist specre`**，或 **`@docs/features/<slug>/spec.md`** 并 @ 本 skill

## 下一步

— 验证没有问题推荐支持执行下一步 /assist code
- 验证有问题推荐执行 **`/assist spec`**（补文档骨架）或 **`/assist req`**