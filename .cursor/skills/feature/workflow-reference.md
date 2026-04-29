# Feature 工作流共享约定

本文件定义 **preproj** 内 Feature 开发各阶段共用约定；各阶段 Skill 按需引用。

## 仓库与栈

**preproj** 为多模块仓库（**KMP**、**Android**、文档等；**当前无 Java / Maven 服务端源码**）。实现计划里的路径须写**本仓库真实文件**。

- **Kotlin 包前缀**（与目录一致）：`ly.world.worldly…`（例：`kmp/kmp-core/src/commonMain/kotlin/ly/world/worldly/...`）。
- **路径前缀**：`kmp/`、`android/` 下各模块的 `src/main/kotlin/` 或 `src/commonMain/kotlin/`（以 Gradle 模块为准）。
- **其它仓库的 Java / Spring**：若工作项在独立后端仓，实现计划仍写**该仓**真实路径；**勿**在 **`plan.md`**（或旧版 **`spec.md`**）中虚构 preproj 不存在的 `src/main/java/...` 片段。

## 文档存放位置

**五阶段路由默认只认仓库根下**：**`docs/features/<feature-slug>/spec.md`**，一个 feature 一份；`<feature-slug>` 建议 **kebab-case**（与 `spec-creator --slug` 一致）。

**配套文档（spec-creator 默认一并创建）**：同目录 **`plan.md`** 为**技术方案全文**（**概述**、**现状分析**（已有基础设施、可复用 i18n、可复用 UI 组件）、**页面交互细节**（对齐 **`spec.md`**：**布局引用** `spec`/`source`、**模块交互拆解**、**本页接口 path**）、**API 梳理**（本次接口：**方法**、**路径**、**Response Payload**、**字段映射**表）、**架构设计**/**技术选型**（含 **`kmp/`、`android/`** 功能模块划分）、**技术方案**（**文件改动清单**、**新增字段（预估）**）、**方案澄清事项**（与 **`spec.md` `### 澄清事项`** 形态一致：**`#### Qn`** + 勾选；**方案 / 实现向**）、风险；全链路数据流 / 跨页契约 / Token 等并入 **`## 架构设计`** 或 **`## 实现计划`** 条目，**无**独立「接口与调用顺序」等章），并默认承载 **`## 验收标准`（AC）**、**`## 开发任务`**（层级 **`- [ ]`** 清单：按文件/Screen 拆解 UI 与逻辑）、**`## 实现计划`**（checkbox）与 **`## 代码审查`**；**`source/`**（设计素材、**页面截图**供 **`spec.md`** 引用）与 **`prd/`**（**上游 PRD / 产品文档** PDF、DOCX 等留存）由 **`create-feature-spec.mjs`** 与模板默认初始化（分工见各目录 **README**）。**阶段判定**：**需求描述 / 页面交互 / 澄清** 以 **`spec.md`** 为准；**验收标准（AC）** 以 **`plan.md`** 的 **`## 验收标准`** 为准；**实现计划与代码审查**以 **`plan.md`** 为准。**兼容**：**验收标准**——若 **`plan.md`** 无 **`## 验收标准`**、或仅有标题而无 **`### AC-`**、或**仅有模板占位**（各 AC 的「输入 / 操作 / 预期」均未填实质文字），且 **`spec.md`** 含已填写的 **`## 验收标准`**，则**降级**以 **`spec.md`** 为 AC 真源（直至迁移至 **`plan.md`**）；否则以 **`plan.md`** 为准（含新建骨架中空 AC 节，阶段 1 须补全）。**实现计划**——若 **`plan.md`** 仅有 **`## 实现计划`** 标题而无 **`- [`** checkbox 行，则**降级**读取 **`spec.md`** 同节（若有）。**代码审查**——无 **`plan.md`** 或其中无 **`## 代码审查`** 时读 **`spec.md`**。仍建议将旧内容**迁移**到 **`plan.md`** 与模板对齐。

若历史文档在 **`android/docs/features/*.spec.md`** 等平台路径，**不在**上述默认扫描范围内；要纳入本流程请迁移或复制到根 `docs/features/<slug>/spec.md`，或在 `@feature` 时**显式指定 slug**（仍用根目录结构）。

新建骨架可执行：`node .cursor/skills/_shared/create-feature-spec/create-feature-spec.mjs`（亦可用兼容路径 `spec-creator/scripts/create-feature-spec.mjs`；见 **spec-creator** Skill）。

开发完成后以**代码为 source of truth**，`spec.md` 可作过程与决策记录。

## 分支名与目录名（slug）

- Git 分支：`feat/<feature-name>`（常见为 `feat/foo-bar` 或 `feat/foo_bar`）。
- **解析规则**：从分支 `feat/<rest>` 得到 `rest` 后，生成 **slug 候选**（**去重**后依次尝试直到找到已有 `spec.md`）：
  1. **`rest` 原样**（目录名与分支片段完全一致时命中）。
  2. **`rest` 中全部 `_` 换为 `-`**（与 `docs/features/` 下 **kebab-case** 目录对齐）。
  3. **`rest` 中全部 `-` 换为 `_`**（目录为 snake_case 时命中）。
- **`-` 与 `_` 等价**：仅这两种分隔符可互换；**`rest` 的其余字符须与目录名逐字一致**（大小写、拼写等**不做**模糊纠偏或别名映射）。

**示例**：`feat/crossin_android_mvp` → 依次试 `crossin_android_mvp`、`crossin-android-mvp`（第三项与 1 重复则跳过）。`feat/phone_login` 与目录 **`docs/features/phone-login/`** 仅差 `_` / `-` 时，第二项候选即可命中，**不必**要求分支片段与目录分隔符写法完全一致。

## spec.md 格式（与 spec-creator 对齐）

`spec-creator` 产出为「**`spec.md`**：需求描述、分支名；**`plan.md`**：技术方案 + **验收标准（AC）** + **实现计划** + **代码审查**」。下列章节名**等价**用于阶段判定（**验收标准 / 实现计划 / 代码审查**默认在 **`plan.md`**，见上文「兼容」）：

| 路由 Skill 用语 | 可与下列任一对应 |
|----------------|------------------|
| 问题定义 | **`spec.md`** 内 `## 问题定义` **或** `## 需求描述`（含背景与目标） |
| 验收标准 | **`plan.md`** 内 **`## 验收标准`**（**优先**，须含 **`### AC-`** 且至少一条 AC 已填实质文字）；**否则** **`spec.md`** 同节（旧文档或 **`plan.md`** 仅占位时） |
| 分支名称 | **`spec.md`** 内 `## 分支名称`（推荐单独小节）或正文中的 `` `feat/...` `` |
| 实现计划 | **`plan.md`** 内 **`## 实现计划`**（**优先**）；旧文档可仍在 **`spec.md`**（见「文档存放位置」兼容说明） |
| 代码审查 | **`plan.md`** 内 **`## 代码审查`**（**优先**）；旧文档可仍在 **`spec.md`** |

建议在 `## 需求描述` 或单独 `## 问题定义` 中写清背景；**勿长期保留** spec-creator 的占位句。

**`spec.md` 结构示例（节选）**

````markdown
# <Feature 名称>

## 需求描述

<!-- 或单独使用「## 问题定义」 -->

## 分支名称

`feat/<feature-slug>`
````

**`plan.md`：验收标准、实现计划与代码审查示例（节选）**

````markdown
## 验收标准

### AC-1：<标题>

- **输入**：...
- **操作**：...
- **预期**：...

## 实现计划

### 第 1 组：<描述>

- [ ] `<本仓库真实路径>` — 说明 | 测试：...

### 第 2 组：<描述>

- [ ] ...

## 代码审查

<!-- 阶段 4 填写：实现计划全部 [x] 后 -->

- **结论**：待审查 / 需修改 / 通过
- **严重问题**：HIGH：…（无则写「无」）
- **备注**：（可选）

审查通过且严重问题已关闭（或已豁免）后，进入阶段 5。

````

### Kotlin / KMP / Android 实现计划示例（**preproj 默认**）

包名与源码树一致，例如 **`ly.world.worldly.feature`** 对应路径片段 **`ly/world/worldly/feature/`**。

```markdown
### 第 1 组：共享逻辑

- [ ] `kmp/kmp-core/src/commonMain/kotlin/ly/world/worldly/foo/Foo.kt` — 说明 | 测试：`kmp/kmp-core/src/commonTest/...`（若适用）

### 第 2 组：Android 壳

- [ ] `android/home/src/main/kotlin/ly/world/worldly/android/home/MainActivity.kt` — 入口/UI | 测试：…
```

（具体子模块以 `settings.gradle.kts` / 各 `build.gradle.kts` 为准，勿复制不存在的路径。）

### Java / Spring（仅当工作项在**其它仓库**时）

本仓库**无** `src/main/java` 业务代码时，不要在 **`plan.md`** 实现计划里写虚构 Java 路径；若需求落在独立后端工程，在任务行写**该仓库内**真实路径，或注明仓库名 + 模块名。

## 进度追踪

- 用 `- [ ]` / `- [x]` 追踪 **`plan.md`**（默认）实现计划中的任务；旧文档若在 **`spec.md`**，同上规则。
- **代码审查**小节由阶段 4 更新（默认在 **`plan.md`**），不依赖 checkbox 行（用「结论」「严重问题」字段判断可否进入阶段 5）。

## 分支命名

- Feature：`feat/<feature-name>`
- Bugfix：`fix/<issue-description>`

**分支创建**：须向用户确认分支名（可建议 `feat/<kebab-case-slug>`），确认后再建分支并切换；未经用户确认不得擅自创建。

## 组号依赖与并行规则

1. 前置组（编号更小）全部勾选后，后续组才可开始。
2. 同组任务可并行。

## 与五阶段 Skill 的对应

| 阶段 | Skill 目录 |
|------|------------|
| 1 | `.cursor/skills/feature-requirements/` |
| 2 | `.cursor/skills/feature-plan/` |
| 3 | `.cursor/skills/feature-code/` |
| 4 | `.cursor/skills/feature-review/` |
| 5 | `.cursor/skills/feature-commit/` |

路由入口：`.cursor/skills/feature/SKILL.md`。
