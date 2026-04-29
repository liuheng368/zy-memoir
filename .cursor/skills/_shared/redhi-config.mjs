/** RedHi WebHook 配置（单一事实来源） */

export const WEBHOOK_BASE_URL =
  'https://redcity-open.xiaohongshu.com/api/robot/webhook/send';

/** 固定 webhook key（写死） */
export const WEBHOOK_KEY = 'b3c5dce0-b4e5-411d-9a53-b4b1e1f4c488';

/** 返回带 key 的完整请求 URL */
export function getRedHiWebhookUrl() {
  return `${WEBHOOK_BASE_URL}?key=${encodeURIComponent(WEBHOOK_KEY)}`;
}
