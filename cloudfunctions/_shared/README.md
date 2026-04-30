# `cloudfunctions/_shared/` — 云函数公共代码参考（**不部署**）

## 用途

本目录**只作参考代码留存**，**不会被 CloudBase 部署**：

1. `cloudbaserc.json` `framework.plugins.functions.inputs.functions[]` 中**没有**列出 `_shared`，所以 `tcb deploy` 不会扫描这里；
2. CloudBase Node 云函数互相**不能跨目录 `require`**（每个函数被独立打包成 zip），所以不能直接 `require('../_shared/hmac')`。

## 维护规则

- 任何想在多个云函数之间复用的代码，**先在这里实现 + 单测**，再**复制粘贴**到 `studentLogin/index.js` / `teacherLogin/index.js` / `adminCheck/index.js` 内联使用。
- 只复制不引用，避免 zip 拆包后找不到模块。
- 复制时**保留同步注释**：`// SYNCED FROM cloudfunctions/_shared/hmac.js (2026-04-30)`，便于后续审计漂移。

## 当前公共片段

| 文件 | 提供者 | 复用方 |
| ---- | ---- | ---- |
| [`hmac.js`](./hmac.js) | HMAC token sign / verify | `studentLogin` / `teacherLogin` / `adminCheck` |
| [`response.js`](./response.js) | 统一 `{ ok, code, message, data }` 包装 | 全部业务函数 |
