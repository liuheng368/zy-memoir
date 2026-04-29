/** Git 信息读取（RedHi 通知共享） */

import { execSync } from 'node:child_process';

export function getGitUserName() {
  try {
    const name = execSync('git config user.name', {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim();
    return name || '(git user.name 未设置)';
  } catch {
    return '(git user.name 未设置)';
  }
}

/**
 * 当前分支名；detached HEAD 时用完整 commit SHA（GitLab blob 均支持）。
 * @param {string} [warnTag='redhi'] catch 时 console.warn 的前缀标识
 */
export function getGitBranchOrSha(warnTag = 'redhi') {
  try {
    const branch = execSync('git rev-parse --abbrev-ref HEAD', {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim();
    if (branch && branch !== 'HEAD') return branch;
    return execSync('git rev-parse HEAD', {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim();
  } catch {
    console.warn(
      `[${warnTag}] 无法读取 git ref，回退为 main`,
    );
    return 'main';
  }
}
