#!/usr/bin/env node
/**
 * RedHi WebHook 群消息发送（与 Java RedHiBotNotificationService 请求体一致）
 *
 * 用法（在仓库根目录）:
 *   node .cursor/skills/review-spec-push/scripts/redhi-webhook-send.mjs "消息内容"
 *   node .cursor/skills/review-spec-push/scripts/redhi-webhook-send.mjs --text "纯文本"
 *   node .cursor/skills/review-spec-push/scripts/redhi-webhook-send.mjs -m "markdown" --mention user1,user2
 *   node .cursor/skills/review-spec-push/scripts/redhi-webhook-send.mjs "公告" --at-all
 *   node .cursor/skills/review-spec-push/scripts/redhi-webhook-send.mjs "公告" --mention '@all'
 *   node .cursor/skills/review-spec-push/scripts/redhi-webhook-send.mjs "仅通知" --no-default-mention
 *   node .cursor/skills/review-spec-push/scripts/redhi-webhook-send.mjs -T spec-md
 *   node .cursor/skills/review-spec-push/scripts/redhi-webhook-send.mjs --template spec-md --spec-path docs/features/foo/spec.md
 *   node .cursor/skills/review-spec-push/scripts/redhi-webhook-send.mjs --template spec-md --spec-url "<完整 blob url>"  # 完全覆盖拼装
 *
 * 默认 mentioned_list 见 DEFAULT_MENTION_IDS。
 */

import process from "node:process";
import { getGitUserName, getGitBranchOrSha } from '../../_shared/redhi-git.mjs';
import { getRedHiWebhookUrl } from '../../_shared/redhi-config.mjs';

/**
 * 默认艾特（merged_list 前置；与 RedHi API mentioned_list 一致，若需 userid 可改此常量）
 * 跳过：命令行加 --no-default-mention
 *
 */
const DEFAULT_MENTION_IDS = ["zhangxuyan@xiaohongshu.com"];

/** DevOps GitLab 仓库 blob 前缀（与 worldly/mobile/preproj 一致） */
const GITLAB_BLOB_PREFIX =
  "https://code.devops.xiaohongshu.com/worldly/mobile/preproj/-/blob/";

/** 未传 --spec-path 时，相对仓库根目录的默认 spec 文件路径 */
const DEFAULT_SPEC_RELATIVE_PATH = "docs/features/quota-display/spec.md";

/**
 * 消息模板：`spec-md` 与 RedHi markdown 一致；占位符见 renderTemplate。
 * @type {Record<string, string>}
 */
const MESSAGE_TEMPLATES = {
  "spec-md":
    "{git_user_name} 创建完需求 [spec.md]({spec_url})，请帮忙 review 代码",
};

function normalizeRepoRelativePath(p) {
  return p.replace(/^[/\\]+/, "").replace(/\\/g, "/");
}

/**
 * @param {string} ref 分支名或 commit sha
 * @param {string} relativePath 相对仓库根，如 docs/features/foo/spec.md
 */
function buildGitlabBlobUrl(ref, relativePath) {
  const path = normalizeRepoRelativePath(relativePath);
  const r = ref.trim();
  return `${GITLAB_BLOB_PREFIX}${r}/${path}`;
}

/**
 * @param {string} templateKey
 * @param {{ specUrl: string }} vars
 */
function renderTemplate(templateKey, vars) {
  const raw = MESSAGE_TEMPLATES[templateKey];
  if (!raw) {
    console.error(`未知模板: ${templateKey}，可用: ${Object.keys(MESSAGE_TEMPLATES).join(", ")}`);
    process.exit(2);
  }
  const gitName = getGitUserName();
  return raw
    .replace(/\{git_user_name\}/g, gitName)
    .replace(/\{\s*git\s+user\.name\s*\}/g, gitName)
    .replace(/\{spec_url\}/g, vars.specUrl);
}

function parseArgs(argv) {
  let mode = "markdown";
  /** @type {string[]} */
  let mentions = [];
  let atAll = false;
  let noDefaultMention = false;
  /** @type {string | null} */
  let templateKey = null;
  /** @type {string | null} */
  let explicitSpecUrl = null;
  let specPath = DEFAULT_SPEC_RELATIVE_PATH;
  /** @type {string[]} */
  const positional = [];

  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--text" || a === "-t") {
      mode = "text";
      continue;
    }
    if (a === "--markdown" || a === "-m") {
      mode = "markdown";
      continue;
    }
    if (a === "--at-all" || a === "-A") {
      atAll = true;
      continue;
    }
    if (a === "--no-default-mention" || a === "-N") {
      noDefaultMention = true;
      continue;
    }
    if (a === "--mention" || a === "-M") {
      const v = argv[++i];
      if (v)
        mentions = v
          .split(",")
          .map((s) => s.trim())
          .filter(Boolean);
      continue;
    }
    if (a === "--template" || a === "-T") {
      templateKey = argv[++i] || null;
      continue;
    }
    if (a === "--spec-url") {
      const v = argv[++i];
      if (v) explicitSpecUrl = v.trim();
      continue;
    }
    if (a === "--spec-path") {
      const v = argv[++i];
      if (v) specPath = normalizeRepoRelativePath(v.trim());
      continue;
    }
    if (a === "-h" || a === "--help") {
      return { help: true };
    }
    if (a.startsWith("-")) {
      console.error(`未知参数: ${a}`);
      process.exit(2);
    }
    positional.push(a);
  }

  if (atAll && !mentions.includes("@all")) {
    mentions = [...mentions, "@all"];
  }

  if (!noDefaultMention) {
    const seen = new Set();
    mentions = [...DEFAULT_MENTION_IDS, ...mentions].filter((id) => {
      if (seen.has(id)) return false;
      seen.add(id);
      return true;
    });
  }

  return { mode, mentions, positional, templateKey, explicitSpecUrl, specPath };
}

function buildRequestBody(messageType, message, mentionedListStr) {
  const msgtype = messageType === "markdown" ? "markdown" : "text";
  const contentKey = messageType === "markdown" ? "markdown" : "text";
  const contentMap = { content: message };
  if (mentionedListStr && mentionedListStr.length > 0) {
    contentMap.mentioned_list = mentionedListStr;
  }
  return { msgtype, [contentKey]: contentMap };
}

async function main() {
  const parsed = parseArgs(process.argv);
  if (parsed.help) {
    console.log(`用法（在仓库根目录）:
  node .cursor/skills/review-spec-push/scripts/redhi-webhook-send.mjs [选项] <消息正文>

选项:
  --text, -t          纯文本（默认 markdown）
  --markdown, -m      Markdown（默认）
  --mention, -M LIST  艾特成员 userid，逗号分隔；艾特全员可传 @all（shell 需加引号，如 -M '@all'）
  --at-all, -A        在 mentioned_list 中加入 "@all"（等同配置 mentioned-list: "@all"）
  --no-default-mention, -N  不追加默认艾特（见脚本 DEFAULT_MENTION_IDS）
  --template, -T NAME  使用内置消息模板（如 spec-md），可不写正文
  --spec-path PATH     与 spec-md 联用，仓库内 spec 相对路径（默认 ${DEFAULT_SPEC_RELATIVE_PATH}），用于拼装 blob URL
  --spec-url URL       与 spec-md 联用，直接指定完整 blob 链接（优先级高于 --spec-path + 当前分支）
  -h, --help          帮助

默认：mentioned_list 会包含 ${DEFAULT_MENTION_IDS.join("、")}，再合并 --mention / --at-all。
模板 spec-md：{spec_url} 默认由 当前 git 分支/commit + --spec-path 拼成 GitLab blob；也可用 --spec-url 写死。
`);
    process.exit(0);
  }

  const { mode, mentions, positional, templateKey, explicitSpecUrl, specPath } =
    parsed;
  let message = positional.join(" ").trim();

  let specUrl = "";
  if (templateKey === "spec-md") {
    specUrl =
      explicitSpecUrl || buildGitlabBlobUrl(getGitBranchOrSha('redhi-webhook-send'), specPath);
  }

  if (templateKey) {
    message = renderTemplate(templateKey, { specUrl });
  }
  if (!message) {
    console.error(
      '请提供消息内容或使用模板，例如: node .cursor/skills/review-spec-push/scripts/redhi-webhook-send.mjs "hello" 或 -T spec-md',
    );
    process.exit(1);
  }

  const url = getRedHiWebhookUrl();
  const body = buildRequestBody(mode, message, mentions);

  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json; charset=utf-8" },
    body: JSON.stringify(body),
  });

  const text = await res.text();
  if (!res.ok) {
    console.error(`HTTP ${res.status} ${res.statusText}`);
    console.error(text);
    process.exit(1);
  }
  console.log(text || "(empty body)");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
