# cc-code 源码快照（安全研究与学习用途）

> 本仓库镜像了一份**公开暴露的 Claude Code 源码快照**，该快照于 **2026 年 3 月 31 日**通过 npm 发行包中的 source map 泄露而被访问。本仓库维护目的为**教育、防御性安全研究及软件供应链分析**。

---

## 使用声明

本项目**仅供学习与研究用途，不作为商业用途**。

新版 Claude Code 频繁暴露出各类问题——从被指通过注入空格字符降低 prompt cache 命中率以增加用户费用，到利用隐写术隐藏数据，再到疑似检测用户是否为亚洲人/中国人而进行差异化对待。本项目通过对泄露源码的防御性安全审计，旨在：

- 让社区了解这些问题的真实情况
- 提供一个可自行审查、修改和学习的代码基础
- 在原版基础上做出改进，提供更透明、更可控的使用体验

**原始 Claude Code 源代码的所有权归 Anthropic 所有。本项目与 Anthropic 无关，未获 Anthropic 背书，亦不由 Anthropic 维护。**

---

## 安全审计结果

针对社区关注的三大问题，我们对源码进行了全面排查（详见 [SECURITY_AUDIT.md](./SECURITY_AUDIT.md)）：

### 1. 注入空格降低缓存命中 — **未发现**

源码中完全没有注入空格、零宽字符或随机 padding 来降低缓存命中的行为。相反，代码在 20+ 处注释中强调**避免缓存失效**，主动 memoize 日期字符串、固定工具 schema 位置、通过 callback 而非 `tools:[]` 拒绝工具，一切都是为了**保护**缓存命中。

### 2. 检测中国人/地域关键词 — **未发现**

无任何 GeoIP、国家检测或基于地域的行为差异化逻辑。`shanghai`、`beijing`、`asian` 等关键词搜索结果全部为良性：CJK 字符宽度计算、用户手动选择的语言映射、AWS 密钥正则等。时区仅用于时间格式化和 cron 调度。

### 3. 隐写术/隐藏通道 — **未发现**

无隐写术、无隐藏 HTTP 头、无在无辜字段中编码数据。base64 字段是 proto 序列化格式，非隐藏通道。

### 4. 遥测与数据上报 — **存在，可关闭**

存在 Datadog 日志上报、第一方事件上报（api.anthropic.com）、GrowthBook 特性标志和 BigQuery 指标上报。发送内容包括设备 UUID、email、账户信息、机器指纹等。所有通道均受 `CLAUDE_CODE_DISABLE_TELEMETRY=1` 控制，可一键关闭。

### 5. 后门/越权 — **未发现**

所有覆盖开关（如 `CLAUDE_INTERNAL_FC_OVERRIDES`）仅限 `USER_TYPE === 'ant'`（Anthropic 内部构建），外部构建不可达。

---

## cc-code 改进记录

在原版源码基础上，本项目做了以下改进：

### 独立配置目录

原版使用 `~/.claude` 和 `~/.claude.json`，cc-code 改为独立的 `~/.cc-code` 和 `~/.cc-code.json`，与原版完全隔离：

| 项目 | 原版 | cc-code |
|------|------|---------|
| 配置目录 | `~/.claude/` | `~/.cc-code/` |
| 全局状态文件 | `~/.claude.json` | `~/.cc-code.json` |
| 环境变量覆盖 | `CLAUDE_CONFIG_DIR` | `CC_CODE_CONFIG_DIR`（兼容 `CLAUDE_CONFIG_DIR` 回退） |

所有子目录（`settings.json`、`backups/`、`teams/`、`CLAUDE.md` 等）自动跟随新路径。首次运行自动创建目录，无需手动配置。可以自由编辑 `~/.cc-code/settings.json` 来自定义模型。

### 品牌区分

| 项目 | 原版 | cc-code |
|------|------|---------|
| 启动品牌名 | `Claude Code` | `cc-code` |
| 吉祥物颜色 | 珊瑚橙 `rgb(215,119,87)` | 浅蓝 `rgb(89,166,235)` |
| 版本输出 | `1.0.0-snapshot (Claude Code)` | `1.0.0-snapshot (cc-code)` |

吉祥物图案保持原版 Clawd 形象，通过颜色区分（浅蓝色 vs 珊瑚橙）。

### 构建修复

修复了 `color-diff-napi` 模块解析问题：原版 node_modules 中的 stub 导出空对象而非真实类，导致 diff 渲染崩溃。通过 `bun-plugin.ts` 添加模块映射，指向 `src/native-ts/color-diff/index.ts` 的纯 TypeScript 实现。

### 编译安装

```bash
# 编译
bun build src/entrypoints/cli.tsx --compile --outfile=cc-code --target=bun --plugin bun-plugin.ts

# 安装（任选）
cp cc-code ~/bin/cc-code        # 用户级
sudo cp cc-code /usr/local/bin/ # 系统级
```

### 关闭遥测

```bash
export CLAUDE_CODE_DISABLE_TELEMETRY=1
```

---

## 公开快照如何变得可访问

[Chaofan Shou (@Fried_rice)](https://x.com/Fried_rice) 公开指出，Claude Code 的源代码可通过 npm 包中暴露的 `.map` 文件访问：

> **"Claude Code 源代码通过其 npm 注册表中的 map 文件泄露了！"**
>
> — [@Fried_rice，2026 年 3 月 31 日](https://x.com/Fried_rice/status/2038894956459290963)

已发布的 source map 引用了托管在 Anthropic R2 存储桶中的未混淆 TypeScript 源码，使得 `src/` 快照可被公开下载。

---

## 仓库范围

Claude Code 是 Anthropic 推出的 CLI 工具，用于在终端中与 Claude 交互，执行软件工程任务，如编辑文件、运行命令、搜索代码库和协调工作流。

本仓库包含一份镜像的 `src/` 快照，供研究和分析使用。

- **公开暴露发现时间**：2026-03-31
- **语言**：TypeScript
- **运行时**：Bun
- **终端 UI**：React + [Ink](https://github.com/vadimdemedes/ink)
- **规模**：约 1,900 个文件，512,000+ 行代码

---

## 目录结构

```text
src/
├── main.tsx                 # 入口编排（基于 Commander.js 的 CLI 路径）
├── commands.ts              # 命令注册表
├── tools.ts                 # 工具注册表
├── Tool.ts                  # 工具类型定义
├── QueryEngine.ts           # LLM 查询引擎
├── context.ts               # 系统/用户上下文收集
├── cost-tracker.ts          # Token 费用追踪
│
├── commands/                # 斜杠命令实现（约 50 个）
├── tools/                   # 智能体工具实现（约 40 个）
├── components/              # Ink UI 组件（约 140 个）
├── hooks/                   # React Hooks
├── services/                # 外部服务集成
├── screens/                 # 全屏 UI（Doctor、REPL、Resume）
├── types/                   # TypeScript 类型定义
├── utils/                   # 工具函数
│
├── bridge/                  # IDE 及远程控制桥接层
├── coordinator/             # 多智能体协调器
├── plugins/                 # 插件系统
├── skills/                  # 技能系统
├── keybindings/             # 快捷键配置
├── vim/                     # Vim 模式
├── voice/                   # 语音输入
├── remote/                  # 远程会话
├── server/                  # 服务器模式
├── memdir/                  # 持久化内存目录
├── tasks/                   # 任务管理
├── state/                   # 状态管理
├── migrations/              # 配置迁移
├── schemas/                 # 配置模式（Zod）
├── entrypoints/             # 初始化逻辑
├── ink/                     # Ink 渲染器封装
├── buddy/                   # 伴侣精灵
├── native-ts/               # 原生 TypeScript 工具
├── outputStyles/            # 输出样式
├── query/                   # 查询管道
└── upstreamproxy/           # 代理配置
```

---

## 架构概览

### 1. 工具系统（`src/tools/`）

Claude Code 可调用的每个工具均实现为独立模块，每个工具定义其输入模式、权限模型和执行逻辑。

| 工具 | 说明 |
|---|---|
| `BashTool` | Shell 命令执行 |
| `FileReadTool` | 文件读取（图片、PDF、笔记本） |
| `FileWriteTool` | 文件创建/覆盖 |
| `FileEditTool` | 文件局部修改（字符串替换） |
| `GlobTool` | 文件模式匹配搜索 |
| `GrepTool` | 基于 ripgrep 的内容搜索 |
| `WebFetchTool` | 获取 URL 内容 |
| `WebSearchTool` | 网络搜索 |
| `AgentTool` | 子智能体生成 |
| `SkillTool` | 技能执行 |
| `MCPTool` | MCP 服务器工具调用 |
| `LSPTool` | 语言服务器协议集成 |
| `NotebookEditTool` | Jupyter 笔记本编辑 |
| `TaskCreateTool` / `TaskUpdateTool` | 任务创建与管理 |
| `SendMessageTool` | 智能体间消息传递 |
| `TeamCreateTool` / `TeamDeleteTool` | 团队智能体管理 |
| `EnterPlanModeTool` / `ExitPlanModeTool` | 计划模式切换 |
| `EnterWorktreeTool` / `ExitWorktreeTool` | Git 工作树隔离 |
| `ToolSearchTool` | 延迟工具发现 |
| `CronCreateTool` | 定时触发器创建 |
| `RemoteTriggerTool` | 远程触发 |
| `SleepTool` | 主动模式等待 |
| `SyntheticOutputTool` | 结构化输出生成 |

### 2. 命令系统（`src/commands/`）

用户通过 `/` 前缀调用的斜杠命令。

| 命令 | 说明 |
|---|---|
| `/commit` | 创建 git 提交 |
| `/review` | 代码审查 |
| `/compact` | 上下文压缩 |
| `/mcp` | MCP 服务器管理 |
| `/config` | 设置管理 |
| `/doctor` | 环境诊断 |
| `/login` / `/logout` | 身份验证 |
| `/memory` | 持久化内存管理 |
| `/skills` | 技能管理 |
| `/tasks` | 任务管理 |
| `/vim` | Vim 模式切换 |
| `/diff` | 查看变更 |
| `/cost` | 查看使用费用 |
| `/theme` | 修改主题 |
| `/context` | 上下文可视化 |
| `/pr_comments` | 查看 PR 评论 |
| `/resume` | 恢复上一会话 |
| `/share` | 分享会话 |
| `/desktop` | 切换到桌面应用 |
| `/mobile` | 切换到移动应用 |

### 3. 服务层（`src/services/`）

| 服务 | 说明 |
|---|---|
| `api/` | Anthropic API 客户端、文件 API、引导程序 |
| `mcp/` | 模型上下文协议服务器连接与管理 |
| `oauth/` | OAuth 2.0 认证流程 |
| `lsp/` | 语言服务器协议管理器 |
| `analytics/` | 基于 GrowthBook 的功能标志与分析 |
| `plugins/` | 插件加载器 |
| `compact/` | 对话上下文压缩 |
| `policyLimits/` | 组织策略限制 |
| `remoteManagedSettings/` | 远程托管设置 |
| `extractMemories/` | 自动记忆提取 |
| `tokenEstimation.ts` | Token 数量估算 |
| `teamMemorySync/` | 团队记忆同步 |

### 4. 桥接系统（`src/bridge/`）

连接 IDE 扩展（VS Code、JetBrains）与 Claude Code CLI 的双向通信层。

- `bridgeMain.ts` — 桥接主循环
- `bridgeMessaging.ts` — 消息协议
- `bridgePermissionCallbacks.ts` — 权限回调
- `replBridge.ts` — REPL 会话桥接
- `jwtUtils.ts` — 基于 JWT 的身份验证
- `sessionRunner.ts` — 会话执行管理

### 5. 权限系统（`src/hooks/toolPermission/`）

在每次工具调用时检查权限。根据配置的权限模式（`default`、`plan`、`bypassPermissions`、`auto` 等），提示用户批准/拒绝或自动解析。

### 6. 功能标志

通过 Bun 的 `bun:bundle` 功能标志实现死代码消除：

```typescript
import { feature } from 'bun:bundle'

// 非活跃代码在构建时被完全剥离
const voiceCommand = feature('VOICE_MODE')
  ? require('./commands/voice/index.js').default
  : null
```

主要标志：`PROACTIVE`、`KAIROS`、`BRIDGE_MODE`、`DAEMON`、`VOICE_MODE`、`AGENT_TRIGGERS`、`MONITOR_TOOL`

---

## 关键文件详解

### `QueryEngine.ts`（约 46K 行）

LLM API 调用的核心引擎，负责处理流式响应、工具调用循环、思考模式、重试逻辑和 Token 计数。

### `Tool.ts`（约 29K 行）

定义所有工具的基础类型和接口，包括输入模式、权限模型和进度状态类型。

### `commands.ts`（约 25K 行）

管理所有斜杠命令的注册与执行，使用条件导入在不同环境中加载不同命令集。

### `main.tsx`

基于 Commander.js 的 CLI 解析器和 React/Ink 渲染器初始化。启动时并行进行 MDM 设置、钥匙串预取和 GrowthBook 初始化，以加快启动速度。

---

## 技术栈

| 类别 | 技术 |
|---|---|
| 运行时 | [Bun](https://bun.sh) |
| 语言 | TypeScript（严格模式） |
| 终端 UI | [React](https://react.dev) + [Ink](https://github.com/vadimdemedes/ink) |
| CLI 解析 | [Commander.js](https://github.com/tj/commander.js)（extra-typings） |
| 模式验证 | [Zod v4](https://zod.dev) |
| 代码搜索 | [ripgrep](https://github.com/BurntSushi/ripgrep) |
| 协议 | [MCP SDK](https://modelcontextprotocol.io)、LSP |
| API | [Anthropic SDK](https://docs.anthropic.com) |
| 遥测 | OpenTelemetry + gRPC |
| 功能标志 | GrowthBook |
| 身份验证 | OAuth 2.0、JWT、macOS 钥匙串 |

---

## 值得关注的设计模式

### 并行预取

通过在大型模块评估之前并行预取 MDM 设置、钥匙串读取和 API 预连接来优化启动时间。

```typescript
// main.tsx — 在其他导入之前作为副作用触发
startMdmRawRead()
startKeychainPrefetch()
```

### 懒加载

重型模块（OpenTelemetry、gRPC、分析模块及部分功能门控子系统）通过动态 `import()` 延迟加载，直到实际需要时才载入。

### 智能体群组

子智能体通过 `AgentTool` 生成，`coordinator/` 负责多智能体编排。`TeamCreateTool` 支持团队级并行工作。

### 技能系统

在 `skills/` 中定义的可复用工作流通过 `SkillTool` 执行，用户可添加自定义技能。

### 插件架构

内置及第三方插件通过 `plugins/` 子系统加载。

---

## 研究声明 / 所有权声明

- 其存在目的是研究源码暴露、打包失误及现代智能体 CLI 系统的架构。
- 原始 Claude Code 源代码的所有权归 **Anthropic** 所有。
- 本仓库**与 Anthropic 无关，未获 Anthropic 背书，亦不由 Anthropic 维护**。
