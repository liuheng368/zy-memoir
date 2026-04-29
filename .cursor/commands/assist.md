---
name: assist
description:  >-
  spec 工作流管理
  分发各个 skill 任务入口
---

# Assist（技能总入口）
核心行为：
1. **`/assist` 无显式 Token**（见入口路由 **③**）→ **直接** Read 并执行 **`.cursor/skills/feature/SKILL.md`**（**0～5** 阶段路由，含无 spec 时的 **阶段 0 → `spec`**，**等同** Token **`feat`**）。
2. **显式 Token 或 `list`/`help`** → 按入口路由 **① / ②** 分发。

### 入口路由（须遵守）

判定顺序：**① 列命令 → ② 显式 Skill Token → ③ 默认 Feature 路由**。

- **① `/assist list` / `help`（仅列 Token，不执行 Skill）**：去掉 **`/assist`** 前缀并 trim 后，**整段**仅为 **`list`、`help`、`ls`、`commands`** 之一（大小写不敏感），或等价短句 **「列出所有 token」「token 列表」「所有命令」**（无其它英文字词）→ **只输出**下文 **「Token → Skill 路径」** 表格及 **同义词** 行；**禁止** Read 任意 `SKILL.md`、**禁止**执行脚本；**不必**展开「工程状态分析」长文（可一行说明：以下为 Assist 支持的 Token）。若同一条消息中还出现 **skill 执行** 表中的 Token / 同义词，则 **②** 优先（以先出现的 Token 为准），**不**走本①。
- **② 带有 Token 或明确「执行某 Skill」**：消息中出现 **skill 执行** 表格中的 Token / 同义词，或用户写明要执行的 Skill 名 → **Read 对应 `SKILL.md` 全文** 并执行（路径见下表）。
- **③ 默认（无显式 Token，等同 `/assist feat`）**：未命中 **①**，且消息中**未**出现 **skill 执行** 表内任一 **Token** / 同义词（含用户只发 **`/assist`**、仅空格、或仅有与「列命令」无关的自然语言）→ **立即 Read 并执行** **`.cursor/skills/feature/SKILL.md`**：解析 slug、读 `docs/features/<slug>/spec.md`、判定阶段并指向对应 **`feature-*`** Skill、**spec-creator（阶段 0，无 spec 时提示 `/assist spec`）** 或产出阶段说明；**禁止**仅做长文「工程状态分析」而不读 **feature** Skill。**例外**：若用户明确声明「不要走 feature / 只要 env」等，从其意。

## 工程状态分析、工作流管理&流转（可选参考）

**与 `/assist` 无参数的关系（须遵守）**：用户 **不带任何参数**（入口路由 **③**：除 **`list`/`help`/`ls`/`commands`** 外无 Skill Token）时，Agent **必须** **直接** **Read 并执行** **`.cursor/skills/feature/SKILL.md`**（Feature **0～5** 阶段路由，含 **阶段 0 / `spec`**，**等同** **`/assist feat`**）。**禁止**仅用本节或下文的文字「状态分析」**代替**上述 **feature** Skill 的 Read/执行。

本节仅在 **feature 已执行之后**，或用户**额外**需要「对齐端到端 / 下一步 Token」时作**补充**；默认入口仍以 **入口 ③ → feature** 为准。

### 状态分析时 Agent 建议行为

- 用**一两句话**归纳用户当前自述进度，并与 **feature** 阶段结论或 **skill 执行** Token 表对照。
- 指出**缺哪类产物**（如缺架构节、缺推送群、未跑 env）。
- 给出**下一步**：优先给出 **Token** + 对应 **`.cursor/skills/.../SKILL.md`**；若用户未禁止默认路由，**无参数 `/assist`** 已应先走 **feature** Skill（入口 **③**）。

## skill 执行

- **命中 ① list/help**：**不** Read 任意 `SKILL.md`（见入口路由）。
- **命中 ② 显式 Token**：解析消息中的 **Token**（整词、大小写不敏感），**Read 对应 `SKILL.md` 全文** 并严格按该 Skill 执行。**多个 Token** 时以先出现为准，或请用户只保留一个。
- **命中 ③ 默认无 Token**：**Read** **`.cursor/skills/feature/SKILL.md` 全文** 并严格按该 Skill 执行（与 Token **`feat`** 相同，**无需**用户再输入 `feat`）。

### Token → Skill 路径（简短英文触发）

| Token | 含义 | 读取的 `SKILL.md` |
|--------|------|-------------------|
| **feat** | Feature **0～5** 阶段总路由 / 判阶段（无 spec → 建议 **`spec`**） | `.cursor/skills/feature/SKILL.md` |
| **spec** | **`spec.md` + `plan.md`**；**裸 `/assist spec`**（无跟车正文）：无 **`spec.md`** → **A/B** 初始化；已有 **`spec.md`** → 验 **`prd/prd.md`**（或 `prd/` 主 md），**有则从 PRD 归纳写 `spec.md`**，无则追问；**`+` 需求描述** 走模式②改 spec；改 **`plan.md`** 需 **`@plan.md`** 或点名；**模式③** 仅当 **`/assist spec` +**（去 `@` 后）**`整理` / `整理文件` / `文件整理` / `整理一下`**，见 **`feature-doc-tidy.md`** | `.cursor/skills/spec-creator/SKILL.md` |
| **specre** | **文档审查**（以 **`spec.md`** 为主，兼看 **`plan.md`**）：占位、**ARCH/DEV_GUIDE**、路径/接口与 plan 内 UI/Token | `.cursor/skills/spec-md-review/SKILL.md` |
| **req** | 阶段 1 需求澄清 | `.cursor/skills/feature-requirements/SKILL.md` |
| **plan** | 阶段 2：在 **`plan.md`** 填实现计划 / checkbox（旧版可能在 **`spec.md`**） | `.cursor/skills/feature-plan/SKILL.md` |
| **code** | 阶段 3 实现与测试 / TDD | `.cursor/skills/feature-code/SKILL.md` |
| **ac** | 阶段 4 对照 spec·AC 审查 | `.cursor/skills/feature-review/SKILL.md` |
| **done** | 阶段 5 提交与收尾 / PR 说明 | `.cursor/skills/feature-commit/SKILL.md` |
| **lint** | 独立 diff 审查（local-cr，不绑五阶段） | `.cursor/skills/local-cr/SKILL.md` |
| **ping** | RedHi / spec·架构 webhook 推送 | `.cursor/skills/review-spec-push/SKILL.md` |
| **env** | 环境自检 check-env | `.cursor/skills/env-check/SKILL.md` |

**同义词（与上表同一 Skill）**：`tdd`→code，`cr`→lint，`apk`→ship，`dev`→emu，`specmd`/`calib`→specre。

**查看上表**：对用户输入 **`/assist list`**（或 **`help` / `ls` / `commands`** 等，见入口路由 **①**）时，原样回显本表 + 同义词即可。
