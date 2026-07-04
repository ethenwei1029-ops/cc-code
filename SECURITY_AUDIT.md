# cc-code 安全审计报告

> 审计日期：2026-07-04
> 审计范围：`/Users/ethen/f/code/cc-code/src` 全部源码
> 审计背景：基于 Claude Code 源码的公开隐患传闻，针对三类已知问题进行排查

---

## 一、注入空格字符降低缓存命中（未发现）

### 传闻

通过在 prompt 或 API 请求中注入额外空格、不可见字符，降低 prompt cache 命中率，增加用户费用。

### 排查结论

**未发现该行为。** 源码不仅没有注入空格，反而在 20+ 处注释中强调**避免缓存失效**。

### 详细证据

#### 1. 系统提示构建无任何内容篡改

`services/api/claude.ts:3213-3237` — `buildSystemPromptBlocks` 函数将系统提示映射为 API 的 `TextBlockParam[]`，只做 `{ type: 'text', text, cache_control }` 映射，不拼接、不 padding、不修改字节。注释明确写着：

```
IMPORTANT: Do not add any more blocks for caching or you will get a 400
```

#### 2. 日期字符串 memoize 避免缓存失效

`constants/common.ts:20-27` — 日期和月度字符串做了 memoize，注释：

```
avoid busting the cached prefix
```

#### 3. 工具列表传递方式避免缓存失效

`services/PromptSuggestion/promptSuggestion.ts:301-321`：

```
Deny tools via callback, NOT by passing tools:[] - that busts cache (0% hit)
PR #18143 tried effort:'low' and caused a 45x spike in cache...
```

#### 4. 全代码库 cache bust 相关注释（均为避免缓存失效）

| 文件 | 行 | 说明 |
|------|-----|------|
| `main.tsx` | 447 | 避免 settings 路径导致缓存失效 |
| `bootstrap/state.ts` | 224-241 | TTL/Shift+Tab 切换不破坏 ~50-70K token 缓存 |
| `services/api/claude.ts` | 405 | GrowthBook 设置切换的 1h TTL 锁定避免中途翻转 |
| `services/api/claude.ts` | 1329 | 解释为何采用 delta attachment 而非 prepend |
| `services/api/claude.ts` | 1350 | chrome 延迟连接不破坏缓存 |
| `services/api/claude.ts` | 1407 | 会话中途切换不改变服务端缓存 key |
| `constants/common.ts` | 20-27 | memoize 日期避免缓存前缀失效 |
| `utils/attachments.ts` | 510 | 不同字节会导致缓存失效（规避说明） |
| `services/PromptSuggestion/promptSuggestion.ts` | 301-321 | 通过 callback 拒绝工具，不通过 tools:[] |
| `services/AgentSummary/agentSummary.ts` | 93 | 同上 |
| `utils/sideQuestion.ts` | 83 | 分支配置不破坏主线程缓存 |
| `utils/toolSchemaCache.ts` | 4-8 | 固定工具 schema 缓存位置 |
| `tools/AgentTool/forkSubagent.ts` | 58 | 线程化渲染字节精确 |
| `tools/BashTool/prompt.ts` | 186 | 使用 $TMPDIR 使 prompt 跨用户一致 |

#### 5. 空白字符处理是反向的（删除而非注入）

`utils/messages.ts:4831-4891` — `hasOnlyWhitespaceTextContent` / `filterWhitespaceOnlyAssistantMessages` 主动**移除**空白消息，因为 `the API requires text content blocks must contain non-whitespace text`。

#### 6. 唯一的 randomBytes 调用与 prompt 无关

`utils/permissions/filesystem.ts:367-368` — `randomBytes(16)` 用于临时目录路径的安全 nonce，不进入 prompt 或 API 请求。

---

## 二、检测中国人（shanghai/beijing/asian 等关键词）（未发现）

### 传闻

代码中检测 "shanghai"、"beijing"、"asian" 等关键词，对中国用户进行差异化处理。

### 排查结论

**未发现该行为。** 无任何基于地理位置、国籍、种族的检测或行为差异化逻辑。

### 详细证据

#### 1. 无 GeoIP / 地理定位

全代码库无任何 IP 地理定位 API 调用，无 GeoIP 库引用，无国家代码检测逻辑。

#### 2. 关键词搜索结果全部为良性

| 关键词 | 文件 | 行 | 实际用途 |
|--------|------|-----|----------|
| `eastAsianWidth` / `isEastAsianWide` | `ink/stringWidth.ts` | 2,16,61,83 | CJK 字符终端列宽计算 |
| `eastAsianWidth` | `ink/termio/parser.ts` | 39,67 | 同上 |
| `Chinese, Japanese, Korean` | `utils/Cursor.ts` | 1170 | CJK IME 输入处理注释 |
| `Chinese, Japanese, Korean` | `utils/stringUtils.ts` | 70,80 | 同上注释 |
| `Japanese, 日本語` | `components/LanguagePicker.tsx` | 61 | 用户语言选择器占位文本 |
| `japanese: 'ja'` 等 | `hooks/useVoice.ts` | 42-79 | 用户**手动选择**的语音语言映射 |
| `japanese` | `tools/ConfigTool/supportedSettings.ts` | 125 | 设置文档示例值 |
| `ASIA` | `services/teamMemorySync/secretScanner.ts` | 52 | AWS 密钥正则 `AKIA\|ASIA\|ABIA\|ACCA` 的一部分 |

#### 3. 时区仅用于显示和调度

- `utils/intl.ts:69-87` — `getTimeZone()` 缓存 `Intl.DateTimeFormat().resolvedOptions().timeZone`，仅用于时间格式化显示
- `utils/cron.ts` — cron 调度的本地时间计算
- `tools/ScheduleCronTool/prompt.ts:89` — 告知模型用户时区以便 UTC 转换
- 无任何基于时区的行为门控

#### 4. 唯一的 country 引用是静态文案

`utils/preflightChecks.tsx:130`：

```
Claude Code might not be available in your country.
Check supported countries at https://anthropic.com/supported-countries
```

这是网络连接失败时的通用错误提示，不做任何检测。

#### 5. 区域相关代码均为云端推理路由

`utils/managedEnvConstants.ts`、`utils/model/bedrock.ts` — `AWS_REGION`、`VERTEX_REGION_CLAUDE_*` 等是用户配置的云端推理区域，非用户位置检测。

---

## 三、其它已知问题

### 3.1 遥测/数据上报（存在，可关闭）

#### Datadog 日志上报

| 属性 | 详情 |
|------|------|
| 文件 | `services/analytics/datadog.ts` |
| 端点 | `https://http-intake.logs.us5.datadoghq.com/api/v2/logs` |
| Client Token | `pubbbf48e6d78dae54bceaa4acf463299bf`（公开 token） |
| 发送内容 | 事件名、模型、版本、平台/架构、userType、HTTP 状态、用户分桶（SHA256(userID) mod 30）、会话 ID、工具名 |
| 触发条件 | `NODE_ENV === 'production'` + `getAPIProvider() === 'firstParty'` + GrowthBook gate 开启 |
| 风险等级 | 中 — 第三方供应商接收使用遥测 |

#### 第一方事件上报

| 属性 | 详情 |
|------|------|
| 文件 | `services/analytics/firstPartyEventLoggingExporter.ts` |
| 端点 | `https://api.anthropic.com/api/event_logging/batch` |
| 发送内容 | device_id（用户 UUID）、email、account_uuid、organization_uuid、session_id、model、环境上下文（平台/架构/Node 版本/终端/包管理器/运行时/CI 标志/版本/构建时间）、订阅类型、agent ID、repo remote hash、进程指标（RSS/heap/CPU）、additional_metadata（base64 编码 JSON） |
| 失败重试 | 持久化到 `~/.claude/telemetry/1p_failed_events.*.json`，二次退避重试 |
| 风险等级 | 中 — 主要的"phone home"通道，数据范围广 |

#### GrowthBook 特性标志

| 属性 | 详情 |
|------|------|
| 文件 | `services/analytics/growthbook.ts` |
| 端点 | `https://api.anthropic.com/` (remoteEval) |
| 发送内容 | user UUID、sessionId、平台、apiBaseUrlHost（自定义代理主机名）、organizationUUID、accountUUID、userType、subscriptionType、rateLimitTier、email、appVersion、GitHub Actions 元数据 |
| 内嵌密钥 | `constants/keys.ts:5-11`（公开 SDK key，设计如此） |
| 风险等级 | 低-中 — 标准特性标志服务，apiBaseUrlHost 会暴露企业代理主机名 |

#### BigQuery 指标

| 属性 | 详情 |
|------|------|
| 文件 | `utils/telemetry/bigqueryExporter.ts` |
| 端点 | `https://api.anthropic.com/api/claude_code/metrics` |
| 风险等级 | 低 |

### 3.2 设备指纹

#### 归因指纹

| 属性 | 详情 |
|------|------|
| 文件 | `utils/fingerprint.ts` |
| 算法 | `SHA256(SALT + msg[4] + msg[7] + msg[20] + version)[:3]` |
| 盐值 | `59cf53e54c78`（硬编码，设计如此，后端验证相同盐值） |
| 输出 | 3 位 hex（4096 种可能值），无法反推消息内容 |
| 风险等级 | 低 |

#### 设备/机器指纹

| 属性 | 详情 |
|------|------|
| 文件 | `utils/config.ts`（`getOrCreateUserID`）、`services/analytics/metadata.ts` |
| 标识 | 持久随机 UUID 存于 `~/.cc-code.json`，作为 `device_id` 随每次事件上报 |
| 附加信息 | 平台/架构/Node 版本/终端/包管理器/运行时/WSL 版本/Linux 发行版/VCS |
| 风险等级 | 中 — 跨会话稳定机器标识，Datadog 中已哈希为 30 分桶，1P 端点为明文 |

### 3.3 环境变量收集

| 属性 | 详情 |
|------|------|
| 文件 | `services/analytics/metadata.ts:582-638`（`buildEnvContext`） |
| 收集范围 | 白名单制：`CI`、`CLAUDE_CODE_REMOTE`、`CLAUDE_CODE_ENTRYPOINT`、`GITHUB_ACTIONS`、`GITHUB_EVENT_NAME`、`RUNNER_OS`、`USER_TYPE` 等 |
| 重要说明 | **不会**序列化整个 `process.env`，仅收集白名单内具名变量 |
| GitHub CI | `utils/user.ts:116-125` 在 CI 环境下发送 `GITHUB_ACTOR`、`GITHUB_REPOSITORY` 等 |
| 风险等级 | 低-中 — 有界但 CI 用户会暴露 GitHub actor/repo ID |

### 3.4 自动更新

| 属性 | 详情 |
|------|------|
| 文件 | `utils/autoUpdater.ts` |
| 机制 | `claude update` 执行 `npm install -g @anthropic-ai/claude-code@<version>` |
| 版本来源 | npm registry 或 GCS bucket `storage.googleapis.com/claude-code-dist-...` |
| 防护 | `~/.claude/.update.lock` 原子创建（O_EXCL + TOCTOU re-check）；从 `homedir()` 执行以避免项目级 `.npmrc` 劫持 |
| 服务端控制 | `tengu_max_version_config` / `tengu_version_config` GrowthBook 配置可强制更新或阻止版本 |
| 风险等级 | 中 — npm 全局安装会执行 install 脚本，这是 npm 全局安装的固有风险 |

### 3.5 未发现的问题

| 类别 | 排查结果 |
|------|----------|
| 文件内容外泄 | 未发现。工具读取的文件内容只进入 LLM 对话，不进入遥测 |
| 后门 | 未发现。`CLAUDE_INTERNAL_FC_OVERRIDES` 等覆盖开关仅限 `USER_TYPE === 'ant'`（Anthropic 内部构建），外部构建不可达 |
| 隐写术 | 未发现。base64 字段是 proto 序列化格式，非隐藏通道 |
| 隐藏 API 端点 | 未发现。所有外部 URL 见下表 |

### 3.6 全部外部 URL 汇总

| URL | 文件 | 用途 | 风险 |
|-----|------|------|------|
| `https://http-intake.logs.us5.datadoghq.com/api/v2/logs` | `services/analytics/datadog.ts:13` | Datadog 遥测 | 中 |
| `https://api.anthropic.com/api/event_logging/batch` | `services/analytics/firstPartyEventLoggingExporter.ts:114` | 1P 事件上报 | 中 |
| `https://api.anthropic.com/` (remoteEval) | `services/analytics/growthbook.ts:503` | GrowthBook 特性标志 | 低-中 |
| `https://api.anthropic.com/api/claude_code/metrics` | `utils/telemetry/bigqueryExporter.ts:47` | BigQuery 指标 | 低 |
| `https://storage.googleapis.com/claude-code-dist-...` | `utils/autoUpdater.ts:31` | 自动更新二进制 | 低 |
| `https://downloads.claude.ai/claude-code-releases/plugins/...` | `utils/plugins/officialMarketplaceGcs.ts:29` | 官方插件市场 | 良性 |
| `https://api.anthropic.com/mcp-registry/v0/servers` | `services/mcp/officialRegistry.ts:40` | 官方 MCP 注册表 | 良性 |
| `https://api.anthropic.com/api/web/domain_info?domain=...` | `tools/WebFetchTool/utils.ts:184` | WebFetch 域名信誉检查 | 低 |
| `https://api.anthropic.com/api/claude_code/organizations/metrics_enabled` | `services/api/metricsOptOut.ts:45` | 组织级指标 opt-out 检查 | 良性 |
| `https://mcp-proxy.anthropic.com` | `constants/oauth.ts:102` | MCP 代理 | 良性 |
| `https://claude.ai/chrome` | `utils/claudeInChrome/mcpServer.ts:24` | Chrome 扩展下载 | 良性 |

---

## 四、关闭遥测的方法

所有遥测通道（Datadog、1P 事件、GrowthBook、BigQuery）均检查 `isAnalyticsDisabled()`（定义于 `services/analytics/config.ts:19-27`），满足以下任一条件即关闭：

1. 设置环境变量：
   ```bash
   export CLAUDE_CODE_DISABLE_TELEMETRY=1
   ```

2. 在 settings 中将 privacy level 设为 `no-telemetry` 或 `essential-traffic`

3. 使用 Bedrock/Vertex/Foundry 作为 API provider（自动禁用）

4. 测试环境（`NODE_ENV !== 'production'`）

---

## 五、总结

| 问题 | 结论 |
|------|------|
| 注入空格降低缓存命中 | **未发现**。代码反而在 20+ 处主动避免缓存失效 |
| 检测中国人/地域关键词 | **未发现**。无 GeoIP、无国家检测、无行为差异化 |
| 遥测/数据上报 | **存在**，可关闭。Datadog + 1P 事件 + GrowthBook，均受 opt-out 控制 |
| 文件内容外泄 | **未发现** |
| 后门 | **未发现** |
| 隐写术 | **未发现** |
| 设备指纹 | **存在**。持久 UUID + 归因指纹，受 opt-out 控制 |
| 自动更新 | **存在**。npm 全局安装，有 .npmrc 劫持防护 |

**建议**：设置 `CLAUDE_CODE_DISABLE_TELEMETRY=1` 彻底关闭所有遥测上报。
