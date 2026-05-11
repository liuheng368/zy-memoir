# 账号 / 服务清单（zy-memoir · 钟园幼儿园 2024 届大二班 · 班级回忆录）

> 本文档汇总项目涉及的所有外部账号、平台、控制台入口与关键标识。
> **不收录密钥明文**；所有密钥均以「存放位置 + 用途」形式登记，需要时去对应平台读取。
> 维护人：黑贤（liuheng@xiaohongshu.com）

---

## 1. 代码仓库（GitHub）

| 项 | 值 |
| --- | --- |
| 平台 | GitHub（**非 GitLab**） |
| Owner | [`liuheng368`](https://github.com/liuheng368) |
| 仓库 | [`liuheng368/zy-memoir`](https://github.com/liuheng368/zy-memoir) |
| Web 入口 | https://github.com/liuheng368/zy-memoir |
| SSH 克隆 | `git@github.com:liuheng368/zy-memoir.git` |
| HTTPS 克隆 | `https://github.com/liuheng368/zy-memoir.git` |
| 默认 / 生产分支 | `main` |
| 主开发分支 | `feat/memoir-home`（已合入 main） |

### GitHub Actions

| Workflow | 触发条件 | 作用 |
| --- | --- | --- |
| [`.github/workflows/deploy.yml`](.github/workflows/deploy.yml) | push to `main`（paths 过滤） + `workflow_dispatch` | 静态前端 + 21 个云函数自动部署到 CloudBase |
| ~~`.github/workflows/deploy-pages.yml`~~ | — | **已下线**（commit `1c06797`），不再使用 GitHub Pages |

### GitHub Secrets（Settings → Secrets and variables → Actions）

| Secret | 用途 |
| --- | --- |
| `TENCENT_SECRET_ID` | 腾讯云 API SecretId（CloudBase 部署专用 RAM 子账号） |
| `TENCENT_SECRET_KEY` | 同上 SecretKey |
| `AUTH_HMAC_KEY` | 学生/老师 token 签名密钥；CI 注入到云函数 envVariables |
| `ADMIN_HMAC_KEY` | 管理员 token 签名密钥；CI 注入到云函数 envVariables |

---

## 2. CloudBase（腾讯云开发）

| 项 | 值 |
| --- | --- |
| envId | `zy-memoir-d5gaxbvyxe80564f4` |
| 控制台 | https://console.cloud.tencent.com/tcb/env/index?envId=zy-memoir-d5gaxbvyxe80564f4 |
| 静态托管域名 | https://zy-memoir-d5gaxbvyxe80564f4.tcloudbaseapp.com/ |
| 部署描述文件 | [`cloudbaserc.json`](cloudbaserc.json) |
| 计费 | 免费版（CORS 限制 → 已通过 EdgeOne / Cloudflare Pages 反代规避） |

### 21 个云函数（[`cloudfunctions/`](cloudfunctions)）

| 函数 | 主要用途 | 环境变量需求 |
| --- | --- | --- |
| [`studentLogin`](cloudfunctions/studentLogin/index.js) | 学号 + 姓名校验 → 签发学生 token | `AUTH_HMAC_KEY` |
| [`teacherLogin`](cloudfunctions/teacherLogin/index.js) | 老师身份校验 → 签发老师 token | `AUTH_HMAC_KEY` |
| [`adminCheck`](cloudfunctions/adminCheck/index.js) | 校验 admin token（`/admin?token=...` 入口） | `ADMIN_HMAC_KEY` |
| [`seedStudents`](cloudfunctions/seedStudents/index.js) | 从 COS 拉学生名单 JSON → DB upsert | — |
| [`seedTeachers`](cloudfunctions/seedTeachers/index.js) | 从 COS 拉老师名单 JSON → DB upsert | — |
| [`listTeachers`](cloudfunctions/listTeachers/index.js) | 老师下拉名单 + 主页风采区 | — |
| [`listStudents`](cloudfunctions/listStudents/index.js) | 主页学生头像墙 | — |
| [`getStudentDetail`](cloudfunctions/getStudentDetail/index.js) | 学生详情页（公开只读） | — |
| [`updateStudentIntro`](cloudfunctions/updateStudentIntro/index.js) | 学生简介保存 | `AUTH_HMAC_KEY` |
| [`addStudentPhoto`](cloudfunctions/addStudentPhoto/index.js) | 学生新增照片 | `AUTH_HMAC_KEY` |
| [`removeStudentPhoto`](cloudfunctions/removeStudentPhoto/index.js) | 学生删除照片（含 COS 清理） | `AUTH_HMAC_KEY` |
| [`updateStudentAvatar`](cloudfunctions/updateStudentAvatar/index.js) | 学生换头像 | `AUTH_HMAC_KEY` |
| [`addStudentRecording`](cloudfunctions/addStudentRecording/index.js) | 学生新增录音 | `AUTH_HMAC_KEY` |
| [`removeStudentRecording`](cloudfunctions/removeStudentRecording/index.js) | 学生删除录音（含 COS 清理） | `AUTH_HMAC_KEY` |
| [`updateTeacherAvatar`](cloudfunctions/updateTeacherAvatar/index.js) | 老师换头像 | `AUTH_HMAC_KEY` |
| [`addTeacherRecording`](cloudfunctions/addTeacherRecording/index.js) | 老师新增录音 | `AUTH_HMAC_KEY` |
| [`removeTeacherRecording`](cloudfunctions/removeTeacherRecording/index.js) | 老师删除录音（含 COS 清理） | `AUTH_HMAC_KEY` |
| [`listBanners`](cloudfunctions/listBanners/index.js) | 主页合影轮播（公开只读） | — |
| [`addBanner`](cloudfunctions/addBanner/index.js) | 上传合影（**双 key 验签**：admin OR teacher） | `ADMIN_HMAC_KEY` + `AUTH_HMAC_KEY` |
| [`removeBanner`](cloudfunctions/removeBanner/index.js) | 删除合影（**双 key 验签**：admin OR teacher） | `ADMIN_HMAC_KEY` + `AUTH_HMAC_KEY` |

### 数据库集合

| 集合 | 字段概览 |
| --- | --- |
| `students` | id / name / gender / intro / avatar / photos[] / recordings[] |
| `teachers` | id / name / role(lead/assistant/life) / avatar / recordings[] |
| `banners` | id / fileID / url / caption / createdAt（orderBy desc） |

### 云存储 / COS（资源包）

| 优先级 | 资源包 ID | 容量 | 区域 | 到期 | 计费 |
| --- | --- | --- | --- | --- | --- |
| **P0**（默认消耗） | `free-free-std_storage-1777532470-0` | 50 GB | 全地域 | **2026-10-31** | 免费 |
| **P1**（兜底） | `std_storage-20260430782142354409091-0` | 50 GB | 中国大陆 | **2027-04-30** | 付费（手动续费） |

切换条件：(a) P0 到期 OR (b) P0 用量 ≥ 95%。
代码层不指定包，由腾讯云控制台「资源包管理」统一控制扣减顺序。

---

## 3. Cloudflare Pages（生产前端域名）

| 项 | 值 |
| --- | --- |
| 平台 | Cloudflare Pages |
| 项目名 | `zy-memoir` |
| **生产域名** | https://zy-memoir.pages.dev/ |
| Preview 域名格式 | `https://<8-hex-hash>.zy-memoir.pages.dev/`（每次 deploy 变） |
| Dashboard | https://dash.cloudflare.com/?to=/:account/pages/view/zy-memoir |
| 关联 Git | GitHub → `liuheng368/zy-memoir` → `main` 分支 |
| 自定义域名 | （暂无） |

> 关键限制：CloudBase 免费版 CORS 阻止跨域调用，需要 Cloudflare Pages Functions 或 Worker 反代 `/api/*` → CloudBase 函数。
> 当前如未配反代，`/admin` 内 `adminCheck` 等接口可能 CORS 失败。

### 管理员入口快捷链接

```
https://zy-memoir.pages.dev/admin?token=<ADMIN_TOKEN>
```

`<ADMIN_TOKEN>` 通过 `pnpm sign:admin` 签发（默认 30 天有效）。

---

## 4. EdgeOne Pages（已配置反代，兼容方案）

| 项 | 值 |
| --- | --- |
| 平台 | 腾讯云 EdgeOne Pages（commit [`8ec60c1`](https://github.com/liuheng368/zy-memoir/commit/8ec60c1) 配置） |
| 控制台 | https://console.cloud.tencent.com/edgeone/pages |
| 用途 | Edge Function 反代 CloudBase 函数 API（绕开 CORS） |
| 状态 | 之前曾出现 401，待与 Cloudflare Pages 二选一确认主用平台 |

---

## 5. 关键密钥（仅记录位置，不落明文）

| 密钥名 | 存放位置 | 用途 | 轮换方式 |
| --- | --- | --- | --- |
| `ADMIN_HMAC_KEY` | CloudBase 函数 envVariables（`adminCheck` / `addBanner` / `removeBanner`）+ GitHub Secrets | admin token 签名 | 控制台改 envVariables → 同步更新 GitHub Secrets → 重新签发现有 admin token |
| `AUTH_HMAC_KEY` | CloudBase 函数 envVariables（`studentLogin` / `teacherLogin` 等 13 个函数）+ GitHub Secrets | 学生/老师 token 签名 | 同上；轮换会强制所有学生/老师重新登录 |
| `TENCENT_SECRET_ID/KEY` | GitHub Secrets（`TENCENT_SECRET_ID` / `TENCENT_SECRET_KEY`） | CI 部署 CloudBase | 腾讯云 CAM 控制台重新签发 |

> **轮换检查清单**：改 CloudBase env → 改 GitHub Secrets → 触发一次 CI 部署 → 用新 key 跑 `pnpm sign:admin` → 端到端验证管理员入口。

---

## 6. 常用脚本（[`scripts/`](scripts)）

| 脚本 | 命令 | 作用 |
| --- | --- | --- |
| [`sign-admin.mjs`](scripts/sign-admin.mjs) | `pnpm sign:admin [--days 30]` | 自动从 CloudBase 拉 ADMIN_HMAC_KEY 签发 admin token |
| [`sign-admin-token.mjs`](scripts/sign-admin-token.mjs) | `ADMIN_HMAC_KEY="xxx" pnpm sign:admin:env [--days 30]` | 显式 key 签发（CI / 离线） |
| [`deploy.mjs`](scripts/deploy.mjs) | `pnpm deploy:static` | 本地直接推静态前端到 CloudBase 静态托管 |
| [`backup.mjs`](scripts/backup.mjs) | `pnpm backup` | DB / COS 数据备份 |
| [`fix-cloudfn-perm.mjs`](scripts/fix-cloudfn-perm.mjs) | — | 修云函数公网调用权限 |
| [`ci-inject-fn-env.mjs`](scripts/ci-inject-fn-env.mjs) | （CI 内部） | 把 GitHub Secrets 注入 cloudbaserc.json envVariables |

---

## 7. 历史已下线 / 弃用

| 项 | 状态 | 备注 |
| --- | --- | --- |
| GitHub Pages（`https://liuheng368.github.io/zy-memoir/`） | ❌ 已下线（commit `1c06797`） | 仍需手动到 GitHub Settings → Pages 把 Source 改 None |
| `gh-pages` 分支 | （可选清理） | GitHub UI → Branches 删除 |
| `package.json::build:gh` script | ❌ 已删除 | |
| `vite.config.ts` `GH_PAGES` 三元 | ❌ 已删除（`base: '/'` 固定） | |
