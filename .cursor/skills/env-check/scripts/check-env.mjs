#!/usr/bin/env node
/**
 * 只读环境检测：不写文件、不联网、不安装依赖。
 * 复用 android-emulator-dev 的仓库根与 SDK/JDK 解析逻辑。
 * iOS：仅输出稳定占位字段（供 CI / 后续扩展），不参与 exit code。
 */
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

import {
  androidDir,
  repoRoot,
  resolveAndroidHome,
  resolveJavaHome,
} from '../../android-emulator-dev/scripts/lib/android-sdk-env.mjs';

const jsonMode = process.argv.includes('--json');

function pickJavaHome() {
  const resolved = resolveJavaHome();
  if (resolved) return resolved;
  if (process.env.JAVA_HOME) return process.env.JAVA_HOME;
  return null;
}

function run(bin, args, env = process.env) {
  return spawnSync(bin, args, { encoding: 'utf8', env });
}

function javaVersionLine(javaHome) {
  const java = path.join(javaHome, 'bin', 'java');
  if (!fs.existsSync(java)) return { ok: false, line: null, err: 'java 可执行文件不存在' };
  const r = run(java, ['-version']);
  const line = (r.stderr || r.stdout || '').split('\n')[0]?.trim() || '';
  if (r.status !== 0) return { ok: false, line, err: `java -version 退出码 ${r.status}` };
  return { ok: true, line, err: null };
}

function isJdk17(line) {
  if (!line) return false;
  // OpenJDK: openjdk version "17.0.x" / java version "17.0.x"
  return /\bversion\s+"17[\d._-]*/.test(line) || /\b17\.[\d._]+/.test(line);
}

function jlinkOk(javaHome) {
  const jlink = path.join(javaHome, 'bin', 'jlink');
  if (!fs.existsSync(jlink)) return { ok: false, detail: 'bin/jlink 不存在（需完整 JDK，非 JBR）' };
  const r = run(jlink, ['--version']);
  if (r.status !== 0) return { ok: false, detail: `jlink --version 失败 (${r.status})` };
  return { ok: true, detail: (r.stdout || r.stderr || '').trim().split('\n')[0] };
}

function adbOnPath() {
  const r = run('adb', ['version'], { ...process.env, PATH: process.env.PATH || '' });
  if (r.error && r.error.code === 'ENOENT') return { ok: false, detail: 'PATH 中未找到 adb' };
  if (r.status !== 0) return { ok: false, detail: `adb version 退出码 ${r.status}` };
  return { ok: true, detail: (r.stdout || '').split('\n')[0]?.trim() };
}

function sdkCliName(base) {
  return process.platform === 'win32' ? `${base}.bat` : base;
}

function summarizeSdkmanagerOutput(stdout, stderr) {
  const t = `${stdout || ''}\n${stderr || ''}`.trim();
  const lines = t.split(/\n/).map((l) => l.trim()).filter(Boolean);
  const nonWarn = lines.filter((l) => !l.startsWith('Warning:'));
  return nonWarn.length ? nonWarn[nonWarn.length - 1] : lines[lines.length - 1] || t.slice(0, 160);
}

/** sdkmanager --version、avdmanager list；失败为 WARN，不抬高 exit code */
function checkCmdlineTools(sdk, javaHome) {
  const base = {
    status: 'unknown',
    binDir: null,
    sdkmanager: null,
    avdmanager: null,
    notes: [],
  };
  if (!sdk) {
    return { ...base, status: 'warn', notes: ['无 SDK 路径，跳过 cmdline-tools 检测'] };
  }
  const binDir = path.join(sdk, 'cmdline-tools', 'latest', 'bin');
  base.binDir = binDir;
  const smPath = path.join(binDir, sdkCliName('sdkmanager'));
  const avPath = path.join(binDir, sdkCliName('avdmanager'));
  if (!fs.existsSync(smPath)) {
    return {
      ...base,
      status: 'warn',
      sdkmanager: {
        ok: false,
        detail: '未找到 cmdline-tools/latest/bin/sdkmanager（SDK Manager 安装 Android SDK Command-line Tools）',
      },
      avdmanager: fs.existsSync(avPath)
        ? null
        : { ok: false, detail: '未找到 avdmanager' },
      notes: [],
    };
  }

  const env = { ...process.env };
  if (javaHome) env.JAVA_HOME = javaHome;

  const rSm = run(smPath, ['--version'], env);
  const smOk = rSm.status === 0 && !rSm.error;
  const smDetail = smOk
    ? summarizeSdkmanagerOutput(rSm.stdout, rSm.stderr)
    : `sdkmanager --version 失败: ${rSm.error?.message || `exit ${rSm.status}`} ${(rSm.stderr || rSm.stdout || '').trim().slice(0, 200)}`;

  let avRes;
  if (!fs.existsSync(avPath)) {
    avRes = { ok: false, detail: '未找到 avdmanager' };
  } else {
    const rAv = run(avPath, ['list'], env);
    const out = (rAv.stdout || '').trim();
    const lineCount = out ? out.split('\n').filter((l) => l.trim()).length : 0;
    const avOk = rAv.status === 0 && !rAv.error;
    avRes = avOk
      ? { ok: true, detail: `avdmanager list 成功（${lineCount} 行输出）` }
      : {
          ok: false,
          detail: `avdmanager list 失败: ${rAv.error?.message || `exit ${rAv.status}`} ${(rAv.stderr || rAv.stdout || '').trim().slice(0, 200)}`,
        };
  }

  const ok = smOk && avRes.ok;
  return {
    ...base,
    status: ok ? 'ok' : 'warn',
    sdkmanager: { ok: smOk, detail: smDetail },
    avdmanager: avRes,
    notes: [],
  };
}

function readGradleJavaHome() {
  const gp = path.join(process.env.HOME || '', '.gradle', 'gradle.properties');
  if (!fs.existsSync(gp)) return { set: false, value: null, path: gp };
  const text = fs.readFileSync(gp, 'utf8');
  const m = text.match(/^\s*org\.gradle\.java\.home\s*=\s*(.+)$/m);
  if (!m) return { set: false, value: null, path: gp };
  let v = m[1].trim().replace(/\r$/, '');
  if (v.startsWith('~/')) v = path.join(process.env.HOME || '', v.slice(2));
  return { set: true, value: v, path: gp };
}

function nodeInfo() {
  const r = run(process.execPath, ['-v']);
  const v = (r.stdout || '').trim() || process.version;
  return v;
}

/** @returns {{ item: string, mark: string, note: string }[]} */
function buildJdkVerificationRows(jdk, gradleProps) {
  const javaHome = jdk.javaHome;
  const homeOk = !!javaHome;
  const jdk17Ok = homeOk && !!jdk.versionLine && isJdk17(jdk.versionLine);
  const jlinkOk = jdk.jlink?.ok === true;

  const gjh = gradleProps.orgGradleJavaHome;
  let gradleMark = '⚠';
  let gradleNote = '未设置';
  if (gjh.set && gjh.value) {
    if (javaHome && path.resolve(gjh.value) === path.resolve(javaHome)) {
      gradleMark = '✓';
      gradleNote = '与当前 JDK 一致';
    } else if (javaHome) {
      gradleMark = '⚠';
      gradleNote = '与当前解析 JAVA_HOME 不一致';
    } else {
      gradleMark = '✓';
      gradleNote = '已配置';
    }
  }

  const note = (s) => String(s ?? '—').replace(/\|/g, '/').slice(0, 96);

  return [
    { item: 'JAVA_HOME / 可解析路径', mark: homeOk ? '✓' : '✗', note: note(javaHome) },
    { item: 'JDK 17（java -version）', mark: jdk17Ok ? '✓' : '✗', note: note(jdk.versionLine) },
    { item: 'jlink（完整 JDK，非 JBR）', mark: jlinkOk ? '✓' : '✗', note: note(jdk.jlink?.detail) },
    { item: 'org.gradle.java.home', mark: gradleMark, note: note(gradleNote) },
  ];
}

/** 人类可读 Markdown 风格表格（JDK / Android 等复用） */
function formatVerificationTable(rows) {
  const c0 = Math.max(8, ...rows.map((r) => r.item.length));
  const c1 = 4;
  const c2 = Math.min(96, Math.max(12, ...rows.map((r) => r.note.length)));
  const line = (a, b, c) =>
    `| ${a.padEnd(c0)} | ${String(b).padEnd(c1)} | ${String(c).padEnd(c2)} |`;
  const sep = `| ${'-'.repeat(c0)} | ${'-'.repeat(c1)} | ${'-'.repeat(c2)} |`;
  return ['', line('校验项', '通过', '备注'), sep, ...rows.map((r) => line(r.item, r.mark, r.note)), ''];
}

function noteCell(s) {
  return String(s ?? '—').replace(/\|/g, '/').slice(0, 96);
}

/** Android SDK + adb + cmdline-tools 行（与 JDK 表同一列语义） */
function buildAndroidToolchainRows(androidSdk, adbBlock, cmdline) {
  const sdkPath = androidSdk.path || '—';
  let sdkMark = '✗';
  if (androidSdk.status === 'ok') sdkMark = '✓';
  else if (androidSdk.status === 'warn') sdkMark = '⚠';
  const sdkNoteParts = [sdkPath, ...(androidSdk.notes || [])].filter(Boolean);
  const sdkNote = noteCell(sdkNoteParts.join('；'));

  const adbMark = adbBlock.status === 'ok' ? '✓' : '⚠';
  const adbNote = noteCell(adbBlock.detail);

  const sm = cmdline?.sdkmanager;
  const av = cmdline?.avdmanager;
  const smMark = sm?.ok ? '✓' : sm && sm.ok === false ? '✗' : '⚠';
  const smNote = noteCell(sm?.detail || cmdline?.notes?.join('；') || '—');

  const avMark = av?.ok ? '✓' : av && av.ok === false ? '✗' : '⚠';
  const avNote = noteCell(av?.detail || '—');

  const binNote = noteCell(cmdline?.binDir || '—');

  return [
    { item: 'Android SDK 路径', mark: sdkMark, note: sdkNote },
    { item: 'adb（PATH）', mark: adbMark, note: adbNote },
    {
      item: 'cmdline-tools/latest/bin',
      mark: cmdline?.binDir && fs.existsSync(cmdline.binDir) ? '✓' : '✗',
      note: binNote,
    },
    { item: 'sdkmanager --version', mark: smMark, note: smNote },
    { item: 'avdmanager list', mark: avMark, note: avNote },
  ];
}

/**
 * iOS 环境占位：不跑 xcodebuild/pod，避免与 Android 检测耦合；JSON 形状保持稳定供后续填 checks。
 */
function buildIosReserved(root) {
  const iosDir = path.join(root, 'ios');
  const workspacePresent = fs.existsSync(iosDir);
  const isDarwin = process.platform === 'darwin';
  if (!isDarwin) {
    return {
      scope: 'ios',
      status: 'skipped',
      reason: '非 macOS，不校验 iOS 工具链',
      workspacePath: iosDir,
      workspacePresent,
      checks: {},
      notes: ['iOS 专项检测预留：在 macOS 上可后续扩展只读命令（xcodebuild -version、pod --version 等）'],
    };
  }
  return {
    scope: 'ios',
    status: 'pending',
    reason: '占位：尚未执行 Xcode / CocoaPods 等检测（保持 skill 薄层）',
    workspacePath: iosDir,
    workspacePresent,
    checks: {},
    notes: [
      '后续可在 checks 内增加子项；默认不列入 env-check 退出码。',
      'KMP 与 podspec 见 kmp/；壳工程见 ios/。',
    ],
  };
}

function main() {
  const root = repoRoot();
  const checks = {
    repoRoot: root,
    jdk: { status: 'unknown', javaHome: null, versionLine: null, jlink: null, notes: [] },
    androidSdk: { status: 'unknown', path: null, notes: [] },
    adb: { status: 'unknown', detail: null },
    cmdlineTools: null,
    gradlew: { status: 'unknown', path: null },
    gradleProps: { orgGradleJavaHome: readGradleJavaHome() },
    node: nodeInfo(),
    docs: {
      androidSetup: 'android/SETUP.md',
      iosWorkspace: 'ios/',
      skill: '.cursor/skills/env-check/SKILL.md',
    },
    optionalInstallWhitelist: {
      macosHomebrewJdk17: 'brew install openjdk@17',
    },
  };

  const gradlewPath = path.join(androidDir(), 'gradlew');
  checks.gradlew = {
    status: fs.existsSync(gradlewPath) ? 'ok' : 'fail',
    path: gradlewPath,
  };

  const javaHome = pickJavaHome();
  checks.jdk.javaHome = javaHome;
  if (!javaHome) {
    checks.jdk.status = 'fail';
    checks.jdk.notes.push('未解析到 JDK 17 路径（JAVA_HOME、/usr/libexec/java_home -v 17、Homebrew openjdk@17）');
  } else {
    const ver = javaVersionLine(javaHome);
    checks.jdk.versionLine = ver.line;
    if (!ver.ok || !isJdk17(ver.line)) {
      checks.jdk.status = 'fail';
      checks.jdk.notes.push(ver.err || '不是 JDK 17');
      checks.jdk.jlink = { ok: false, detail: '已跳过（先满足 JDK 17）' };
    } else {
      const jk = jlinkOk(javaHome);
      checks.jdk.jlink = jk;
      if (!jk.ok) {
        checks.jdk.status = 'fail';
        checks.jdk.notes.push(jk.detail);
      } else {
        checks.jdk.status = 'ok';
      }
    }
  }

  const gjh = checks.gradleProps.orgGradleJavaHome;
  if (checks.jdk.status === 'ok' && gjh.set && gjh.value) {
    const same =
      path.resolve(gjh.value) === path.resolve(javaHome || '');
    if (!same) {
      checks.jdk.notes.push(
        `命令行 Gradle 可能使用 ~/.gradle/gradle.properties 中的 org.gradle.java.home（与当前解析的 JAVA 不一致时以文档为准）`,
      );
    }
  } else if (checks.jdk.status === 'ok' && !gjh.set) {
    checks.jdk.notes.push('未在 ~/.gradle/gradle.properties 设置 org.gradle.java.home；命令行 ./gradlew 可能仍用错误 JVM，见 android/SETUP.md Step 2');
  }

  checks.jdk.verificationTable = buildJdkVerificationRows(checks.jdk, checks.gradleProps);

  const sdk = resolveAndroidHome();
  checks.androidSdk.path = sdk;
  if (!sdk) {
    checks.androidSdk.status = 'fail';
    checks.androidSdk.notes.push('未找到 Android SDK（ANDROID_HOME、android/local.properties sdk.dir、~/Library/Android/sdk）');
  } else if (!fs.existsSync(path.join(sdk, 'platforms'))) {
    checks.androidSdk.status = 'warn';
    checks.androidSdk.notes.push('SDK 目录存在但缺少 platforms/，请用 SDK Manager 安装 Platform');
  } else {
    checks.androidSdk.status = 'ok';
  }

  const adb = adbOnPath();
  checks.adb = adb.ok
    ? { status: 'ok', detail: adb.detail }
    : { status: 'warn', detail: adb.detail };

  checks.cmdlineTools = checkCmdlineTools(sdk, javaHome);

  checks.androidSdk.verificationTable = buildAndroidToolchainRows(
    checks.androidSdk,
    checks.adb,
    checks.cmdlineTools,
  );

  checks.ios = buildIosReserved(root);

  const criticalFail =
    checks.jdk.status === 'fail' ||
    checks.androidSdk.status === 'fail' ||
    checks.gradlew.status === 'fail';

  checks.summary = {
    ok: !criticalFail,
    exitCode: criticalFail ? 1 : 0,
    message: criticalFail
      ? '存在阻塞项，请对照文档修复'
      : '核心项通过（adb、cmdline-tools 验证为可选）',
  };

  if (jsonMode) {
    process.stdout.write(`${JSON.stringify(checks, null, 2)}\n`);
    process.exit(checks.summary.exitCode);
    return;
  }

  const lines = [
    '=== preproj 环境自检（只读）===',
    `仓库根: ${checks.repoRoot}`,
    '',
    `JDK: ${checks.jdk.status.toUpperCase()}`,
    ...formatVerificationTable(checks.jdk.verificationTable),
    ...checks.jdk.notes.map((n) => `  提示: ${n}`),
    '',
    `Android（SDK · adb · cmdline-tools）: ${checks.androidSdk.status.toUpperCase()} / adb ${checks.adb.status.toUpperCase()} / cmdline ${checks.cmdlineTools.status.toUpperCase()}`,
    ...formatVerificationTable(checks.androidSdk.verificationTable),
    ...checks.cmdlineTools.notes.map((n) => `  提示: ${n}`),
    '',
    `android/gradlew: ${checks.gradlew.status.toUpperCase()} — ${checks.gradlew.path}`,
    '',
    `iOS（预留，不参与 exit）: ${checks.ios.status.toUpperCase()}`,
    `  说明: ${checks.ios.reason}`,
    `  工作区 ${checks.docs.iosWorkspace}: ${checks.ios.workspacePresent ? '存在' : '不存在'} (${checks.ios.workspacePath})`,
    ...checks.ios.notes.map((n) => `  提示: ${n}`),
    '',
    `Node（本脚本运行时）: ${checks.node}`,
    '',
    '文档:',
    `  - ${checks.docs.androidSetup}`,
    `  - ${checks.docs.iosWorkspace}（iOS 搭建文档就绪后可与脚本 docs 对齐）`,
    `  - ${checks.docs.skill}`,
    '',
    '可选白名单安装（仅 macOS Homebrew JDK，其余见 SETUP）:',
    `  ${checks.optionalInstallWhitelist.macosHomebrewJdk17}`,
    '',
    `结果: ${checks.summary.message} (exit ${checks.summary.exitCode})`,
  ];
  process.stdout.write(`${lines.join('\n')}\n`);
  process.exit(checks.summary.exitCode);
}

main();
