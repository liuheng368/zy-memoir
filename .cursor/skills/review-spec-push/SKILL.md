---
name: review-spec-push
description: >-
  RedHi WebHook 群通知与 spec 推送：在 Cursor 中 @ 本 Skill 并 @ 某份 docs/features/.../spec.md 时，Agent 应在仓库根执行
  redhi-webhook-send.mjs，使用 -T spec-md，且 --spec-path 等于用户引用的仓库相对路径以拼装 blob 并发送。
  亦涵盖 RedHi 机器人 API 集成说明。
---

# RedHi WebHook 与 Spec 推送

Skill 目录：**`.cursor/skills/review-spec-push/`**。

## 在 Cursor 里触发推送（@ Skill + @ 文档路径）

用户在同一轮对话里 **@ 引用本 Skill**（例如 `@.cursor/skills/review-spec-push/SKILL.md` 或 `@review-spec-push`）并 **@ 引用要通知的 spec 文件**（例如 `@docs/features/address-selector/spec.md`），且意图为 **发送群机器人通知** 时，Agent 应：

1. 从用户 @ 的文件得到 **仓库相对路径**（如 `docs/features/address-selector/spec.md`）。
2. 在 **仓库根目录** 执行脚本，使用 **`-T spec-md`**，并传入 **`--spec-path <该相对路径>`**（勿写死为其它 feature）。
3. 确认当前分支正确（链接中的 blob ref 来自 `git rev-parse`）。

**示例（address-selector）**：

```bash
cd <仓库根>
node .cursor/skills/review-spec-push/scripts/redhi-webhook-send.mjs -T spec-md \
  --spec-path docs/features/address-selector/spec.md
```

若用户只 @ Skill、未 @ 具体文件，可询问路径或使用脚本默认值（见下节「模板占位符」）。

---

团队内通过 **小红书开放平台 WebHook 机器人 API** 向群聊发消息。服务端实现上通常为 Spring `@Service`，用 **OkHttp** 经 **`MonitoredHttpUtils`** 发起 POST，密钥与通道从 **配置** 读取。

## 官方文档

- 内部文档入口（需权限）：[WebHook 机器人群聊消息发送](https://docs.xiaohongshu.com/doc/5f02dcdd594a81bffdf497e142e57ed7)

## 本地可执行脚本（Node）

与本 Skill 同目录：**`.cursor/skills/review-spec-push/scripts/redhi-webhook-send.mjs`**。命令行发一条群消息，请求体与 Java 服务一致。需 **Node 18+**（内置 `fetch`）。

```bash
# 在仓库根目录执行
chmod +x .cursor/skills/review-spec-push/scripts/redhi-webhook-send.mjs   # 可选
node .cursor/skills/review-spec-push/scripts/redhi-webhook-send.mjs "你好"
node .cursor/skills/review-spec-push/scripts/redhi-webhook-send.mjs --text "纯文本"
# 艾特全员（与下方 YAML `mentioned-list: "@all"` 一致）
node .cursor/skills/review-spec-push/scripts/redhi-webhook-send.mjs "公告" --at-all
node .cursor/skills/review-spec-push/scripts/redhi-webhook-send.mjs "公告" --mention '@all'
# 艾特指定成员（逗号分隔，与 Java `split(",")` 一致）
node .cursor/skills/review-spec-push/scripts/redhi-webhook-send.mjs "请处理" --mention userA,userB
# 不追加默认艾特（见脚本内 DEFAULT_MENTION_IDS）
node .cursor/skills/review-spec-push/scripts/redhi-webhook-send.mjs "广播" --no-default-mention --at-all
# 消息模板 spec-md：git user.name；{spec_url} 由「当前分支/commit + --spec-path」动态拼装 GitLab blob（见脚本 GITLAB_BLOB_PREFIX）
node .cursor/skills/review-spec-push/scripts/redhi-webhook-send.mjs -T spec-md
node .cursor/skills/review-spec-push/scripts/redhi-webhook-send.mjs -T spec-md --spec-path docs/features/address-selector/spec.md
node .cursor/skills/review-spec-push/scripts/redhi-webhook-send.mjs -T spec-md --spec-path docs/features/other-feature/spec.md
node .cursor/skills/review-spec-push/scripts/redhi-webhook-send.mjs --template spec-md --spec-url "https://code.devops.xiaohongshu.com/.../spec.md"
```

脚本内 **webhookKey 固定写死** 为，不提供环境变量覆盖。

**默认艾特**：`mentioned_list` 会合并 **`DEFAULT_MENTION_IDS`** 与 `--mention` / `--at-all`。若 API 要求传 **userid**，请改脚本内常量。

### 模板占位符（`spec-md`）

| 占位符 | 替换为 |
|--------|--------|
| `{git_user_name}` 或 `{ git user.name }` | 当前仓库 `git config user.name` |
| `{spec_url}` | **默认**：`GITLAB_BLOB_PREFIX` + 当前 **分支/commit** + 文档相对路径。未传 `--spec-path` 时默认 `docs/features/quota-display/spec.md`。**完全自定义**：`--spec-url`（优先级最高） |

**默认正文句式**：

- **spec-md**：`{git_user_name} 创建完成 spec.md 链接为 {spec_url}  请及时 review 代码`

## API 约定

- **Base URL（固定）**：`https://redcity-open.xiaohongshu.com/api/robot/webhook/send`
- **完整请求 URL**：`{BASE}?key={webhookKey}`。生产 Java 服务中的 **`webhookKey` 应来自配置**；本地脚本见上节。
- **Header**：`Content-Type: application/json`
- **Body**：JSON；顶层 `msgtype` 与内容块字段名取决于消息类型（见下）。

### `msgtype` 与正文结构

- **MARKDOWN**：`msgtype` 为 API 约定的 markdown 类型值；正文放在 `markdown` 对象内，例如：
  - `markdown.content`：字符串
  - 可选：`markdown.mentioned_list`：字符串数组（由配置里逗号分隔字符串 `split(",")` 得到）
- **TEXT**：同理使用 `text` 作为内容块 key，`text.content`、`text.mentioned_list`。

实现时需与 **`BotMessageType`** 枚举的 `getValue()` 与分支（`markdown` vs `text`）保持一致。

### 艾特人 / 艾特全员 `mentioned_list`

与 Java `buildRequestBody` 一致：在 **`markdown` / `text` 内** 增加 **`mentioned_list`**，值为 **字符串数组**。配置里常用 **逗号分隔字符串**，服务端 `split(",")` 后写入 JSON。

- **艾特全员**：数组中包含 **`"@all"`**（单元素即可）。YAML 示例：

```yaml
# 某通道下，与 BotNotificationProperties.ChannelConfig 对齐
mentioned-list: "@all"
# 或等价（若字段名为 camelCase）
mentionedList: "@all"
```

- **艾特指定成员**：`mentioned_list: "userId1,userId2"` → `["userId1","userId2"]`。

## Spring 侧模式（与业务代码对齐）

1. **`BotNotificationProperties`**：开关 `enabled`、多通道 `channels`（每通道含 `webhookKey`、`mentionedList` 等；`mentionedList` 为 `"@all"` 或逗号分隔 userid 字符串）。
2. **`@PostConstruct initChannels()`**：把配置灌入 `ConcurrentHashMap<String, NotificationChannel>`，key 为通知类型字符串（可与 **`NotificationType`** 枚举 `value` 对齐）。
3. **`sendByType(NotificationType, BotMessageType, String)`**：解析通道 → 若通道开启 **自动追加追踪 ID**，且正文尚未含 `**追踪ID**`，则在文首拼接 **`TraceUtil.getTraceId()`**。
4. **`sendBotMessage`（private）**：校验开关与参数 → 组 URL → `buildRequestBody` → Gson 序列化 → **`monitoredHttpUtils.execute(request)`** → 按 HTTP 状态打日志；**IO/其它异常在内部 catch**，不向外抛，避免影响主流程。

## 日志

- 成功/失败应记录 **webhookKey 标识**（或脱敏后的后缀）、HTTP code、响应体摘要。
- **禁止**在 `log.info` 中输出完整 JSON 若其中可能含业务敏感内容；若团队要求调试完整 body，应限环境或脱敏。

## 安全与合规

- **生产服务**：`webhookKey` 应只放在 **Apollo / `application*.yml` / 密钥管理**，避免硬编码进业务 Jar。
- **本地脚本**：`.cursor/skills/review-spec-push/scripts/redhi-webhook-send.mjs` 将 webhookKey **固定写死** 为上述 UUID，换机器人需改脚本内常量。
- 审查时：生产代码路径下硬编码 key 仍宜标为风险。

## Agent 行为提示

- **@ Skill + @ spec.md**：用户同时引用本 Skill 与某 `docs/features/<feature>/spec.md` 并要求推送时，**必须**用 **`-T spec-md --spec-path <用户 @ 的路径>`** 执行脚本，保证群消息里的链接对应该 spec。
- **实现新通道**：优先只加 **配置**（新 `notificationType` → 新 `webhookKey`），避免改 Java。
- **排查发送失败**：先看 `enabled`、通道是否存在、HTTP 状态码与响应体；再确认 `msgtype` 与 JSON 结构是否与 API 一致。
- 需要快速验证通道时优先跑 **`.cursor/skills/review-spec-push/scripts/redhi-webhook-send.mjs`**。
