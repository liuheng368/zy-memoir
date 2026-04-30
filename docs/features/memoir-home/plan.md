# Memoir Home — 技术方案

> **文档分工**：**`plan.md`** 承载**技术方案**：**`## 概述`**、**`## 现状分析`**、**`## 页面交互细节`**（布局引用 spec/source、按模块拆交互、**本页**接口 path）、**`## API 梳理`**（接口：**方法**、**路径**、**Response**、**字段映射**）、**`## 架构设计`**（含 **功能模块划分**与 **`### 技术选型 / 约束`**）、**`## 技术方案`**（实现级：**文件改动清单**、**新增字段（预估）**）、**`## 方案澄清事项`**（与 [`spec.md`](./spec.md) **`### 澄清事项`** 形态一致：**`#### Qn`** + **`- [ ]`…`⚠️` / `- [x]`…`✅`**；**方案 / 实现向**）、**`## 风险与未决事项`**、**`## 验收标准`（AC）**、**`## 开发任务`**（层级勾选清单：按文件/Screen 拆解 UI 与逻辑）、**`## 实现计划`**、**`## 代码审查`**。**行为级页面描述与线框/截图** 以 [`spec.md`](./spec.md) **`## 页面交互描述`**（及 [`source/`](./source/)）为准；**`plan.md`** 本节做**工程向细化**并与 spec **互链**。**原始 PRD** 留存于 [`prd/`](./prd/)（主稿 [`prd/prd.md`](./prd/prd.md)）。
>
> **创建日期**：2026-04-29 · **最近更新**：2026-04-30（**v0.3**：登录浮层取消 Tab，改为按 URL 路由直接区分角色：`/` 学生 / `/teacher` 老师 / `/admin?token=` 管理员；**两个浮层完全独立、浮层内不互通**；新增 **Q-PLAN-16 登录浮层路由分工** + **Q-PLAN-17 浮层互通策略**）

## 概述

「**钟园幼儿园 2024 届大二班 班级回忆录**」是一个面向 **班级内部** 的轻量 **SPA**：

- **前端**：单一 Vue 3 SPA，响应式适配手机 / PC；
- **后端**：腾讯云 **CloudBase**（云数据库 + 云函数）做鉴权与业务数据；
- **存储**：CloudBase 自带 **COS** 存放头像、照片、录音文件；
- **角色**：**4 类**（学生 36 人 / 老师 3 人 / 管理员 / **游客**），由路由 + 登录态 + 是否「跳过登录」共同决定；游客态**仅前端 UI 降级**（隐藏所有编辑入口）+ **后端兜底拒写**（云函数侧基于 token / 角色校验）；
- **核心 5 页**：登录浮层、主页、学生浮层（主/客）、教师浮层（主）、管理员页。

**非功能约束**：

- **首屏 ≤ 3s**（4G / 桌面）：合影第一张 + 36 个学生头像首屏并发，需做缩略图 + 懒加载；
- **录音文件 60s MP3 ≈ 480 KB～1 MB**（96～128 kbps），单人 5 段总量 ≤ 5 MB；
- **图片**单张压缩 ≤ 3 MB（PRD 强制）；CloudBase 存储免费额度 5 GB，36 学生 + 3 老师初期 ≪ 5 GB；
- 仅班级群分享 URL 访问；不做 SEO（`<meta name="robots" content="noindex,nofollow">`）。

---

## 现状分析

> 本仓 `zy-memoir` 为**全新 Vue + CloudBase 项目**，除 spec / plan / PRD 外**无任何代码与基础设施**；以下三节列出可继承资产与必须新建项。

### 已有基础设施

- 仓库根目录：[`kindergarten_students_en_keys.json`](../../../kindergarten_students_en_keys.json)（36 名学生名单：`{ total, students: [{ id, name, gender }] }`）—— **PRD 指定**作为登录校验真源与 CloudBase 数据库初始化输入。**待挪入 Vue 工程**（建议 `src/assets/data/` 或 `scripts/seed/`）。
- 文档骨架：[`docs/features/memoir-home/`](.)。
- **无** Vue 工程脚手架 / **无** CI 配置。
- ✅ CloudBase 环境已就绪：`EnvId = zy-memoir-d5gaxbvyxe80564f4`（已写入仓库根 [`cloudbaserc.json`](../../../cloudbaserc.json)；G1 起 vite 工程后再写入 `.env.production` 的 `VITE_TCB_ENV_ID`）。
- ✅ CloudBase MCP 已配置：[`config/mcporter.json`](../../../config/mcporter.json)（agent 通过 `npx mcporter call cloudbase.<tool>` 操作云资源；凭证通过设备码登录获取，**不入仓库**）。

### 已有可复用 i18n 字符串

- **N/A**（本项目仅简体中文，无国际化需求；文案直接写在组件内或集中到 `src/locales/zh-CN.ts` 备查）。

### 已有可复用的 UI 组件

- **N/A**（首版自起；UI 库选型见 **`### 技术选型 / 约束`** 与 **`## 方案澄清事项` Q-PLAN-3**）。

---

## 页面交互细节

> 以 [`spec.md`](./spec.md) **`## 页面交互描述`** §1～§5 为输入；本节做工程级拆解（组件 / 文案 / 状态 / 接口触发）。模块编号与 spec **§1 ASCII 图 ①②③④** 对齐。

### 页面布局与素材引用（对齐 spec）

| spec 锚点 | 工程视图 / 组件 | 素材 |
| ---- | ---- | ---- |
| spec §1.1 主页 ①②③④ | `views/Home.vue` 内 `<HomeTopbar /> <BannerCarousel /> <TeacherSection /> <StudentWall />` | 待补 `source/pages/home.png`（设计稿） |
| spec §1.2 登录浮层 | `views/StudentLogin.vue`（路由 `/`，作为 `Home.vue` 之上的浮层）+ `views/TeacherLogin.vue`（路由 `/teacher`，同形态） | 待补 `source/pages/login-student.png` / `login-teacher.png` |
| spec §1.3 学生浮层 | `components/StudentOverlay.vue`（主/客态用 props 切换） | 待补 `source/pages/student-overlay.png` |
| spec §1.4 教师浮层 | `components/TeacherOverlay.vue`（仅主态） | 待补 `source/pages/teacher-overlay.png` |
| spec §1.5 管理员页 | `views/Admin.vue`（路由 `/admin`） | 待补 `source/pages/admin.png` |

### 模块交互拆解

#### M-① 顶栏 `HomeTopbar.vue`

- **复用**：`<UserBadge />`（角色徽标，新增 `guest` 视觉态）；`<AdminEntry v-if="isAdmin" />`。
- **可见性**：`isAdmin` 来自 `authStore.role === 'admin'`；学生 / 老师 / **游客**均**不渲染** ⚙ 入口。
- **触发接口**：
  - 学生 / 老师 / 管理员徽标气泡内「退出登录」→ `auth.logout()`（清本地 store + 跳 `/login`）；
  - **游客徽标**气泡内「**去登录**」→ `auth.openLoginPanel()`（重新挂载登录浮层，不清空浏览状态）。
- **AC 映射**：AC-1 / AC-4 / AC-5 / **AC-17**。

#### M-② 合影轮播 `BannerCarousel.vue`

- **复用**：可考虑 `swiper` 或自写（轻量 < 5 KB 优先自写；详 Q-PLAN-3）。
- **数据**：进入主页时 `classDataStore.fetchBanners()` → 取 `banners[]` 渲染。
- **行为**：自动 / 手动切换；空态显示占位；点击放大见 spec **Q-BANNER-ZOOM**（默认**不放大**，待确认）。
- **触发接口**：`bannersService.list()`（**API-5** `home.fetchBanners`）。
- **AC 映射**：AC-5 / AC-9。

#### M-③ 老师风采 `TeacherSection.vue`

- **复用**：`<TeacherCard />`（头像 + 姓名 + `<RecordingList />`）。
- **行为**：仅**当前登录老师**自己的卡片**可点开** `TeacherOverlay` 主态（spec Q-TEACHER-OTHER 默认 ⓛ）；其余角色（学生 / 管理员 / **游客**）按 spec 默认**不可点开**老师浮层，**录音条仍可直接播放**（无编辑能力，对游客天然友好）。
- **触发接口**：`teachersService.list()`（**API-6** `home.fetchTeachers`）。
- **AC 映射**：AC-5 / AC-8 / AC-12 / **AC-17**。

#### M-④ 学生头像墙 `StudentWall.vue`

- **复用**：`<StudentAvatar />`（圆形头像 + 默认占位）。
- **数据**：`classDataStore.students` 按 `id` 升序；首屏并发 36 个头像 → 走 COS 缩略图 + `loading="lazy"`。
- **行为**：点击 → 派 `openStudentOverlay(id)`；身份判定主/客态（`authStore.role === 'student' && authStore.studentId === id` 为 `owner`，否则为 `visitor`；**游客**统一为 `visitor`）。
- **触发接口**：`studentsService.list()`（**API-7** `home.fetchStudents`）。
- **AC 映射**：AC-5 / AC-6 / AC-7 / **AC-17**。

#### M-LOGIN 登录浮层（按 URL 拆分为两个**独立**组件，**浮层内不互通**）

- **`views/StudentLogin.vue`**（路由 `/`）：
  - 表单 `{ id: number, name: string }`，本地先校验是否 ∈ `kindergarten_students_en_keys.json` 再调云函数二次校验；
  - 提交 → `authService.studentLogin()`（**API-2**）；
  - 成功：写 `authStore` + LocalStorage，关闭浮层（仍在 `/`）；失败：Toast；
  - **不**包含跳转到老师登录的入口（**v0.3 决议**，**Q-PLAN-17**）。
- **`views/TeacherLogin.vue`**（路由 `/teacher`）：
  - 表单 `{ teacherId }`，3 个单选；
  - 提交 → `authService.teacherLogin()`（**API-3**）；
  - 成功：写 `authStore` + LocalStorage，`router.push('/')`；失败：Toast；
  - **不**包含跳转到学生登录的入口（**v0.3 决议**，**Q-PLAN-17**）。
- **共用底部**「↪ 跳过登录，仅浏览」按钮（推荐抽公共子组件 `<LoginSkipFooter />`，**仅承载跳过逻辑**，**不**承载角色互通）→ 调 `auth.skipToGuest()`（**纯前端 action，不发请求**）：
  - 设 `authStore.role = 'guest'`、清空 `studentId/teacherId/token`；
  - 是否持久化由 **Q-PLAN-15**（与 spec **Q-GUEST-PERSIST** 联动）决定，默认仅 `sessionStorage`；
  - 关闭浮层，落到 `/`；
  - 在 `Home.vue` 与所有浮层组件中通过 `mode` props **统一隐藏编辑入口**。
- **挂载**：登录浮层并非独立全屏 view，而是**叠加在 `Home.vue` 之上**的模态层；URL 仍为 `/` 或 `/teacher`，背景可看到主页轮廓（视觉上鼓励完成登录 / 跳过）。
- **AC 映射**：AC-2 / AC-3 / AC-11 / **AC-17**。

#### M-STUDENT-OVERLAY 学生浮层 `StudentOverlay.vue`

- props：`{ studentId: number, mode: 'owner' | 'visitor' }`（**游客统一以 `visitor` 渲染**，与已登录的"看他人"完全同源；UI 不再区分 visitor/guest）。
- mode 计算：`mode = (authStore.role === 'student' && authStore.studentId === studentId) ? 'owner' : 'visitor'`；当 `authStore.role === 'guest'` 时**强制** `visitor`。
- 进入时拉详情 → `studentsService.detail(id)`（**API-8** `student.fetchDetail`）。
- 主态编辑：自我介绍 `updateIntro`（**API-9** `student.updateIntro`）/ 头像 `uploadAvatar`（**API-10**）/ 照片 `addPhoto` `removePhoto`（**API-11 / API-12**）/ 录音 `addRecording` `removeRecording`（**API-13 / API-14**）。
- 客态 / 游客态：禁用所有编辑入口（`+`、换头像、长按删除、自我介绍 `tap` 编辑等均不绑定 / 不渲染）；仅显示；长按手势不响应。
- **AC 映射**：AC-6 / AC-7 / AC-12 / AC-13 / AC-14 / AC-15 / AC-16 / **AC-17**。

#### M-TEACHER-OVERLAY 教师浮层 `TeacherOverlay.vue`

- props：`{ teacherId: string, mode?: 'owner' | 'visitor' }`，**默认仅** `authStore.role === 'teacher' && authStore.teacherId === teacherId` 时渲染**主态**；其他角色（含 **游客**）若 spec **Q-TEACHER-OTHER** 决议为「允许只读查看」，则以 `visitor` 渲染（**只看头像 + 录音**）。
- 行为：主态可换头像 / 增删录音；客态 / 游客态仅播放。
- **触发接口**：`teachersService.detail(id)`（**API-15**）/ `updateAvatar`（**API-16**）/ `addRecording` `removeRecording`（**API-17 / API-18**）。
- **AC 映射**：AC-8 / AC-12 / AC-14 / AC-15 / **AC-17**。

#### M-ADMIN 管理员页 `Admin.vue`

- 进入路由 `/admin?token=xxx` → 调 `auth.adminCheck(token)`（**API-4**）→ 通过则写 `authStore.role = 'admin'`，否则跳 `/login`（**不自动转游客态**：`/admin` 路径必须显式 token 校验）。
- 网格列出合影；上传 / 删除合影；
- **触发接口**：`bannersService.list/add/remove`（**API-5 / API-19 / API-20**）。
- **AC 映射**：AC-4 / AC-9 / AC-10 / AC-14。

### 页面涉及接口

| Screen / 模块 | 接口 ID | 触发时机 | 调用形态 |
| ---- | ---- | ---- | ---- |
| StudentLogin.vue (`/`) | API-2 | 「进入」按钮 | `cloudbase.callFunction({ name: 'studentLogin', data: { id, name } })` |
| TeacherLogin.vue (`/teacher`) | API-3 | 「进入」按钮 | `cloudbase.callFunction({ name: 'teacherLogin', data: { teacherId } })` |
| Admin.vue 进入 | API-4 | 路由守卫 | `cloudbase.callFunction({ name: 'adminCheck', data: { token } })` |
| Home.vue 挂载 | API-5 / API-6 / API-7 | `onMounted` | `cloudbase.database().collection('banners' \| 'teachers' \| 'students').get()` |
| StudentOverlay 打开 | API-8 | `onOpen(studentId)` | `db.collection('students').doc(id).get()` |
| Student 主态保存 | API-9 / API-10 / API-11 / API-12 / API-13 / API-14 | 表单提交 / 上传完成 | `db.collection('students').doc(id).update()` + `cloudbase.uploadFile()` |
| TeacherOverlay 打开 | API-15 | `onOpen(teacherId)` | `db.collection('teachers').doc(id).get()` |
| Teacher 主态保存 | API-16 / API-17 / API-18 | 同上 | 同上模式 |
| Admin 操作合影 | API-19 / API-20 | 上传 / 删除 | `db.collection('banners').add()` / `.doc(id).remove()` + `uploadFile / deleteFile` |

> CloudBase 是 **BaaS**，**无传统 REST 路径**；下文 **`## API 梳理`** 用 **「调用形态 + payload + response」** 三段式描述契约，等价 `METHOD + path`。

---

## API 梳理

> CloudBase 没有 RESTful path；本节用 **`### API-n：<场景>`** 列出**调用形态**（`callFunction` / `database` / `uploadFile`）、**Request**、**Response Payload** 与 **字段映射**。云函数命名以 `kebab-case`，集合命名以 `lowerCamelCase`。

### API-1：导入 / 同步学生名单（启动期一次性 + 必要时手动重跑）

- **形态**：CloudBase **云函数 `seedStudents`**（运维场景，非业务接口）
- **触发**：项目部署前 `tcb fn run seedStudents` 或在 CloudBase 控制台手动执行
- **逻辑**：读取打包到云函数内的 `kindergarten_students_en_keys.json` → 写入集合 `students`，已存在则保持原有 `intro` / `avatar` / `photos` / `recordings` 不变（**upsert by `id`**）

### API-2：学生登录

- **形态**：`callFunction({ name: 'studentLogin', data: { id, name } })`
- **Request**：

```json
{ "id": 12, "name": "李苏" }
```

- **Response Payload**：

```json
{
  "ok": true,
  "token": "<JWT 或 CloudBase ticket>",
  "role": "student",
  "studentId": 12
}
```

- **失败 Response**：`{ "ok": false, "code": "NAME_MISMATCH" | "ID_NOT_FOUND" }`
- **字段映射**：

| API 字段 | 类型 | 对应 UI | 说明 |
| -------- | ---- | -------- | ---- |
| `id` | int | Login 学号输入框 | 1～36，PRD 名单 id |
| `name` | string | Login 姓名输入框 | 中文姓名 |
| `token` | string | `authStore.token` | 写入 LocalStorage |
| `role` | enum | `authStore.role` | 用于 UI 判断 |
| `studentId` | int | `authStore.studentId` | 主/客态判定 |

### API-3：教师登录

- **形态**：`callFunction({ name: 'teacherLogin', data: { teacherId } })`
- **Request**：`{ "teacherId": "teacher-a" }`
- **Response Payload**：

```json
{ "ok": true, "token": "...", "role": "teacher", "teacherId": "teacher-a" }
```

- **字段映射**：

| API 字段 | 类型 | 对应 UI | 说明 |
| -------- | ---- | -------- | ---- |
| `teacherId` | string | 老师单选按钮 | `teacher-a` / `teacher-b` / `teacher-c` |

### API-4：管理员校验

- **形态**：`callFunction({ name: 'adminCheck', data: { token } })`
- **Response Payload**：`{ "ok": true, "role": "admin" }` 或 `{ "ok": false }`
- **字段映射**：`token` 来自 URL `query.token`；服务端比对环境变量 `ADMIN_TOKEN`。

### API-5：拉取合影列表（首页）

- **形态**：`db.collection('banners').orderBy('createdAt', 'desc').get()`
- **Response Payload**：

```json
{
  "data": [
    {
      "_id": "auto-id",
      "fileID": "cloud://env/banners/2026-04/xxx.jpg",
      "url": "https://cdn.../xxx.jpg",
      "createdAt": 1714468800000,
      "uploadedBy": "admin"
    }
  ]
}
```

- **字段映射**：

| API 字段 | 类型 | 对应 UI | 说明 |
| -------- | ---- | -------- | ---- |
| `fileID` | string | （持久化） | COS 文件 ID，用于删除 |
| `url` | string | `<img src>` | 临时签名 URL（24h），过期前端兜底刷新 |
| `createdAt` | long | 排序键 | UTC 毫秒 |

### API-6：拉取老师列表（首页）

- **形态**：`db.collection('teachers').orderBy('order', 'asc').get()`
- **Response Payload**：

```json
{
  "data": [
    {
      "_id": "teacher-a",
      "name": "张老师",
      "avatar": { "fileID": "...", "url": "..." },
      "recordings": [
        { "id": "r1", "fileID": "...", "url": "...", "duration": 42 }
      ],
      "order": 1
    }
  ]
}
```

- **字段映射**：

| API 字段 | 类型 | 对应 UI | 说明 |
| -------- | ---- | -------- | ---- |
| `_id` | string | `teacherId` | 与登录结果一致 |
| `name` | string | TeacherCard 姓名 |  |
| `avatar.url` | string | TeacherCard 头像 |  |
| `recordings[].duration` | int (s) | RecordingList 时长 | 0～60 |
| `order` | int | 排序 | 1/2/3 |

### API-7：拉取学生列表（首页 — 仅头像 + 姓名 + 是否有照片/录音的元信息）

- **形态**：`db.collection('students').field({ id: true, name: true, gender: true, avatar: true, photoCount: true, recordingCount: true }).orderBy('id', 'asc').get()`
- **Response Payload**：

```json
{
  "data": [
    {
      "_id": "1",
      "id": 1,
      "name": "金智雅",
      "gender": "female",
      "avatar": { "url": "..." },
      "photoCount": 2,
      "recordingCount": 0
    }
  ]
}
```

- **字段映射**：

| API 字段 | 类型 | 对应 UI | 说明 |
| -------- | ---- | -------- | ---- |
| `id` | int | 头像墙排序键 | 1～36 |
| `name` | string | 浮层标题 | 不展示在头像墙 |
| `avatar.url` | string | StudentAvatar `<img>` | 缺则显示默认占位 |

### API-8：拉取学生详情（学生浮层打开）

- **形态**：`db.collection('students').doc(String(studentId)).get()`
- **Response Payload**：

```json
{
  "data": {
    "_id": "12",
    "id": 12,
    "name": "李苏",
    "gender": "female",
    "intro": "我喜欢画画……",
    "avatar": { "fileID": "...", "url": "..." },
    "photos": [
      { "id": "p1", "fileID": "...", "url": "...", "createdAt": 1714468800000 }
    ],
    "recordings": [
      { "id": "r1", "fileID": "...", "url": "...", "duration": 30, "createdAt": 1714468800000 }
    ]
  }
}
```

- **字段映射**：

| API 字段 | 类型 | 对应 UI | 说明 |
| -------- | ---- | -------- | ---- |
| `intro` | string ≤ 300 | 自我介绍区 | 主态可改 |
| `photos[]` | array ≤ 3 | 照片网格 | 主态可增删 |
| `recordings[]` | array ≤ 5 | 录音列表 | 主态可增删 |

### API-9：保存学生自我介绍

- **形态**：`db.collection('students').doc(String(studentId)).update({ intro })`
- **Request**：`{ "intro": "新介绍文本（≤300 字）" }`
- **Response**：`{ "stats": { "updated": 1 } }`
- **校验**：云函数侧再做 `intro.length <= 300` 与 XSS 转义。

### API-10：上传 / 替换学生头像

1. **客户端压缩** → ≤ 3 MB；
2. `cloudbase.uploadFile({ cloudPath: 'students/12/avatar/<uuid>.<ext>', filePath: blob })` → 得 `fileID`；
3. `db.collection('students').doc('12').update({ avatar: { fileID, url } })`；
4. **旧文件**异步删除（**Q-AVATAR-OVERWRITE** 决议后定）。

### API-11：新增学生照片（≤ 3 张约束）

- 客户端校验 `photos.length < 3` → 压缩 → `uploadFile` → `db.update({ photos: _.push([{ id, fileID, url, createdAt }]) })`（CloudBase `_` = `db.command`）；
- 服务端云函数 `addStudentPhoto` 兜底校验上限。

### API-12：删除学生照片

- `db.update({ photos: _.pull({ id: photoId }) })` + 异步 `cloudbase.deleteFile([fileID])`。

### API-13：新增学生录音（≤ 5 段、≤ 60s、MP3）

- 客户端：`MediaRecorder` 录制 → `lamejs` 编码 MP3 → `uploadFile` → `db.update({ recordings: _.push([{ id, fileID, url, duration, createdAt }]) })`。
- 服务端云函数 `addStudentRecording` 兜底校验 `recordings.length < 5` && `duration <= 60` && `Content-Type === audio/mpeg`。

### API-14：删除学生录音

- 同 API-12，集合字段名换为 `recordings`。

### API-15：拉取教师详情

- `db.collection('teachers').doc(teacherId).get()`，结构同 API-6 单条。

### API-16：教师换头像

- 同 API-10，集合换 `teachers`，路径 `teachers/<id>/avatar/<uuid>.<ext>`。

### API-17：教师新增录音

- 同 API-13，**录音上限默认 10**（**Q-PLAN-12**）。

### API-18：教师删除录音

- 同 API-14。

### API-19：管理员上传合影

- `cloudbase.uploadFile({ cloudPath: 'banners/<yyyy-MM>/<uuid>.<ext>' })` → `db.collection('banners').add({ fileID, url, createdAt: Date.now(), uploadedBy: 'admin' })`。
- 云函数 `addBanner` 兜底校验 `Authorization` header（管理员 token）。

### API-20：管理员删除合影

- `db.collection('banners').doc(id).remove()` + `cloudbase.deleteFile([fileID])`。

---

## 架构设计

### 系统架构概览

```
┌──────────────────────────────────────────────────────────────┐
│                    Vue 3 SPA (静态托管)                        │
│  ┌────────────┐  ┌────────────┐  ┌────────────┐              │
│  │  Views     │  │ Components │  │ Composables│              │
│  │ Login/Home │  │ Overlays   │  │ useUpload  │              │
│  │ Admin      │  │ Carousel   │  │ useRecorder│              │
│  └─────┬──────┘  └─────┬──────┘  └─────┬──────┘              │
│        │  Pinia (auth, classData)      │                      │
│        └────────────┬─────────────────┘                       │
│                     │                                          │
│              ┌──────▼──────┐                                  │
│              │ api/cloudbase│ ← 单例 SDK 封装                  │
│              └──────┬──────┘                                  │
└─────────────────────┼─────────────────────────────────────────┘
                      │ HTTPS（CloudBase JS SDK）
        ┌─────────────┴────────────────────────────┐
        │                                          │
   ┌────▼────────┐                          ┌─────▼──────┐
   │ Cloud DB    │                          │ Cloud COS   │
   │ (collections)│                         │ (objects)   │
   │ ─ students  │                          │ students/   │
   │ ─ teachers  │                          │ teachers/   │
   │ ─ banners   │                          │ banners/    │
   └────┬────────┘                          └─────────────┘
        │ trigger
   ┌────▼─────────────┐
   │ Cloud Functions  │
   │ ─ studentLogin   │
   │ ─ teacherLogin   │
   │ ─ adminCheck     │
   │ ─ seedStudents   │
   │ ─ addStudent*    │  ← 兜底校验上限 / 时长 / MIME
   │ ─ addBanner      │
   └──────────────────┘
```

### 功能模块划分

| 模块 | 路径（Vue 工程相对路径） | 职责 |
| ---- | ---- | ---- |
| **路由 & 守卫** | `src/router/index.ts` | 定义 `/`、`/teacher`、`/admin` 三路由；登录态守卫；**`/` 未登录弹学生登录浮层 / `/teacher` 未登录弹老师登录浮层；浮层支持跳过 → guest；两个浮层完全独立、浮层内不互通**（误打开请用户手动改 URL） |
| **状态管理** | `src/stores/auth.ts`、`src/stores/classData.ts` | Pinia：登录态（含 **`guest`**）、合影/老师/学生缓存、当前打开浮层；导出 `isReadOnly = role === 'guest' \|\| ...` 工具 getter |
| **API 适配层** | `src/api/cloudbase.ts`、`src/api/auth.ts`、`src/api/students.ts`、`src/api/teachers.ts`、`src/api/banners.ts` | CloudBase JS SDK 单例 + 各业务 service |
| **Composables** | `src/composables/useUpload.ts`、`useRecorder.ts`、`useImageCompress.ts`、`useMp3Encode.ts`、`useAudioPlayer.ts` | 跨组件复用的录音 / 上传 / 压缩 / 编码 / 播放逻辑 |
| **视图层** | `src/views/Home.vue`、`src/views/StudentLogin.vue`（路由 `/`）、`src/views/TeacherLogin.vue`（路由 `/teacher`）、`src/views/Admin.vue` | 路由直接区分角色：`/` 学生 / `/teacher` 老师 / `/admin` 管理员；登录浮层组件常驻于对应视图 |
| **组件层（主页）** | `src/components/HomeTopbar.vue`、`BannerCarousel.vue`、`TeacherSection.vue`、`TeacherCard.vue`、`StudentWall.vue`、`StudentAvatar.vue` | 主页四区组件 |
| **组件层（浮层）** | `src/components/StudentOverlay.vue`、`TeacherOverlay.vue`、`RecordModal.vue`、`UploadModal.vue`、`ConfirmDialog.vue`、`Toast.vue` | 浮层与共用弹层 |
| **工具 & 常量** | `src/utils/validators.ts`、`src/utils/constants.ts`、`src/utils/cosFile.ts` | 校验、常量（上限值等）、COS fileID 处理 |
| **静态资源** | `src/assets/data/kindergarten_students_en_keys.json`、`src/assets/img/default-avatar/`、`src/assets/img/banner-empty.png` | 名单 + 占位资源 |
| **后端 / 云函数** | `cloudfunctions/studentLogin/`、`teacherLogin/`、`adminCheck/`、`seedStudents/`、`addStudentPhoto/`、`addStudentRecording/`、`addBanner/` | 鉴权 + 兜底校验 |
| **CloudBase 配置** | `cloudbaserc.json`（✅ 已建，含 `envId=zy-memoir-d5gaxbvyxe80564f4`）、`.env`（待 G1 一起建，注入 `VITE_TCB_ENV_ID`） | 部署 / SDK 初始化 |
| **MCP 配置** | `config/mcporter.json`（✅ 已建） | agent 通过 `npx mcporter call cloudbase.*` 操作云资源 |

### 技术选型 / 约束

| 维度 | 选型 | 备注 |
| ---- | ---- | ---- |
| **框架** | **Vue 3 + `<script setup>` + TypeScript** | 默认推荐；Vue 2 仅在严格生态约束下考虑（**Q-PLAN-1**） |
| **构建** | **Vite 5** | 与 Vue 3 默认搭配 |
| **路由** | **vue-router 4** | history 模式；CloudBase 静态托管支持回退（**Q-PLAN-4**） |
| **状态管理** | **Pinia** | 官方推荐，TS 友好（**Q-PLAN-2**） |
| **UI 库** | **自起 + 少量 Naive UI 组件**（Toast / Dialog） | 36 头像墙的"非常规布局"自写 SVG/CSS（**Q-PLAN-3**） |
| **轮播** | 自写 + CSS scroll-snap，或 `swiper-vue` | 自写优先节流体积（**Q-PLAN-3**） |
| **图片压缩** | **`browser-image-compression`** | 浏览器内压缩 ≤ 3 MB（**Q-PLAN-6**） |
| **录音** | **`MediaRecorder` 原生 API** | iOS Safari 14+ 支持，但 MIME 限定 `audio/webm`、`audio/mp4` |
| **MP3 编码** | **`@breezystack/lamejs`**（浏览器内编码） | ~120 KB；规避云端转码成本（**Q-PLAN-5**） |
| **音频播放** | 原生 `<audio>` + `useAudioPlayer` 单例（保证全局**只播一条**） | 不引第三方 |
| **后端 SDK** | **`@cloudbase/js-sdk`**（含 db / functions / storage） | 单例初始化 |
| **鉴权** | CloudBase **匿名登录** + 自定义云函数发放短期 token | **Q-PLAN-8** |
| **部署** | CloudBase **静态网站托管** + 函数 + COS 一站式 | 备选 Vercel + CloudBase |
| **存储计费** | **优先消耗免费包 → 满后切付费包**（详见「### 存储 / COS 资源包消耗策略」） | 包 ID 与切换条件硬约束 |
| **包管理** | **pnpm** | monorepo-friendly |
| **代码风格** | ESLint + Prettier + Vue 官方 style guide |  |
| **浏览器支持** | iOS Safari 14+ / Chrome 90+ / Edge 90+ | 微信浏览器内置 |
| **不做** | PWA / 离线队列 / SSR / i18n / 单元测试覆盖率门槛 | 本期范围明确排除 |

### 存储 / COS 资源包消耗策略

> **业务原则**：所有头像 / 照片 / 录音 / 合影上传一律走腾讯云 COS 标准存储；**优先消耗免费包**，**该包用尽 OR 到期（孰先）后切付费包**，**严禁直接消耗付费包**。

#### 资源包基线（控制台快照 · 2026-04-30）

| 优先级 | 包名 | 资源包 ID | 容量 | 地域 | 生效 | 到期 | 当前用量 | 续费 |
| ---- | ---- | ---- | ---- | ---- | ---- | ---- | ---- | ---- |
| **P0**（先用） | 标准存储容量包（免费） | `free-free-std_storage-1777532470-0` | **50 GB** | 全部（公有云地域） | 2026-04-30 | **2026-10-31 23:59:59**（**仅 6 个月**） | 0%（0 B） | —（免费，过期作废） |
| **P1**（兜底） | 标准存储容量包（付费） | `std_storage-20260430782142354409091-0` | **50 GB** | 中国大陆通用 | 2026-04-30 | **2027-04-30 23:59:59**（1 年） | 0%（0 B） | 手动续费 |

#### 容量预测（用于校准策略）

| 类目 | 单条上限 | 估算条目 | 小计 |
| ---- | ---- | ---- | ---- |
| 学生头像 | ≤ 3 MB | 36 张 | 108 MB |
| 学生照片墙 | ≤ 3 MB/张 × ~5 张 | 36 人 | ~540 MB |
| 学生录音 | 60s MP3 ≈ 1 MB × ~3 段 | 36 人 | ~108 MB |
| 老师头像 + 录音 | 类似 | 3 人 | ~60 MB |
| 合影轮播 | ≤ 3 MB × ~50 张 | 50 张 | ~150 MB |
| **合计预估** | | | **≈ 1 GB**（极度悲观 ≤ 3 GB） |

> **关键事实**：预估总用量 ≈ 1 GB ≪ P0 50 GB，**P0 包大概率带 90%+ 余量在 2026-10-31 过期作废**；正常路径**永远不会**触发"P0 用尽 → 切 P1"，触发的反而是**到期切换**。

#### 实施约定

1. **包消耗顺序由腾讯云控制台统一控制**，**前端 / 云函数 SDK 代码侧无法**也**不应**在 `uploadFile` / `db.collection` 里指定具体资源包；CloudBase 默认会按"免费包优先 → 付费包兜底"的顺序自动扣减，本约束属**运营 / 巡检层**而非**代码层**。
2. **切换条件（任一触发即切 P1）**：
   - **(a) 到期硬约束**：当前时间 ≥ **2026-10-31 23:59:59**（P0 到期），自然滚动到 P1；
   - **(b) 容量软约束**：P0 用量 ≥ 95%（容量预测看几乎不可能触发，但保留作为兜底）。
3. **核对路径**：腾讯云 COS 控制台 → [资源包管理](https://console.cloud.tencent.com/cos/package) → 标准存储 → 确认 P0 / P1 都"已生效" + P0 优先级高于 P1。
4. **监控阈值**：
   - **P0 用量 ≥ 80%**：预警（理论上不应该触发，触发说明有异常上传 / 被刷）；
   - **P0 用量 ≥ 95%**：评估（清理无效素材 vs 启用 P1）；
   - **P0 剩余有效期 ≤ 30 天**（即 ≥ 2026-10-01 起）：在 G12 月度备份脚本里发出"即将过期，准备切 P1"提醒；
   - 预警手段在 G12「月度备份脚本」内顺带跑 `manageStorage` 用量 + 包剩余天数统计。
5. **P0 过期前的运营动作（2026-10 月内手工 1 次）**：
   - 跑一次全量备份脚本 → 校准实际用量；
   - 决策：**(i)** 是否继续买新免费 / 活动包占 P0 位（理想，零成本续）；**(ii)** 接受滚到 P1，跟踪扣费；
   - 无论 (i) / (ii)，**都不需要改代码**，仅在控制台调资源包优先级。
6. **agent 操作约束**：当通过 cloudbase MCP 触发 `manageStorage` / `uploadFiles` 等操作时，**不得**额外购买或调整存储包；如发现 P0 包将耗尽 / 即将到期，**先停止异常上传 + 通知运营**，再由人工决定是否启用 P1 / 续 P0。
7. **本约束适用范围**：本项目 `cloudbaserc.json::envId = zy-memoir-d5gaxbvyxe80564f4` 下所有 COS bucket；与项目无关的其他环境不在本约束内。

---

## 技术方案

### 文件改动清单

| 文件 | 改动类型 | 状态 | 说明 |
| ---- | -------- | ---- | ---- |
| `package.json` | 新增 | ⬜ | Vue3 + Vite + TS + 依赖 |
| `pnpm-lock.yaml` | 新增 | ⬜ |  |
| `vite.config.ts` | 新增 | ⬜ | base / alias / 静态资源 / build target |
| `tsconfig.json` `tsconfig.node.json` | 新增 | ⬜ |  |
| `index.html` | 新增 | ⬜ | `<meta name="robots" content="noindex,nofollow">` |
| `.env` `.env.production` | 新增 | ⬜ | `VITE_TCB_ENV_ID=zy-memoir-d5gaxbvyxe80564f4`（G1 vite 工程起来后落） |
| `cloudbaserc.json` | 新增 | ✅ | CloudBase 部署配置（含 envId、4 个云函数描述） |
| `config/mcporter.json` | 新增 | ✅ | CloudBase MCP（device-code 登录，无凭证入仓） |
| `.gitignore` | 新增 | ✅ | 屏蔽 `node_modules` / `.env*.local` / `.cloudbase/` / `dist/` 等 |
| `src/main.ts` | 新增 | ⬜ | 创建 Pinia / Router / 挂载根组件 |
| `src/App.vue` | 新增 | ⬜ | `<RouterView />` + `<Toast />` 容器 |
| `src/router/index.ts` | 新增 | ⬜ | 三路由 + 守卫 |
| `src/stores/auth.ts` | 新增 | ⬜ | login / logout / role 判定 |
| `src/stores/classData.ts` | 新增 | ⬜ | banners / teachers / students 缓存 |
| `src/api/cloudbase.ts` | 新增 | ⬜ | SDK 单例 + init |
| `src/api/auth.ts` | 新增 | ⬜ | studentLogin / teacherLogin / adminCheck |
| `src/api/students.ts` | 新增 | ⬜ | list / detail / updateIntro / addPhoto / removePhoto / addRecording / removeRecording / uploadAvatar |
| `src/api/teachers.ts` | 新增 | ⬜ | list / detail / uploadAvatar / addRecording / removeRecording |
| `src/api/banners.ts` | 新增 | ⬜ | list / add / remove |
| `src/composables/useUpload.ts` | 新增 | ⬜ | 通用上传封装（progress / retry） |
| `src/composables/useRecorder.ts` | 新增 | ⬜ | MediaRecorder 包装 + 60s 倒计时 |
| `src/composables/useImageCompress.ts` | 新增 | ⬜ | 压缩到 ≤ 3 MB |
| `src/composables/useMp3Encode.ts` | 新增 | ⬜ | lamejs 包装 |
| `src/composables/useAudioPlayer.ts` | 新增 | ⬜ | 全局单实例播放（互斥） |
| `src/utils/validators.ts` | 新增 | ⬜ | 学号 + 姓名匹配 |
| `src/utils/constants.ts` | 新增 | ⬜ | MAX_PHOTOS=3、MAX_RECORDINGS=5、MAX_REC_DURATION=60、MAX_INTRO=300 |
| `src/utils/cosFile.ts` | 新增 | ⬜ | fileID 解析、临时 URL 刷新 |
| `src/views/Home.vue` | 新增 | ⬜ | M-① ② ③ ④ |
| `src/views/StudentLogin.vue` | 新增 | ⬜ | M-LOGIN-STUDENT（路由 `/`，未登录态弹出学生登录浮层） |
| `src/views/TeacherLogin.vue` | 新增 | ⬜ | M-LOGIN-TEACHER（路由 `/teacher`，未登录态弹出老师登录浮层） |
| `src/components/LoginSkipFooter.vue` | 新增 | ⬜ | 共用「↪ 跳过登录，仅浏览」按钮（**仅承载跳过逻辑**，不承载角色互通；v0.3 决议浮层内不互通） |
| `src/views/Admin.vue` | 新增 | ⬜ | M-ADMIN |
| `src/components/HomeTopbar.vue` | 新增 | ⬜ |  |
| `src/components/BannerCarousel.vue` | 新增 | ⬜ |  |
| `src/components/TeacherSection.vue` `TeacherCard.vue` | 新增 | ⬜ |  |
| `src/components/StudentWall.vue` `StudentAvatar.vue` | 新增 | ⬜ | **⚠️** 头像墙布局待 spec Q-LAYOUT |
| `src/components/StudentOverlay.vue` | 新增 | ⬜ | 主/客态由 props 切换 |
| `src/components/TeacherOverlay.vue` | 新增 | ⬜ | 仅主态 |
| `src/components/RecordModal.vue` `UploadModal.vue` `ConfirmDialog.vue` `Toast.vue` | 新增 | ⬜ |  |
| `src/assets/data/kindergarten_students_en_keys.json` | 新增（迁移） | ⬜ | 由仓库根 [`kindergarten_students_en_keys.json`](../../../kindergarten_students_en_keys.json) 移入 |
| `src/assets/img/default-avatar/{boy,girl}.svg` | 新增 | ⬜ | 默认头像占位 |
| `src/assets/img/banner-empty.png` | 新增 | ⬜ | 合影空态 |
| `cloudfunctions/studentLogin/` | 新增 | ⬜ | Node.js 16 + `@cloudbase/node-sdk` |
| `cloudfunctions/teacherLogin/` | 新增 | ⬜ |  |
| `cloudfunctions/adminCheck/` | 新增 | ⬜ | 比对环境变量 `ADMIN_TOKEN` |
| `cloudfunctions/seedStudents/` | 新增 | ⬜ | 启动期一次性 / 手动重跑 |
| `cloudfunctions/addStudentPhoto/`、`addStudentRecording/`、`updateStudentIntro/` | 新增 | ⬜ | 兜底校验上限 / 时长 / MIME |
| `cloudfunctions/addTeacherRecording/`、`addBanner/`、`removeBanner/` | 新增 | ⬜ |  |
| `scripts/seed-students.mjs` | 新增 | ⬜ | 本地 / CI 调用 `seedStudents` 云函数的脚手架 |
| `README.md`（仓库根） | 新增 | ⬜ | 项目说明 + 启动 / 部署命令 |

> **注**：本表为预估，最终行数与组件拆分以实现时为准；移动 `kindergarten_students_en_keys.json` 后，仓库根可保留软链接或删除。

### 新增字段（预估）

> 前端语言为 **TypeScript**；以下为关键 Pinia store / UiState / 组件 props 的类型骨架。

```ts
// src/stores/auth.ts
type Role = 'student' | 'teacher' | 'admin' | 'guest' | null
interface AuthState {
  role: Role
  studentId: number | null     // 仅 role=student
  teacherId: string | null     // 仅 role=teacher
  token: string | null         // guest / null 时为 null
  loadedAt: number | null
  guestPersist: 'session' | 'local' | 'none'  // 游客态持久化策略，见 Q-PLAN-15
}

// getters / actions
//   isLoggedIn   = role === 'student' || role === 'teacher' || role === 'admin'
//   isGuest      = role === 'guest'
//   isReadOnly   = role === 'guest' || role === 'teacher' || role === null
//                  // student/admin 在自己边界内可写；具体由各浮层 mode 再判定
//   skipToGuest()       -> set role='guest'，按 guestPersist 写 session/local
//   openLoginPanel()    -> 仅打开登录浮层，不清空当前浏览态
//   logout()            -> 清空一切，跳 /login

// src/stores/classData.ts
interface BannerItem { _id: string; fileID: string; url: string; createdAt: number }
interface TeacherItem { _id: string; name: string; avatar: { fileID: string; url: string } | null; recordings: RecordingItem[]; order: number }
interface StudentBrief { _id: string; id: number; name: string; gender: 'male' | 'female'; avatar: { url: string } | null; photoCount: number; recordingCount: number }
interface StudentDetail extends StudentBrief { intro: string; photos: PhotoItem[]; recordings: RecordingItem[] }
interface PhotoItem { id: string; fileID: string; url: string; createdAt: number }
interface RecordingItem { id: string; fileID: string; url: string; duration: number; createdAt: number }

interface ClassDataState {
  banners: BannerItem[]
  teachers: TeacherItem[]
  students: StudentBrief[]            // 主页头像墙
  studentDetailCache: Record<number, StudentDetail>  // 浮层打开时填充
  loading: { banners: boolean; teachers: boolean; students: boolean }
  error: { banners?: string; teachers?: string; students?: string }
}

// 浮层 props
//   mode='owner'   - 仅当前用户本人编辑
//   mode='visitor' - 客态 / 游客态（UI 完全一致）
interface StudentOverlayProps { studentId: number; mode: 'owner' | 'visitor' }
interface TeacherOverlayProps { teacherId: string; mode: 'owner' | 'visitor' }   // 客/游客态如开放则为 'visitor'

// useRecorder
interface RecorderState {
  status: 'idle' | 'recording' | 'paused' | 'preview' | 'uploading' | 'error'
  elapsed: number          // 秒，0~60
  blob: Blob | null        // 编码后 MP3
  duration: number | null
  error: string | null
}

// useUpload
interface UploadTask {
  id: string
  kind: 'avatar' | 'photo' | 'recording' | 'banner'
  progress: number   // 0~100
  status: 'pending' | 'uploading' | 'success' | 'failed'
  fileID?: string
  url?: string
  errorCode?: string
}
```

---

## 方案澄清事项

> **与 [`spec.md`](./spec.md) `### 澄清事项` 分工**：spec 收**需求 / 产品**待确认；本节收**实现方案分叉**（动效路径、技术选型 A/B、状态拆分等），供研发或评审勾选。形态与 spec 一致：**`#### Qn`** + **`- [ ]`…`⚠️` / `- [x]`…`✅`**。

#### Q-PLAN-1：Vue 版本（**Vue 3** 默认推荐）

- [x] **Vue 3 + `<script setup>` + TypeScript + Vite 5** ✅
- [ ] Vue 2 + JavaScript（仅当生态约束强制时） ⚠️

#### Q-PLAN-2：状态管理

- [x] **Pinia** ✅
- [ ] Vuex 4（不推荐，已弃用） ⚠️

#### Q-PLAN-3：UI 库

- [x] **方案 A**：**自写组件** + **Naive UI** 的 `useMessage` / `useDialog` / `useNotification`（推荐：体积可控，符合"非常规布局"）⚠️
- [ ] **方案 B**：移动端 Vant + PC 端 Element Plus（双库 ~ 600 KB） ⚠️
- [ ] **方案 C**：完全自写（最纯净，但 Toast / Dialog 等需手撸） ⚠️

#### Q-PLAN-4：路由模式

- [x] **history 模式** + CloudBase 静态托管 fallback（推荐，URL 干净） ⚠️
- [ ] hash 模式（最省事，URL 带 `#`） ⚠️

#### Q-PLAN-5：MP3 编码方式

- [x] **客户端 lamejs** 编码（无服务端成本，包体 ~120 KB）⚠️
- [ ] 客户端录 webm/wav，**云函数 ffmpeg** 转码（包体小但函数算力贵） ⚠️
- [ ] 直接保存 webm，前端 `<audio>` 播放（**违反 PRD「保存格式 MP3」**） ⚠️

> 推荐 **lamejs**：满足 PRD 强制 MP3，且包体可接受；iOS 兼容性可接受。

#### Q-PLAN-6：图片压缩库

- [x] **`browser-image-compression`**（API 简洁，~25 KB）⚠️
- [ ] `compressorjs`（基于 Canvas，体积更小） ⚠️
- [ ] 自写 Canvas（最小但需自处理 EXIF 旋转） ⚠️

#### Q-PLAN-7：录音库

- [x] **原生 `MediaRecorder`**（推荐；iOS Safari 14+ 支持） ⚠️
- [ ] `RecordRTC`（兼容性更好但体积大） ⚠️
- [ ] `Recorder.js`（不再维护） ⚠️

#### Q-PLAN-8：CloudBase 鉴权方案

- [x] **方案 A**：CloudBase 匿名鉴权 + 云函数返回自签 JWT，前端存 LocalStorage；后续 db 操作走匿名身份，**写权限**靠云函数侧校验 JWT ⚠️
- [ ] **方案 B**：CloudBase 自定义鉴权（custom auth，需登录态绑定 openid 风格 ticket） ⚠️
- [ ] **方案 C**：完全前端校验（只用 db 安全规则限制 read/write）—**不推荐**，无法实现"学生只能改自己" ⚠️

#### Q-PLAN-9：学生头像墙的"非常规布局"实现（依赖 spec **Q-LAYOUT** 决议）

- [x] **方案 A+（推荐）**：预设锚点散落布局  
  - 使用 `position: absolute`
  - 每个头像使用 `{ x, y, size, color, zIndex }`
  - 坐标使用百分比，适配不同屏幕宽度
  - 头像允许轻微重叠
  - 不做复杂碰撞检测
  - 不使用真实随机，避免每次刷新布局变化
- [ ] **方案 B（圆形围聚）**：CSS `transform: rotate + translate` 公式排布；或 SVG `<g transform>` ⚠️
- [ ] **方案 C（螺旋 / 风车）**：JS 计算极坐标 → 绝对定位 ⚠️
- [ ] **方案 D（错位卡片）**：CSS Grid `grid-auto-flow: dense` + 部分 `span 2` ⚠️

#### Q-PLAN-10：PWA / Service Worker

- [x] **不做** PWA、不做离线缓存（与 spec **Q-OFFLINE** 一致） ✅

#### Q-PLAN-11：部署

- [x] **CloudBase 静态网站托管** + **CloudBase 函数 / COS**（一站式，国内访问稳定） ⚠️
- [ ] Vercel / Netlify 静态托管 + CloudBase 后端（CDN 更广但跨境慢） ⚠️
- [ ] GitHub Pages 静态 + CloudBase 后端（成本最低） ⚠️

#### Q-PLAN-12：教师录音上限（与 spec **Q-TEACHER-MAX** 联动）

- [ ] **10 段**（默认提议） ⚠️
- [x] **不限**（信任老师，前端不卡） ⚠️
- [ ] 与学生一致 **5 段** ⚠️

#### Q-PLAN-13：CloudBase 数据集合分裂 vs 合并

- [x] **三集合**：`students` / `teachers` / `banners`（推荐：边界清晰，权限规则简单） ✅
- [ ] 单集合 `media` + `type` 字段（适合素材聚合查询，但权限规则复杂） ⚠️

#### Q-PLAN-14：管理员页与登录浮层是否复用

- [x] **不复用**：`/admin` 是独立 view，无登录浮层；管理员路由直达后由 `adminCheck` 云函数校验 token，通过则写入 `authStore.role='admin'` ✅
- [ ] 复用登录浮层，加「管理员」隐藏 Tab（与 PRD「无需登录」表述矛盾） ⚠️

#### Q-PLAN-16：登录浮层路由分工（**v0.3 新增**）

- [x] **方案 A**：**按 URL 直接区分角色** —— `/` 弹学生登录浮层、`/teacher` 弹老师登录浮层、`/admin?token=` 直通管理员（不弹浮层）；两个浮层底部共用 `<LoginSkipFooter />` 仅承载「↪ 跳过登录」 ✅
- [ ] **方案 B（已废弃）**：单一 `Login.vue`，浮层内部「学生 / 老师」Tab 切换 —— 两个角色字段差异大（学生为学号 + 姓名两输入框；老师为单选下拉），Tab 切换时输入态需清空，且与「分享 URL 即定位角色」诉求不符 ⚠️
- **取舍记录**：v0.3 决议把入口拆分到 URL 层；好处：①分享链接即可指定角色；②减少浮层内分支；③与 `/admin` 三路由一致。代价：路由层多一个 `/teacher`，且对「老师误打开 `/` / 学生误打开 `/teacher`」需要 PRD 层面（链接发放策略）兜底；详见 **Q-PLAN-17**。

#### Q-PLAN-17：登录浮层是否互通（**v0.3 决议**，与 spec **Q-LOGIN-CROSS** 联动）

- [x] **方案 A（已采纳）**：两个浮层完全独立，**浮层内不提供切换入口**；`<LoginSkipFooter />` 仅承载「↪ 跳过登录」 ✅
- [ ] 方案 B：浮层右下角放「我是老师 → / ← 我是学生」反向跳转链接（v0.3 一度提出后**移除**） ⚠️
- [ ] 方案 C：弱化方案 —— 仅在表单上方加一行小字 hint「我是老师，去 `/teacher` 登录」（不带可点击跳转，仅作为提示）⚠️（**可选，待产品决策**）
- **取舍记录**：方案 A 让浮层视觉最简、避免"两个互相指向"的歧义；代价是「老师误打开 `/`」的兜底路径较弱。**缓解**：班级链接发放时按角色发放（家长群发 `/`、老师群发 `/teacher`），并在 README / 邀请文案中明示两条 URL；详见 spec §5 P7。

#### Q-PLAN-15：游客态实现策略（与 spec **Q-GUEST-MODE / Q-GUEST-PERSIST / Q-GUEST-DEEPLINK** 联动）

- [x] **角色枚举**：在 `Role` 中新增 `'guest'`，`AuthState.guestPersist: 'session' | 'local' | 'none'` ✅
- [x] **UI 降级统一收敛在浮层 `mode` props**：`mode='visitor'` 同时承载"客态 + 游客态"，避免组件内分散判断 ✅
- [x] **持久化方案**（与 spec Q17 联动 → **方案 B `session`**）：
  - [ ] 方案 A：`guestPersist='none'`，刷新后再次弹登录浮层 ⚠️
  - [x] **方案 B（已采纳）**：`guestPersist='session'`，sessionStorage 记住"本次会话游客"，本会话内不再弹 ✅
  - [ ] 方案 C：`guestPersist='local'`，本设备永久免弹（家长场景方便） ⚠️
- [x] **后端兜底**（**强制**）：所有 `addStudent* / addTeacher* / addBanner / removeBanner / updateStudentIntro` 云函数必须基于 token / 角色校验，**游客无 token 直接 401**；前端 `mode=visitor` 仅是 UI 隐藏，不可作为安全边界 ✅（实现挂在 G14 强制项）
- [ ] **顶栏「去登录」入口**：`UserBadge` 在 `role==='guest'` 时显示「去登录」按钮，调用 `auth.openLoginPanel()` ⚠️（实现挂在 G11 视觉打磨）
- [x] **Deeplink 兜底**：`StudentOverlay` / `TeacherOverlay` 在挂载时若 `authStore.role === 'guest'` 强制覆写 `mode='visitor'`，忽略外部传入 ✅（实现挂在 G6 / G7）
- [x] **`/admin` 与游客互斥**：`/admin` 路由守卫不允许 `role==='guest'` 通过；token 校验失败仍跳 `/`，不自动转游客 ✅（已落在 [`src/router/index.ts`](../../../src/router/index.ts)）

#### Q-PLAN-18：管理员 token 方案（**v0.4 决议** · 收敛 Q-PLAN-14 / spec Q-ADMIN-AUTH）

- [ ] 方案 A：写死在云函数白名单的固定 token（最简，但泄露=永久失守） ⚠️
- [ ] 方案 B：一次性签发短期 token（需要后端会话 / 缓存层） ⚠️
- [x] **方案 C（已采纳）**：**HMAC(env-key, ts) 防伪 token**，URL 形如 `/admin?token=<ts>.<hex>`，云函数 `adminCheck` 用环境变量 `ADMIN_HMAC_KEY` 校验，过期阈值默认 30 天滚动；新增管理员只需用 `scripts/sign-admin-token.mjs` 重新签 ✅
- **取舍记录**：方案 C 兼顾"无后端会话"与"链接可吊销"——只要换 `ADMIN_HMAC_KEY`，所有旧 token 立即失效；过期阈值会写在云函数侧，前端不可绕过。脚本 `scripts/sign-admin-token.mjs` 列入 G12 部署交付物。

#### Q-PLAN-19：学生 / 老师登录校验路径（**v0.4 决议**）

- [x] **方案 A（已采纳）**：**云函数主校验** —— 前端只做基本非空 / 长度校验，提交直接调云函数 `studentLogin` / `teacherLogin`，云函数比对 CloudBase DB（由 `seedStudents` 从 `data/2024_02_*.json` 种入）后返回 `{ok, profile, token?}` ✅
- [ ] 方案 B：前端先匹配本地 `data/2024_02_student_list.json` 再调云函数确认（双层 + 减少一次失败请求） ⚠️
- **取舍记录**：方案 A 让"名单真源"只有云端 DB 一份，避免前端 bundle 与 DB 不一致；前端只持有"backup 列表"用于显示老师下拉 / 错误提示文案，不参与鉴权决策。

#### Q-PLAN-20：名单种子源（**v0.4 决议** · 修正旧 `kindergarten_students_en_keys.json` 叙述；与 [`data/README.md`](../../../data/README.md) 数据流对齐）

- [ ] 旧叙述：`src/assets/data/kindergarten_students_en_keys.json` ⚠️（v0.4 已废弃，仓库内不存在该文件）
- [ ] 备选：把 `data/2024_02_*.json` 复制到 `src/assets/data/` 作为前端 backup ⚠️（与 [`data/README.md`](../../../data/README.md) 「本目录文件不直接被前端引用」冲突，**已否**）
- [x] **当前真源**（已采纳）：**COS fileID** = `cloud://zy-memoir-d5gaxbvyxe80564f4.7a79-zy-memoir-d5gaxbvyxe80564f4-1306797866/2024_02_{student,teacher}_list.json`；本地 `data/2024_02_*.json` 仅作 backup（防误删）。**`seedStudents` / `seedTeachers` 云函数用 `cloudbase.downloadFile({fileID})` 从 COS 拉名单 → `db.collection().add()` 写库；前端只通过 `db.collection().get()` / 登录云函数访问，不导入本地 JSON** ✅
- **执行约定**：① 名单变更：先改 `data/*.json` → `cloudbase.manageStorage action=upload` 推到 COS → 重跑 `seedStudents` / `seedTeachers`；② 老师登录浮层下拉数据：进入 `/teacher` 时单次调 `listTeachers` 云函数（或 `db.collection('teachers').get()`）。

#### Q-PLAN-21：组 2 浮层范围（**v0.4 决议**）

- [x] **已采纳**：组 2 浮层只做"功能跑通"——表单 + 校验 + 调云函数 + 跳转；**动效（Bottom Sheet 弹出 / 淡出 / PC 居中过渡）整体留到 G11 / spec Q-OVERLAY-MOTION 收敛后再补** ✅
- **取舍记录**：spec Q-OVERLAY-MOTION 仍 ⚠️ 未收敛，强行做动效会产生返工；先把功能链路 + 持久化跑顺，G11 再统一接入设计稿动效。

---

## 风险与未决事项

| 风险 / 未决 | 影响 | 缓解 |
| ---- | ---- | ---- |
| **iOS Safari 录音** + **MP3 编码**兼容性 | 学生 / 老师无法录音 | 早期 spike：在 iOS 14 / 15 / 16 真机各跑一次；备选「云函数转码」 |
| **存储包到期 / 限流** | P0 免费包 `free-free-std_storage-1777532470-0` **2026-10-31 到期**（容量 50 GB / 实际预估用量 ≈ 1 GB，**容量不会先用尽，到期是主要风险**） | 按「### 存储 / COS 资源包消耗策略」执行：① 到期硬约束 2026-10-31 自然滚 P1；② 用量 ≥ 80% / ≥ 95% 预警阈值兜底；③ 2026-10 月内手工决策"续 P0 vs 滚 P1"；G12 备份脚本同时跑 `manageStorage` 用量 + P0 剩余天数统计 |
| **管理员鉴权方案弱** | 任何人猜到 URL 即获管理权 | 至少选 Q2 B（Token），并在云函数侧二次校验环境变量 |
| **kindergarten_students_en_keys.json 持续维护** | 名单变更后旧学生无法登录 | 改名 / 转出 / 转入需更新 JSON 后重跑 `seedStudents` |
| **设计稿尚未到位** | 头像墙布局 / 浮层动效不能定 | 在 spec **Q-LAYOUT** / **Q-OVERLAY-MOTION** 收敛后再开工 |
| **名单泄露** | 36 位学生信息（id+姓名+性别）在前端 bundle 内 | 名单本就用于校验，影响有限；管理员 token 必须保密 |
| **数据所有权 / 续费** | 项目所有者离职 / 资源到期数据丢失 | 月度全量 JSON 导出 + COS 文件备份脚本（`scripts/backup.mjs`） |

---

## 验收标准

> 默认与 `## 实现计划` checkbox 编号互链；客户端版本号以 release tag 为准。

### AC-1：默认弹出登录浮层（按 URL 区分角色）

- **输入**：未登录用户访问 `/` 或 `/teacher`（**不含** `/admin?token=...`）。
- **操作**：刷新页面。
- **预期**：
  - 访问 `/` → 自动弹出**学生登录浮层**（学号 + 姓名两输入框）；
  - 访问 `/teacher` → 自动弹出**老师登录浮层**（单选老师姓名）；
  - 浮层底部均可见「↪ 跳过登录，仅浏览」入口；地址栏 URL 不变。
- **反例**：浮层缺少「跳过登录」入口 / 浮层呈现 Tab 切换形态 → 不通过。

### AC-2：学生登录校验

- **前置**：访问 `/`，自动弹出学生登录浮层。
- **输入**：在学生登录浮层中输入 `id=12, name=李苏`。
- **操作**：点「进入」。
- **预期**：成功跳主页；本地存 `authStore.role='student', studentId=12`。
- **反例**：`id=12, name=张三` → Toast「学号或姓名错误」，输入框被清空，浮层不关。

### AC-3：教师登录

- **前置**：访问 `/teacher`，自动弹出老师登录浮层。
- **输入**：在老师登录浮层单选 `老师 A`。
- **操作**：点「进入」。
- **预期**：成功跳主页；`authStore.role='teacher', teacherId='teacher-a'`。

### AC-4：管理员路由鉴权

- **输入**：直接访问 `/admin?token=<正确 token>`。
- **操作**：刷新页面。
- **预期**：跳主页且右上角 ⚙ 入口可见；点击进入 `/admin` 管理页。
- **反例**：`token` 缺失 / 错误 → 跳 `/login`，不出现 ⚙。

### AC-5：主页四区可见

- **输入**：登录后落到 `/`。
- **预期**：依次可见 ① 顶栏、② 合影轮播（无图时空态占位）、③ 老师区（3 个老师）、④ 学生头像墙（36 个，按 id 升序）。

### AC-6：学生主态可编辑

- **输入**：以 `studentId=12` 登录后，点击主页头像墙中**自己**头像。
- **预期**：浮层为主态，可见「编辑自我介绍」「+ 照片」「+ 录音」入口；保存后浮层与主页头像墙同步刷新元信息。

### AC-7：学生客态只读

- **输入**：以 `studentId=12` 登录后，点击其他同学头像（如 id=15）。
- **预期**：浮层为客态，所有「编辑 / 删除 / +」入口**不渲染**；可看照片、可听录音。

### AC-8：教师主态可编辑（仅自己）

- **输入**：以 `teacher-a` 登录，点击主页③区**自己**头像。
- **预期**：浮层为主态，可换头像、增删录音；点击其他老师头像**无主态浮层**（按 spec **Q-TEACHER-OTHER** 默认）。

### AC-9：管理员可增删合影

- **输入**：在 `/admin` 上传一张新合影 / 删除一张旧合影。
- **预期**：上传成功后主页 ② 区轮播末尾出现新图（或顶端，按 **Q-BANNER-ORDER**）；删除成功后从轮播消失。

### AC-10：图片压缩 ≤ 3 MB

- **输入**：选一张 8 MB 的 JPG。
- **预期**：上传前客户端压缩到 ≤ 3 MB；最终在 COS 中文件 size ≤ 3 MB；视觉无明显失真。

### AC-11：录音 ≤ 60s 自动停止 + MP3

- **输入**：开始录音并不主动停止。
- **预期**：第 60 秒**强制停止**并进入预览态；保存后 COS 中文件 MIME 为 `audio/mpeg`。

### AC-12：录音播放互斥

- **输入**：在主页播放老师 A 录音 1，未结束时点击老师 B 录音 1。
- **预期**：老师 A 录音 1 自动暂停，老师 B 录音 1 开始播放；同一时间至多一条音频在播。

### AC-13：上限提示

- **输入**：学生主态已上传 3 张照片。
- **预期**：「+ 照片」按钮灰显或消失；点击 / 悬停显示 Tooltip「已达上限 3 张，请先删除旧照片」。
- **同理**：5 段录音上限。

### AC-14：错误回退 + Toast

- **输入**：在弱网下上传照片 / 录音 / 合影。
- **预期**：失败后乐观 UI 占位变红色「重试」态；Toast「上传失败，请稍后重试」；点击「重试」后重新上传成功。

### AC-15：响应式

- **输入**：在 375 × 812（iPhone）与 1440 × 900（PC）两种视口分别打开主页。
- **预期**：均无横向滚动条；主页四区与浮层均可正常使用；浮层移动端为 Bottom Sheet、PC 端为居中卡片（按 **Q-OVERLAY-MOTION** 决议）。

### AC-16：未上传素材的占位

- **输入**：访问刚初始化、所有人未上传任何素材的状态。
- **预期**：合影区显示空态占位；老师卡片仅显示头像 + 姓名（无录音条）；学生头像墙显示默认头像（按 spec **Q-DEFAULT-AVATAR** 决议）。

### AC-17：游客模式（**新增**）

- **输入 1**：未登录用户在登录浮层点击「↪ 跳过登录，仅浏览」。
- **预期 1**：浮层关闭，落到 `/`；`authStore.role === 'guest'`，`token === null`；顶栏徽标显示「游客」并提供「去登录」入口。
- **输入 2**：游客在主页点击任意学生头像 / 任意老师卡片（如允许）。
- **预期 2**：浮层以**只读**渲染，**不出现** 任何 `+ / 换头像 / 编辑自我介绍 / 长按删除` 入口；可看照片可听录音；试图通过 deeplink 携带 `mode=owner` 进入也被强制降级为 `visitor`。
- **输入 3**：游客主页右上角检查。
- **预期 3**：⚙ 管理员入口**不可见**。
- **输入 4**：游客顶栏徽标点击「去登录」。
- **预期 4**：登录浮层重新弹出；输入正确学号 + 姓名后，`role` 由 `guest` 升级为 `student`，编辑入口随之解锁。
- **输入 5**：游客直接访问 `/admin?token=<错 token>`。
- **预期 5**：跳 `/login` 浮层（不会自动转为游客直通管理页）。
- **输入 6**：游客在浏览器控制台直接调用 `studentsService.updateIntro(...)`。
- **预期 6**：云函数侧基于无有效 token / `role !== 'student' && role !== 'admin'` **拒绝**（HTTP / cloudbase 错误码），数据库无变更。

### AC-18：登录浮层完全独立、浮层内不互通（**v0.3 决议**）

- **输入 1**：未登录用户访问 `/`，弹出学生登录浮层。
- **预期 1**：浮层中**仅**包含 ①学号 + 姓名输入框、②「进入」按钮、③底部「↪ 跳过登录，仅浏览」三类控件；**不存在**任何指向 `/teacher` 的可点击文本 / 按钮 / icon / Tab。
- **输入 2**：未登录用户访问 `/teacher`，弹出老师登录浮层。
- **预期 2**：浮层中**仅**包含 ①老师单选 chips、②「进入」按钮、③底部「↪ 跳过登录，仅浏览」三类控件；**不存在**任何指向 `/` 的可点击文本 / 按钮 / icon / Tab。
- **输入 3**：分别在两个浮层点击「↪ 跳过登录，仅浏览」。
- **预期 3**：均落到 `/` 主页，`authStore.role === 'guest'`（与 AC-17 一致；游客态不区分初始入口）。
- **输入 4**：游客在主页顶栏徽标气泡点击「去登录」。
- **预期 4**：默认 `router.push('/')` 弹学生登录浮层；如老师需登录，需用户**手动改地址栏**到 `/teacher`，浮层不提供切换入口。
- **反例**：浮层内出现「我是老师 → / ← 我是学生」之类的角色切换链接 / 按钮 / Tab → 不通过（与 v0.3 决议矛盾）。

---

## 开发任务

> 顶层按 **目录 / Screen** 聚类（与「技术方案 · 文件改动清单」对应）；子项拆 **UI 区块**（顶栏、轮播、老师区、头像墙、浮层…）、逻辑、联调；依赖 spec / 设计未闭环的条目标 **`⚠️`**；与「实现计划」组内 checkbox 互链。

- [x] **G1 工程脚手架**
  - [x] `package.json` + `pnpm install`
  - [x] `vite.config.ts` / `tsconfig.json` / `index.html`
  - [ ] ESLint + Prettier + 提交钩子（ESLint flat config + Prettier + .editorconfig 已落；**husky / lint-staged 提交钩子留待 G12**）
- [ ] **G2 CloudBase 接入**
  - [x] 申请 / 选定 CloudBase 环境 ID（`zy-memoir-d5gaxbvyxe80564f4`，已写入 `cloudbaserc.json`；G1 起 vite 工程后再落 `.env.production` 的 `VITE_TCB_ENV_ID`）
  - [x] CloudBase MCP 配置（`config/mcporter.json`，agent 通过 `npx mcporter call cloudbase.*` 调用）
  - [x] CloudBase 设备码登录 + `auth.set_env`（`auth action=status` 验证：`env_status=READY` / `current_env_id=zy-memoir-d5gaxbvyxe80564f4`）
  - [x] `src/api/cloudbase.ts` SDK 单例
  - [x] 云函数代码：`studentLogin` / `teacherLogin` / `adminCheck` / `seedStudents` / `seedTeachers` / `listTeachers`（落 `cloudfunctions/`，含 `_shared/{hmac.js,response.js}` 同步副本说明）
  - [x] `seedStudents` / `seedTeachers` 用 `cloudbase.downloadFile({fileID})` 从 COS 拉 `data/2024_02_*.json`（COS 真源）→ `db.collection().add()` 写库（**Q-PLAN-20 ✅**；前端**不**导入本地 JSON）
  - [x] 管理员 token 方案选定：**HMAC(env-key, ts) 防伪 token**（**Q-PLAN-18 ✅**；具体实现挂在 G2 云函数 `adminCheck` + G12 `scripts/sign-admin-token.mjs`）
- [x] **G3 路由 + 鉴权**
  - [x] `src/router/index.ts` 三路由
  - [x] 登录守卫：未登录 → 默认弹 `/login` 浮层；admin route → 校验 token；**`/admin` 拒绝 `role==='guest'`**
  - [x] `src/stores/auth.ts` + LocalStorage 持久化（**Q-LOGIN-TTL**）；新增 `Role='guest'` + `skipToGuest()` / `openLoginPanel()` action
- [x] **G4a 学生登录浮层 `StudentLogin.vue`（路由 `/`）**
  - [x] 学号 + 姓名双输入框 + 校验（云函数 `studentLogin` 主校验，Q-PLAN-19）
  - [x] 失败行内错误提示 / 成功 `setStudent` 关闭浮层（Toast 体系挂 G10 / G11）
  - [x] 嵌入 `<LoginSkipFooter />`（**仅跳过登录入口**，不含角色互通）
  - [x] **断言**：浮层内不存在任何指向 `/teacher` 的可点击元素（与 AC-18 对齐）
- [x] **G4b 老师登录浮层 `TeacherLogin.vue`（路由 `/teacher`）**
  - [x] 单选老师姓名（数据来自 `listTeachers` 云函数）+ 云函数 `teacherLogin`
  - [x] 失败行内错误提示 / 成功 `setTeacher` 关闭浮层（Toast 挂 G10 / G11）
  - [x] 嵌入 `<LoginSkipFooter />`（**仅跳过登录入口**，不含角色互通）
  - [x] **断言**：浮层内不存在任何指向 `/` 的可点击元素（与 AC-18 对齐）
- [x] **G4c 共用 `LoginSkipFooter.vue`**
  - [x] 「↪ 跳过登录，仅浏览」入口 → 调 `auth.skipToGuest()`，关闭浮层落到 `/`（**Q-PLAN-15**）
  - [x] 视觉规范：弱化样式（文本按钮 + 左侧返回箭头 icon），与「进入」主按钮拉开层级
  - [x] **不**包含「我是老师 / 我是学生」反向跳转链接（**v0.3 Q-PLAN-17 决议**）
- [x] **G5 主页 `Home.vue` & 子组件**
  - [x] `HomeTopbar.vue`（含 ⚙ 入口可见性、退出登录）
  - [x] `BannerCarousel.vue`（自动 + 手动切换、空态；**点击放大开关**待 Q-BANNER-ZOOM 决议，当前未实装）
  - [x] `TeacherSection.vue` + `TeacherCard.vue` + 录音条占位（**RecordingList** 复用单文件内联，未拆独立组件）
  - [x] `StudentWall.vue` + `StudentAvatar.vue`
  - [x] **✅** 头像墙具体布局：spec **Q-LAYOUT = 方案 A'**（CSS Grid `grid-auto-flow: dense` + 部分 `span 2` + 按 id 稳定哈希 ±4° 旋转 / ±8 px 平移）
  - [x] `useClassDataStore.fetchAll()` 三接口并发（`Promise.allSettled`，单段失败不阻塞其余）
- [x] **G6 学生浮层 `StudentOverlay.vue`**
  - [x] 主/客态分支（props.mode）；**游客态强制走 `visitor`**（`effectiveMode` computed 中以 role + studentId 双重校验，非本人或游客一律降为 visitor）
  - [x] 自我介绍编辑 + 字数限制（仅 `owner`，1 s 防抖自动保存 + Toast；超 300 字飘红并阻断保存）
  - [x] 照片网格 + 「+」上限（仅 `owner`，3 张达到时「+」按钮自动隐藏）
  - [x] 录音列表 + 「+」上限（仅 `owner`，5 段达到时按钮自动隐藏；inline 录音面板覆盖 Bottom Sheet 底部）
  - [x] 长按删除 + 二次确认（600 ms 长按触发 `<ConfirmDialog>`；`visitor` 不绑定 pointerdown handler）
  - [x] mount 时若 `authStore.isGuest` 则**强制覆写** `mode='visitor'`（`effectiveMode` 在 role !== 'student' 时直接返回 visitor）
  - [x] 头像换图（API-10 `updateStudentAvatar`；plan 阶段补建云函数）
- [x] **G7 教师浮层 `TeacherOverlay.vue`**
  - [x] 仅主态：换头像 + 增删录音（无自我介绍 / 无照片墙；段数不设上限，对齐 Q-PLAN-12）
  - [x] 对其他老师 / 学生 / **游客**：按 Q-TEACHER-OTHER 默认决议**不开放**点开（Home.vue 的 `handleTeacherClick` 仅当老师本人匹配时才 push open；浮层自身也兼容 visitor 模式）
- [x] **G8 上传 / 录音 composables**
  - [x] `useUpload`（progress / retry / 乐观 UI）
  - [x] `useRecorder`（MediaRecorder + 60s 倒计时 + 停止）
  - [x] `useImageCompress`（≤3 MB）
  - [x] `useMp3Encode`（lamejs）
  - [x] `useAudioPlayer`（全局单实例互斥；G4 已接入 TeacherCard / StudentOverlay / TeacherOverlay 三处播放器）
- [x] **G9 管理员页 `Admin.vue`**
  - [x] 路由守卫：`/admin?token=...`
  - [x] 合影网格 + 上传 + 删除（含二次确认）
- [ ] **G10 共用弹层与 Toast**
  - [ ] `Toast.vue`、`ConfirmDialog.vue`、`UploadModal.vue`、`RecordModal.vue`
- [ ] **G11 视觉打磨与边界**
  - [ ] 默认头像 SVG（男 / 女）
  - [ ] 合影空态占位
  - [ ] 头像墙 36 项首屏并发优化（懒加载 / 缩略图）
  - [ ] 弱网失败 Toast + 重试
  - [ ] **⚠️** 浮层动效（按 Q-OVERLAY-MOTION 决议）
  - [ ] **游客态 `UserBadge` 视觉态 + 「去登录」气泡**
  - [ ] **游客态合规提示横幅（如 spec Q17 决议要做）**
- [ ] **G14 游客态后端兜底（强制）**
  - [ ] 所有写操作云函数（`updateStudentIntro / addStudentPhoto / addStudentRecording / addTeacherRecording / addBanner / removeBanner` 等）在入口处强校验 token 中的 `role`
  - [ ] 无 token / `role==='guest'` → 直接返回 `{ ok:false, code:'FORBIDDEN' }`
  - [ ] 单测覆盖：游客构造请求 → 必须被拒绝
- [ ] **G12 部署与运维**
  - [ ] CloudBase 静态托管发布脚本
  - [ ] 云函数发布脚本
  - [ ] `scripts/seed-students.mjs`
  - [ ] `scripts/backup.mjs`（月度备份 db + COS；**顺带打印 P0 包 `free-free-std_storage-1777532470-0` 剩余容量 + 剩余有效天数（到 2026-10-31）**，用于消耗策略巡检；剩余天数 ≤ 30 时高亮提醒"准备续 P0 或滚 P1"）
  - [ ] `index.html` 加 `<meta name="robots" content="noindex,nofollow">`
- [ ] **G13 验收**
  - [ ] 跑通 AC-1 ~ AC-17
  - [ ] iPhone (Safari) / Chrome / 微信浏览器各一遍
  - [ ] **游客态专项**：跳过登录 → 全站浏览 → 任意编辑入口均不可达 → 控制台直调写接口被拒

---

## 实现计划

> 阶段 2 填写：按组拆分 checkbox；与「开发任务」编号 **G1～G13** 互链。

### 组 1：工程脚手架与基础设施（依赖：无）

- [x] G1 工程脚手架
- [x] G2 CloudBase 环境申请（`zy-memoir-d5gaxbvyxe80564f4`）+ `cloudbaserc.json` + `config/mcporter.json`
- [x] G2 CloudBase 设备码登录 + `auth.set_env`（任意时刻先于 G2 云函数部署）
- [x] G2 SDK 单例（`src/api/cloudbase.ts`，依赖 G1 工程脚手架）
- [x] G3 路由 + Pinia + 登录守卫骨架（先以 mock authStore 跑通三页跳转）

### 组 2：登录与鉴权（依赖：组 1）

- [x] G2 云函数代码：`studentLogin` / `teacherLogin` / `adminCheck` / `seedStudents` / `seedTeachers` / `listTeachers`（落 `cloudfunctions/`，HMAC 走 `_shared/hmac.js` 同步副本；与 Q-PLAN-18 / 19 / 20 对齐）
- [x] G2 名单 seed 跑通：6 个云函数已部署 + `AUTH_HMAC_KEY` / `ADMIN_HMAC_KEY` 注入完成；`seedStudents` 写入 36 条、`seedTeachers` 写入 3 条；端到端正负例（学生：金智雅 LOGIN_OK / 错名 NAME_MISMATCH / id=99 STUDENT_NOT_FOUND；老师：刘希荷 LOGIN_OK / id=99 TEACHER_NOT_FOUND；admin：7 天 token ADMIN_OK / 错签 INVALID_TOKEN / 过期 EXPIRED_TOKEN）全过
- [x] G4a `StudentLogin.vue`（路由 `/`）：表单 + `studentLogin` 联调 + Toast
- [x] G4b `TeacherLogin.vue`（路由 `/teacher`）：`listTeachers` 单选下拉 + `teacherLogin` 联调 + Toast
- [x] G4c `LoginSkipFooter.vue`：「↪ 跳过登录，仅浏览」+ `auth.skipToGuest()`（**仅跳过逻辑**，不含角色互通）
- [x] G3 admin route token 校验（拒绝 `role==='guest'`；进入 `/admin` 调 `adminCheck` 云函数验 HMAC token）

### 组 3：主页骨架与数据层（依赖：组 1 / 2）

- [x] G5 `HomeTopbar` + `BannerCarousel`（banners 先用 mock；G7 切真接口；自动轮播 4 s + 手动 + 圆点）
- [x] G5 `TeacherSection` + `TeacherCard`（含录音条占位 + 主班/配班/生活老师徽标；新增云函数 `listTeachers` 已扩展返回 avatar/recordings）
- [x] G5 `StudentWall` + `StudentAvatar`（**✅** 采用 spec Q6 方案 A'：8 列 / < 768 px 4 列；id 哈希 ±4° / ±8 px；主态 `★` 角标 + 高亮边）
- [x] G5 `useClassDataStore.fetchAll()` 三接口并发（students/teachers/banners；`Promise.allSettled`；新增云函数 `listStudents` 已部署 → invoke 返 36 学生）

### 组 4：浮层与上传 / 录音（依赖：组 3）

- [x] G6 学生浮层主 / 客态（`src/components/overlays/StudentOverlay.vue`；含游客兜底 + 1 s 防抖自动存简介 + 照片 / 录音上限管控 + 长按删除 + ConfirmDialog；G4 起 10 个新云函数全量部署 + invoke 验证）
- [x] G7 教师浮层主态（`src/components/overlays/TeacherOverlay.vue`；本人才打开 + 头像换图 + 录音增删；TeacherCard 录音条接入 useAudioPlayer 互斥）
- [x] G8 `useUpload` / `useImageCompress`（progress / retry / 乐观 UI；`browser-image-compression` ≤ 3 MB）
- [x] G8 `useRecorder` + `useMp3Encode`（MediaRecorder + 60 s 自动停 / `@breezystack/lamejs` 浏览器内 MP3；**⚠️** iOS Safari 真机回归留 G13）
- [x] G8 `useAudioPlayer` 全局互斥（模块级单实例 audio + 引用计数；G4 起 TeacherCard / StudentOverlay / TeacherOverlay 三处共享）

### 组 5：管理员页（依赖：组 1 / 2）

- [x] G9 `Admin.vue` + 合影网格（云函数 `listBanners` 公开只读 + 现场 `getTempFileURL` 刷新；admin 校验通过后由 `useClassDataStore.fetchBanners` 灌数据，3 列 grid + 空 / loading / error 三态）
- [x] G9 上传 + 删除（含二次确认）（`useImageCompress` ≤ 3 MB → `useUpload` cloudPath `banners/<yyyy-MM>/<uuid>.<ext>` → `addBanner({token,fileID,url,caption?})`；删除走 `<ConfirmDialog>` + `removeBanner({token,bannerId})`，云函数同步 `app.deleteFile`；admin HMAC 走 `ADMIN_HMAC_KEY` 与学生 / 老师独立轮换）

### 组 6：视觉打磨与边界（依赖：所有上面）

- [ ] G11 默认头像 / 空态 / 懒加载 / 弱网 Toast
- [ ] G11 头像墙具体布局（**⚠️** 待 spec Q-LAYOUT）
- [ ] G11 浮层动效（**⚠️** 待 spec Q-OVERLAY-MOTION）

### 组 7：部署与验收（依赖：组 6）

- [ ] G12 CloudBase 部署脚本
- [ ] G12 月度备份脚本
- [ ] G14 游客态后端兜底（云函数侧 401）
- [ ] G13 跑通 AC-1 ~ AC-17
- [ ] G13 游客态专项验收（跳过登录 → 浏览 → 编辑入口不可达 → 控制台直调写接口被拒）
- [ ] G13 真机回归（iOS / Android / PC）

---

## 代码审查

<!-- 阶段 4 填写：实现计划全部 [x] 后 -->

- **结论**：待审查
- **严重问题**：无
- **备注**：
