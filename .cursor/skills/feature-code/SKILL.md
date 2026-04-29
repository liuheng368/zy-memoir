---
name: feature-code
description: >-
  Feature 阶段 3：按 spec 实现与测试（TDD 取向）。本仓为 KMP + Android 壳工程：在 kmp/android 下小步提交，
  KMP 用 commonTest + kotlin.test；正文内 Gradle 测试**执行**与判据暂时 HTML 注释，恢复后仍可用 ./gradlew 跑模块级测试。独立后端仓则按该仓 Maven/Gradle 约定。
  未 @ spec 时：在 `feat/<rest>` 分支按正文「Agent：解析」推断 `docs/features/<slug>/spec.md`（`-` / `_` 为等价分隔符）。
  Agent 默认按实现计划**组顺序 → 组内由上至下**推进；**每完成一项**即将该 **`plan.md`**（旧版可能在 **`spec.md`**）中对应行 **`- [ ]` 改为 `- [x]`**（用户另行指定范围时从其意）。
  第一轮功能对齐后可按正文「UI 精修与审查」迭代视觉与走查，再交 **feature-review**（阶段 4）。
  当实现计划存在未完成 checkbox 或用户在进行开发/改缺陷时使用。
---

# Feature 阶段 3 — 实现与测试（TDD 取向）

## 目标

将**实现计划载体**（默认 **`plan.md`**，旧版可能在 **`spec.md`**；判定同 **`feature/SKILL.md`** §2）中的 `- [ ]` 逐项变为 `- [x]`，并配套**可运行的测试**与符合工程约定的代码。**按组顺序**完成（组内自上而下）；**每完成一项**立即在**同一载体文件**把该行更新为 **`- [x]`**（仅该项已真正完成时勾选，见 `workflow-reference.md`）。

## 必读共享约定

- `.cursor/skills/feature/workflow-reference.md`：仓库栈、路径、`ly.world.worldly…` 包前缀、只勾选已真正完成的任务。
- **`android/ARCH.md`**：模块依赖边界、Android→KMP 单向依赖、Feature / `:app` 壳职责。
- **`android/DEV_GUIDE.md`**：KMP 数据模型 `Kmp` 前缀、网络、`expect/actual` 变更规范等。
- **`.cursor/skills/feature/SKILL.md`**（「Feature 标识」、实现计划载体）：与下文 **「Agent：解析 `spec.md` / `plan.md` 默认路径」** 一致；细则见 **`workflow-reference.md`**（分支与 slug）。

## Agent：解析 `spec.md` 与 `plan.md` 默认路径

执行本 Skill 时，**须先**定位并 **Read** 当前 Feature 的 **`docs/features/<slug>/spec.md`**（需求）与 **`plan.md`** / **`spec.md`** 的 **AC**（**`plan.md`** 有实质 **`## 验收标准`** 则用之；若 **`plan.md`** 仅占位而 **`spec.md`** 有实质 AC，则读 **`spec.md`**，见 **`feature/SKILL.md`** §1）及**实现计划载体**（**`plan.md`** 含实质 checkbox 则用之，否则 **`spec.md`** 中含 checkbox 的 **`## 实现计划`**，见 **`feature/SKILL.md`** §2），再改代码。

### 用户已指定

若用户已在消息中 **@** 某份 **`spec.md`**，或写明 **slug**（`docs/features/` 下目录名）、**`docs/features/.../spec.md` 的完整相对路径**，则**直接使用**，不做分支推断。

### 从当前分支推断（未 @ spec、且未给 slug 时）

1. 在**仓库根**执行 **`git branch --show-current`**（或等效方式）得到当前分支名。
2. 若为 **`feat/<rest>`**（`rest` = 去掉前缀 **`feat/`** 后的片段）：按下表**依次**检测 **`spec.md` 是否存在**；生成候选 **slug** 时若与前者**重复则跳过**。**先命中**的路径即为当前 spec：
   - `docs/features/<rest>/spec.md`（目录名与 `rest` 完全一致）
   - `docs/features/<slug>/spec.md`，`<slug>` = 将 `rest` 中**每个下划线 `_` 替换为连字符 `-`**
   - `docs/features/<slug>/spec.md`，`<slug>` = 将 `rest` 中**每个连字符 `-` 替换为下划线 `_`**
3. **`-` 与 `_` 仅视为等价分隔符**；`rest` 的其余字符须与 `docs/features/` 下目录名**逐字一致**（**不**做大小写或拼写纠偏）。例：分支 **`feat/phone_login`** 与目录 **`docs/features/phone-login/`** 时，第二项候选命中。
4. 若当前分支**不是** `feat/*`（如 `main`、`develop`、`fix/*`），或上述候选**均不存在** `spec.md`：请用户补充 **slug** / **spec 完整路径**，或建议 **`/assist spec`**、切换到 **`feat/<name>`** 后重试。

## Agent：实现顺序与 plan 勾选（默认）

在已 **Read** **实现计划载体**（见上文 §「解析 `spec.md` 与 `plan.md`」）且用户**未**在消息中限定「只做某几条 / 跳过某组」时，Agent **须**遵守：

1. **组顺序**：严格按 **`## 实现计划`** 中 **「第 1 组 / 第 2 组 / …」** 标题在载体文件中的**出现顺序**推进；**不得**在前序组仍有 `- [ ]` 时开始下一组（**组依赖**）。
2. **组内顺序**：在同一组内，按 checkbox 列表**由上至下**依次实现。
3. **每完成一项**：立即编辑**载体文件**（默认 **`plan.md`**），将**刚完成**的那一条 **`- [ ]`** 改为 **`- [x]`**，再继续下一项；**禁止**把未开始或未验证项标为 `[x]`。
4. **默认起点**：用户未说明从哪一条开始时，从**第一个仍为 `- [ ]` 的项**开始（且须满足第 1 条组依赖）。
5. **不必**在每项开始前反复询问「是否做下一项」；遇**阻塞**（无法解析需求、依赖缺失、需产品决策）再停下说明。

## 开发原则

1. **测试分层（本仓主栈）**
   - **KMP 共享逻辑**：优先在 **`src/commonTest`** 使用 **`kotlin.test`**（`Test`、`assertEquals` 等），与现有模块（如 `kmp-posting` 的 `CropImageStateTest`）一致；带 **`jvm()`** 目标的模块可另用 **`jvmTest`**（如 `spi-core`）。
   - **Android 壳层**：单元测试用模块的 **`test`** / **`testDebugUnitTest`**；仪器化、端到端**谨慎**使用，仅必要时跑（较慢、依赖模拟器）。
   - **勿**把 Spring **`@WebMvcTest` / `@SpringBootTest`** 当作本仓默认——**preproj 内无 Java 服务端源码**；若任务在**独立后端仓库**，在该仓按其后端约定写测并执行。

<!--
【暂注释】恢复时删除本段 HTML 注释包裹，还原「执行测试（Gradle）」为开发原则第 2 条，并把「更新 spec」「组依赖」依次改为第 3、4 条。
2. **执行测试（Gradle）**
   `kmp/` 与 `android/` **各自**含 **`./gradlew`**，需在对应子目录下执行。示例（任务名以模块为准，可用 `./gradlew :<module>:tasks --group=verification` 查看）：

   ```bash
   cd kmp && ./gradlew :kmp-posting:testDebugUnitTest
   ```

   ```bash
   cd android && ./gradlew :home:testDebugUnitTest
   ```

   环境 JDK/SDK 见 **`android/SETUP.md`**。
-->

2. **更新实现计划载体**：与上文 **「Agent：实现顺序与 plan 勾选」** 一致：该项**已交付且可验证**后，再在**该载体文件**将对应 **`- [ ]`** 改为 **`- [x]`**。

3. **组依赖**：与上文第 1 条一致；用户明确要求调整组顺序或范围时从其意，并在对话中简要记录。

## 第一轮实现后的 UI 精修与审查

在**功能与 AC 基本对齐**、实现计划主要项已落地后，可追加**不扩大业务范围**的迭代：先 **UI 精修**，再 **整体 review**。二者仍属阶段 3 内的打磨；**合并前收口**建议再走 **阶段 4**（见下）。

### UI 精修（Agent 提示要点）

1. **对照物**：优先引用 **`spec.md`** 中 **「UI 与交互设计」**（或等价章节）及 **Figma / 截图**；同时 **@ 具体 Screen / Composable 文件**，避免全仓盲改。
2. **验收粒度**：用可勾选清单描述差异（字号行高、间距、主按钮态、Loading / 空态 / 错误态、禁用态、键盘与焦点、安全区等），格式建议 **「当前 → 期望」**。
3. **工程边界**：精修**不改变**对外 API 与核心业务路径；遵守 **`android/ARCH.md`**、**`android/DEV_GUIDE.md`**（如 `Kmp` 前缀、`expect/actual` 规则），避免为改 UI 引入违规依赖。
4. **分轮**：可先布局与 token，再动效与边缘状态；每轮结束后按需本地验证（当前 Skill **暂不**要求按正文已注释的 Gradle 命令补跑）。

### 整体 review（阶段 4 — `feature-review`）

有 **`docs/features/<slug>/plan.md`**（或旧版 **`spec.md`**）含 AC 时，对照 **AC**、**`android/ARCH.md`**、**`android/DEV_GUIDE.md`** 做分级审查（HIGH～LOW）：在对话中 **@ `.cursor/skills/feature-review/SKILL.md`**，并 **@ 对应 `plan.md`**（或旧 **`spec.md`**）。**UI 精修不能替代** 关键逻辑单测与本节审查；存在 HIGH 时按 **`feature-review`** 约定先修复再进入阶段 5。

## 完成判据

- 实现计划中**所有** checkbox 为 `- [x]`。
<!-- - 本仓相关模块的 **Gradle 测试任务**通过（或用户认可的豁免项已写入 spec）。 -->
- 本仓相关模块测试：**暂时**不要求在本 Skill 内执行 Gradle 验证；合并前建议在本地或 CI 跑通（恢复 Gradle 判据时取消上一行 HTML 注释并删除本行）。
- 若涉及**其它仓库**代码，该侧测试也通过或豁免已说明。

## 下一步

提示用户执行 **`/assist ac`** 进入阶段 4（代码审查）。
