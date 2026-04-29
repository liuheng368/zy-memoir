---
name: env-check
description: >-
  环境与初始化（薄层）：只读检测 JDK 17+jlink、Android SDK、cmdline-tools、gradlew、adb（adb/cmdline 为可选 WARN）；
  JSON 含 ios 占位字段（skipped/pending，不参与 exit）；JDK 与 Android 工具链各有 verificationTable。输出 android/SETUP.md、ios/ 与唯一白名单 brew install openjdk@17。
  用户 @ 本 skill 或说「环境自检、校验环境、检测环境」时在仓库根执行 check-env.mjs；不主动 brew/apt，除非用户明确要求且仅限白名单一条命令。
  汇报结果时须原样附上脚本 stdout 中含「|」的 JDK 表格块，禁止仅用一句话概括代替表格。
---

# 环境自检（env-check，薄层 P2）

**原则**：范围不膨胀。本 Skill **不**维护整套包管理器安装逻辑；只做 **检测 → 文档链接 →（可选）一条白名单安装命令**。

## 何时使用

- 新同学 onboarding、CI 镜像验收、Agent 排查「本地编不过」时的**第一步**。
- 与 **`android/SETUP.md`**、**`ios/`** 配套：Android 缺口以 SETUP 为准；iOS 工具链检测**预留**在 JSON 的 **`ios`** 字段（当前不跑 `xcodebuild` / `pod`，避免与 Android 检测一起膨胀）。

## Agent 必做流程

1. **`cd` 到仓库根目录**（含 `android/` 与 `.cursor/skills/` 的 `preproj` 根）。
2. 执行只读检测（人类可读）：

```bash
node .cursor/skills/env-check/scripts/check-env.mjs
```

3. 将结果中的 **FAIL / WARN** 对照 **`android/SETUP.md`**（JDK → Step 1–2，SDK → Step 3，终端 PATH →「终端环境变量」，cmdline-tools → SDK Tools 等）。脚本 stdout 中含 **两张** Markdown 表：**JDK**、**Android（SDK · adb · cmdline-tools）**（以 `|` 开头的行）。`--json` 中见 **`jdk.verificationTable`**、**`androidSdk.verificationTable`**。
4. **向用户展示结果时**：在聊天中**原文粘贴**脚本 stdout 中含 `|` 的表格块——**JDK** 段（从 **`JDK:`** 至该表后空行）与 **Android（SDK · adb · cmdline-tools）** 段（从 **`Android（`** 起至第二张表后空行），以便渲染为表格；**不要**仅用一句话概括而省略 `|` 行。若用户只在终端看，可直接运行上一步命令。
5. **`--json`**（供 CI / 管道解析）：`node .cursor/skills/env-check/scripts/check-env.mjs --json`；**退出码 1** 仅反映 **JDK / Android SDK / gradlew**。**adb、cmdline-tools** 异常为 **WARN**。**`ios`** 对象恒存在：`status` 为 **`skipped`**（非 macOS）或 **`pending`**（macOS 占位）；**从不**因 iOS 抬高退出码。

## 主动安装（白名单）

仅在用户**明确说**要安装 JDK（或「按 skill 装一下 JDK」）且环境为 **macOS + Homebrew** 时，可执行**且仅能执行**下面这一条（装完后仍须按 **`android/SETUP.md`** 配置 `org.gradle.java.home` 等）：

```bash
brew install openjdk@17
```

**禁止**（除非用户另行明确要求且不在本 Skill 范围内）：`brew install` 其它包、`sdkmanager` 批量安装、安装 Ruby/CocoaPods、拉取模拟器系统镜像、修改他人机器全局配置脚本等。

## 与 CI / onboarding 复用

- **同一入口**：`node .cursor/skills/env-check/scripts/check-env.mjs`（可加 `--json`）。
- **文档**：Android 阻塞项指向 **`android/SETUP.md`**；iOS 后续可增 **`ios/SETUP.md`**（或团队约定路径）并与脚本 `docs.iosWorkspace` 对齐。

## 实现说明（维护者）

- JDK/SDK 路径解析 **复用** **`../android-emulator-dev/scripts/lib/android-sdk-env.mjs`**，避免两套 `local.properties` 逻辑漂移。
- **扩展 iOS**：在 **`check-env.mjs`** 的 **`buildIosReserved`** 内、仅 macOS 分支逐步加入只读子检测；写入 **`checks.ios.checks`**，**不要**把 `checks.ios.status` 并入 **`criticalFail`**，除非团队明确改口径。
