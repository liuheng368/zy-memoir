# prd

> **本目录主 PRD**：[`prd.md`](./prd.md)（spec-creator 约定的主产品稿入口；`spec.md` / `plan.md` 已对齐其相对路径）。

本目录用于**留存上游产品文档**（PRD、产品方案、评审纪要等），与 [`../source/`](../source/) 分工如下：

| 目录 | 典型内容 |
| ---- | -------- |
| [`prd/`](.) | 原始 **PDF / DOCX / PPT**、产品侧导出的**不可变**基线、法务或运营盖章版等（**大文件**建议走 **Git LFS**，见仓库 `.gitattributes` 约定）；以及主 PRD 的 **Markdown 副本**（[`prd.md`](./prd.md)） |
| [`../source/`](../source/) | 线框与**页面截图**（供 [`../spec.md`](../spec.md) §1 嵌入）、流程图、抓包、设计标注导出等**研发辅助素材** |

在 [`../spec.md`](../spec.md) 的 **「关联文档」** 中请用相对路径链到本目录具体文件，例如：`[产品方案](./prd/ProductSpec.pdf)`、`[PRD](./prd/prd.md)`。

（由 **`_shared/create-feature-spec`** 脚本与 **`spec-creator`** Skill 约定；可按需增删文件或删除本说明。）
