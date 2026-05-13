# 账号 / 服务清单（zy-memoir）

> 本文档只保留当前仍使用的平台、控制台入口与关键标识。  
> 不收录密钥明文；密钥只记录存放位置与用途。

---

## 1. 代码仓库

| 项 | 值 |
| --- | --- |
| 平台 | GitHub |
| Owner | [`liuheng368`](https://github.com/liuheng368) |
| 仓库 | [`liuheng368/zy-memoir`](https://github.com/liuheng368/zy-memoir) |
| SSH 克隆 | `git@github.com:liuheng368/zy-memoir.git` |
| 默认 / 生产分支 | `main` |

### CI / 部署配置

| 文件 | 用途 |
| --- | --- |
| [`.gitlab-ci.yml`](.gitlab-ci.yml) | 构建并部署 EdgeOne Pages preview / production |
| [`edgeone.json`](edgeone.json) | EdgeOne Pages 构建配置 |

### CI 变量

| 变量 | 用途 |
| --- | --- |
| `EDGEONE_API_TOKEN` | EdgeOne Pages CI 部署 token |

---

## 2. CloudBase（腾讯云开发后端）

| 项 | 值 |
| --- | --- |
| envId | `zy-memoir-d5gaxbvyxe80564f4` |
| 别名 | `zy-memoir` |
| 地域 | `ap-shanghai` |
| 套餐 | 个人版 |
| 控制台 | https://console.cloud.tencent.com/tcb/env/index?envId=zy-memoir-d5gaxbvyxe80564f4 |
| 部署描述文件 | [`cloudbaserc.json`](cloudbaserc.json) |
| MCP 配置 | [`config/mcporter.json`](config/mcporter.json) |

### 云函数

| 函数 | 主要用途 | 环境变量需求 |
| --- | --- | --- |
| `studentLogin` | 学号 + 姓名校验，签发学生 token | `AUTH_HMAC_KEY` |
| `teacherLogin` | 老师身份校验，签发老师 token | `AUTH_HMAC_KEY` |
| `adminCheck` | 校验 admin token | `ADMIN_HMAC_KEY` |
| `seedStudents` | 从 COS 拉学生名单 JSON，写入 DB | — |
| `seedTeachers` | 从 COS 拉老师名单 JSON，写入 DB | — |
| `listTeachers` | 老师名单与主页老师风采区 | — |
| `listStudents` | 主页学生头像墙 | — |
| `getStudentDetail` | 学生详情页 | — |
| `updateStudentIntro` | 学生简介保存 | `AUTH_HMAC_KEY` |
| `addStudentPhoto` / `removeStudentPhoto` | 学生照片增删 | `AUTH_HMAC_KEY` |
| `updateStudentAvatar` | 学生头像更新 | `AUTH_HMAC_KEY` |
| `addStudentRecording` / `removeStudentRecording` | 学生录音增删 | `AUTH_HMAC_KEY` |
| `updateTeacherAvatar` | 老师头像更新 | `AUTH_HMAC_KEY` |
| `addTeacherRecording` / `removeTeacherRecording` | 老师录音增删 | `AUTH_HMAC_KEY` |
| `listBanners` | 主页合影轮播 | — |
| `addBanner` / `removeBanner` | 合影管理 | `ADMIN_HMAC_KEY` + `AUTH_HMAC_KEY` |

### 数据资源

| 资源 | 说明 |
| --- | --- |
| 文档数据库 | `students` / `teachers` / `banners` |
| 云存储 | 头像、照片、录音、合影素材 |

---

## 3. EdgeOne Pages（正式前端入口）

| 项 | 值 |
| --- | --- |
| 平台 | 腾讯云 EdgeOne Pages |
| 控制台 | https://console.cloud.tencent.com/edgeone/pages |
| 项目名 | `zy-memoir` |
| 构建命令 | `pnpm build` |
| 输出目录 | `dist` |
| Node.js | `22.11.0` |
| 生产分支 | `main` |

### 域名规划

| 域名 / 路径 | 用途 | 状态 |
| --- | --- | --- |
| `hrenycloud.net.cn` | 主域名 | 备案中 |
| `www.hrenycloud.net.cn` | 开发者官网入口 | 备案后绑定 |
| `www.hrenycloud.net.cn/zy-memoir` 或独立子域名 | 班级回忆录入口 | 备案后确认 |

### Edge Function

| 路径 | 用途 |
| --- | --- |
| [`functions/tcb/[[path]].ts`](functions/tcb/[[path]].ts) | 代理 `/tcb/*` 到 CloudBase API，避免浏览器跨域问题 |

---

## 4. 关键密钥

| 密钥名 | 存放位置 | 用途 |
| --- | --- | --- |
| `ADMIN_HMAC_KEY` | CloudBase 函数环境变量 | admin token 签名 |
| `AUTH_HMAC_KEY` | CloudBase 函数环境变量 | 学生/老师 token 签名 |
| `EDGEONE_API_TOKEN` | GitLab CI/CD Variables | EdgeOne Pages 自动部署 |

轮换检查：改 CloudBase env → 重新部署相关云函数 → 重新签发 admin token → 端到端验证。

---

## 5. 常用脚本

| 脚本 | 命令 | 作用 |
| --- | --- | --- |
| [`scripts/deploy.mjs`](scripts/deploy.mjs) | `pnpm run deploy:fn` | 打印 CloudBase 云函数部署命令 |
| [`scripts/backup.mjs`](scripts/backup.mjs) | `pnpm backup` | DB / COS 数据备份 |
| [`scripts/sign-admin.mjs`](scripts/sign-admin.mjs) | `pnpm sign:admin [--days 30]` | 从 CloudBase 拉取密钥并签发 admin token |
| [`scripts/sign-admin-token.mjs`](scripts/sign-admin-token.mjs) | `ADMIN_HMAC_KEY=\"xxx\" pnpm sign:admin:env` | 显式 key 签发 admin token |
| [`scripts/fix-cloudfn-perm.mjs`](scripts/fix-cloudfn-perm.mjs) | 手动执行 | 修云函数公网调用权限 |
| [`scripts/ci-inject-fn-env.mjs`](scripts/ci-inject-fn-env.mjs) | CI 内部 | 把 CI Secrets 注入 cloudbaserc.json envVariables |
