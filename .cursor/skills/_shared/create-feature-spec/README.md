# create-feature-spec（公共脚本 + 模板）

由 **`spec-creator`** Skill 调用，在仓库根下 **`docs/features/<slug>/`** 生成 **`spec.md`**（需求详细阐述、**`## 页面交互描述`**（五节：多页串联与动效等；无接口；**不含**「涉及模块」工程表）、分支名）、**`plan.md`**（技术方案：**概述**、**现状分析**、**页面交互细节**、**API 梳理**（方法、路径、Response、字段映射）、**架构设计**/**技术选型**（功能模块划分）、**`## 技术方案`**（文件改动清单、新增字段预估）、**`## 方案澄清事项`**（与 spec **`### 澄清事项`** 形态一致）、风险 + **`## 验收标准`** + **`## 开发任务`** + **`## 实现计划`** + **`## 代码审查`**；全链路接口/UI/Token 并入架构或实现计划），以及 **`source/README.md`**（设计素材）、**`prd/README.md`**（上游 PRD / 产品文档占位），可选 **`architecture.md`**。

## 路径

- 脚本：`.cursor/skills/_shared/create-feature-spec/create-feature-spec.mjs`
- 模板：`.cursor/skills/_shared/create-feature-spec/templates/`

修改默认骨架时**只改 `_shared` 本目录**；**`spec-creator/SKILL.md`** 仅维护流程与判定，不复制模板副本。

## 用法

在 **Git 仓库根**（含 `docs/features/` 的 preproj 根）执行：

```bash
node .cursor/skills/_shared/create-feature-spec/create-feature-spec.mjs --help
node .cursor/skills/_shared/create-feature-spec/create-feature-spec.mjs \
  --slug <kebab-case> \
  --description "<至少 10 字的需求描述>"
```
