# cc-code Source Snapshot for Security Research

> This repository mirrors a **publicly exposed Claude Code source snapshot** that became accessible on **March 31, 2026** through a source map exposure in the npm distribution. It is maintained for **educational, defensive security research, and software supply-chain analysis**.

---

## Disclaimer

This project is **for learning and research purposes only, not for commercial use**.

The newer versions of Claude Code have repeatedly been associated with concerning allegations — from injecting whitespace to reduce prompt cache hit rates and increase user costs, to suspected steganography, to detecting whether users are Asian or Chinese for differential treatment. Through defensive security auditing of the leaked source, this project aims to:

- Bring transparency to these issues for the community
- Provide a codebase that can be independently audited, modified, and studied
- Make improvements on the original to offer a more transparent and controllable experience

**The original Claude Code source remains the property of Anthropic. This project is not affiliated with, endorsed by, or maintained by Anthropic.**

---

## Security Audit Results

We conducted a thorough investigation of the source code against three major community concerns (see [SECURITY_AUDIT.md](./SECURITY_AUDIT.md) for full details):

### 1. Whitespace Injection to Reduce Cache Hits — **NOT FOUND**

No code injects spaces, zero-width characters, or random padding to reduce cache hit rates. On the contrary, the codebase actively **preserves** cache hits with 20+ comments explaining how to avoid cache busts — memoizing date strings, pinning tool schema positions, denying tools via callback instead of `tools:[]`.

### 2. Detecting Chinese Users / Geographic Keywords — **NOT FOUND**

No GeoIP, no country detection, no behavior differentiation based on location. All keyword hits (`shanghai`, `beijing`, `asian`) resolve to benign purposes: CJK character width calculation, user-selected language mappings, AWS key regex patterns. Timezone is used only for time formatting and cron scheduling.

### 3. Steganography / Hidden Channels — **NOT FOUND**

No steganography, no hidden HTTP headers, no data encoded in innocent fields. Base64 fields are proto serialization format, not covert channels.

### 4. Telemetry & Data Reporting — **EXISTS, Can Be Disabled**

Datadog log shipping, first-party event reporting (api.anthropic.com), GrowthBook feature flags, and BigQuery metrics are present. Data sent includes device UUID, email, account info, machine fingerprint. All channels are gated by `CLAUDE_CODE_DISABLE_TELEMETRY=1`.

### 5. Backdoors / Privilege Escalation — **NOT FOUND**

All override switches (e.g., `CLAUDE_INTERNAL_FC_OVERRIDES`) are gated to `USER_TYPE === 'ant'` (Anthropic-internal builds only), unreachable in external builds.

---

## cc-code Improvements

On top of the original source, this project makes the following improvements:

### Independent Config Directory

The original uses `~/.claude` and `~/.claude.json`; cc-code uses isolated `~/.cc-code` and `~/.cc-code.json`, fully separated from the original:

| Item | Original | cc-code |
|------|----------|---------|
| Config directory | `~/.claude/` | `~/.cc-code/` |
| Global state file | `~/.claude.json` | `~/.cc-code.json` |
| Env var override | `CLAUDE_CONFIG_DIR` | `CC_CODE_CONFIG_DIR` (falls back to `CLAUDE_CONFIG_DIR`) |

All subdirectories (`settings.json`, `backups/`, `teams/`, `CLAUDE.md`, etc.) automatically follow the new path. The directory is auto-created on first run. Edit `~/.cc-code/settings.json` freely to customize models.

### Brand Differentiation

| Item | Original | cc-code |
|------|----------|---------|
| Startup brand name | `Claude Code` | `cc-code` |
| Mascot color | Coral orange `rgb(215,119,87)` | Light blue `rgb(89,166,235)` |
| Version output | `1.0.0-snapshot (Claude Code)` | `1.0.0-snapshot (cc-code)` |

The mascot design remains the original Clawd, differentiated by color (light blue vs coral orange).

### Build Fix

Fixed the `color-diff-napi` module resolution issue: the node_modules stub exports empty objects instead of real classes, causing diff rendering to crash. Added a module mapping in `bun-plugin.ts` pointing to the pure TypeScript implementation at `src/native-ts/color-diff/index.ts`.

### Build & Install

```bash
# Build
bun build src/entrypoints/cli.tsx --compile --outfile=cc-code --target=bun --plugin bun-plugin.ts

# Install (choose one)
cp cc-code ~/bin/cc-code        # User-level
sudo cp cc-code /usr/local/bin/ # System-level
```

### Disable Telemetry

```bash
export CLAUDE_CODE_DISABLE_TELEMETRY=1
```

---

## How the Public Snapshot Became Accessible

[Chaofan Shou (@Fried_rice)](https://x.com/Fried_rice) publicly noted that Claude Code source material was reachable through a `.map` file exposed in the npm package:

> **"Claude code source code has been leaked via a map file in their npm registry!"**
>
> — [@Fried_rice, March 31, 2026](https://x.com/Fried_rice/status/2038894956459290963)

The published source map referenced unobfuscated TypeScript sources hosted in Anthropic's R2 storage bucket, which made the `src/` snapshot publicly downloadable.

---

## Repository Scope

Claude Code is Anthropic's CLI for interacting with Claude from the terminal to perform software engineering tasks such as editing files, running commands, searching codebases, and coordinating workflows.

This repository contains a mirrored `src/` snapshot for research and analysis.

- **Public exposure identified on**: 2026-03-31
- **Language**: TypeScript
- **Runtime**: Bun
- **Terminal UI**: React + [Ink](https://github.com/vadimdemedes/ink)
- **Scale**: ~1,900 files, 512,000+ lines of code

---

## Directory Structure

```text
src/
├── main.tsx                 # Entrypoint orchestration (Commander.js-based CLI path)
├── commands.ts              # Command registry
├── tools.ts                 # Tool registry
├── Tool.ts                  # Tool type definitions
├── QueryEngine.ts           # LLM query engine
├── context.ts               # System/user context collection
├── cost-tracker.ts          # Token cost tracking
│
├── commands/                # Slash command implementations (~50)
├── tools/                   # Agent tool implementations (~40)
├── components/              # Ink UI components (~140)
├── hooks/                   # React hooks
├── services/                # External service integrations
├── screens/                 # Full-screen UIs (Doctor, REPL, Resume)
├── types/                   # TypeScript type definitions
├── utils/                   # Utility functions
│
├── bridge/                  # IDE and remote-control bridge
├── coordinator/             # Multi-agent coordinator
├── plugins/                 # Plugin system
├── skills/                  # Skill system
├── keybindings/             # Keybinding configuration
├── vim/                     # Vim mode
├── voice/                   # Voice input
├── remote/                  # Remote sessions
├── server/                  # Server mode
├── memdir/                  # Persistent memory directory
├── tasks/                   # Task management
├── state/                   # State management
├── migrations/              # Config migrations
├── schemas/                 # Config schemas (Zod)
├── entrypoints/             # Initialization logic
├── ink/                     # Ink renderer wrapper
├── buddy/                   # Companion sprite
├── native-ts/               # Native TypeScript utilities
├── outputStyles/            # Output styling
├── query/                   # Query pipeline
└── upstreamproxy/           # Proxy configuration
```

---

## Architecture Summary

### 1. Tool System (`src/tools/`)

Every tool Claude Code can invoke is implemented as a self-contained module. Each tool defines its input schema, permission model, and execution logic.

| Tool | Description |
|---|---|
| `BashTool` | Shell command execution |
| `FileReadTool` | File reading (images, PDFs, notebooks) |
| `FileWriteTool` | File creation / overwrite |
| `FileEditTool` | Partial file modification (string replacement) |
| `GlobTool` | File pattern matching search |
| `GrepTool` | ripgrep-based content search |
| `WebFetchTool` | Fetch URL content |
| `WebSearchTool` | Web search |
| `AgentTool` | Sub-agent spawning |
| `SkillTool` | Skill execution |
| `MCPTool` | MCP server tool invocation |
| `LSPTool` | Language Server Protocol integration |
| `NotebookEditTool` | Jupyter notebook editing |
| `TaskCreateTool` / `TaskUpdateTool` | Task creation and management |
| `SendMessageTool` | Inter-agent messaging |
| `TeamCreateTool` / `TeamDeleteTool` | Team agent management |
| `EnterPlanModeTool` / `ExitPlanModeTool` | Plan mode toggle |
| `EnterWorktreeTool` / `ExitWorktreeTool` | Git worktree isolation |
| `ToolSearchTool` | Deferred tool discovery |
| `CronCreateTool` | Scheduled trigger creation |
| `RemoteTriggerTool` | Remote trigger |
| `SleepTool` | Proactive mode wait |
| `SyntheticOutputTool` | Structured output generation |

### 2. Command System (`src/commands/`)

User-facing slash commands invoked with `/` prefix.

| Command | Description |
|---|---|
| `/commit` | Create a git commit |
| `/review` | Code review |
| `/compact` | Context compression |
| `/mcp` | MCP server management |
| `/config` | Settings management |
| `/doctor` | Environment diagnostics |
| `/login` / `/logout` | Authentication |
| `/memory` | Persistent memory management |
| `/skills` | Skill management |
| `/tasks` | Task management |
| `/vim` | Vim mode toggle |
| `/diff` | View changes |
| `/cost` | Check usage cost |
| `/theme` | Change theme |
| `/context` | Context visualization |
| `/pr_comments` | View PR comments |
| `/resume` | Restore previous session |
| `/share` | Share session |
| `/desktop` | Desktop app handoff |
| `/mobile` | Mobile app handoff |

### 3. Service Layer (`src/services/`)

| Service | Description |
|---|---|
| `api/` | Anthropic API client, file API, bootstrap |
| `mcp/` | Model Context Protocol server connection and management |
| `oauth/` | OAuth 2.0 authentication flow |
| `lsp/` | Language Server Protocol manager |
| `analytics/` | GrowthBook-based feature flags and analytics |
| `plugins/` | Plugin loader |
| `compact/` | Conversation context compression |
| `policyLimits/` | Organization policy limits |
| `remoteManagedSettings/` | Remote managed settings |
| `extractMemories/` | Automatic memory extraction |
| `tokenEstimation.ts` | Token count estimation |
| `teamMemorySync/` | Team memory synchronization |

### 4. Bridge System (`src/bridge/`)

A bidirectional communication layer connecting IDE extensions (VS Code, JetBrains) with the Claude Code CLI.

- `bridgeMain.ts` — Bridge main loop
- `bridgeMessaging.ts` — Message protocol
- `bridgePermissionCallbacks.ts` — Permission callbacks
- `replBridge.ts` — REPL session bridge
- `jwtUtils.ts` — JWT-based authentication
- `sessionRunner.ts` — Session execution management

### 5. Permission System (`src/hooks/toolPermission/`)

Checks permissions on every tool invocation. Either prompts the user for approval/denial or automatically resolves based on the configured permission mode (`default`, `plan`, `bypassPermissions`, `auto`, etc.).

### 6. Feature Flags

Dead code elimination via Bun's `bun:bundle` feature flags:

```typescript
import { feature } from 'bun:bundle'

// Inactive code is completely stripped at build time
const voiceCommand = feature('VOICE_MODE')
  ? require('./commands/voice/index.js').default
  : null
```

Notable flags: `PROACTIVE`, `KAIROS`, `BRIDGE_MODE`, `DAEMON`, `VOICE_MODE`, `AGENT_TRIGGERS`, `MONITOR_TOOL`

---

## Key Files in Detail

### `QueryEngine.ts` (~46K lines)

The core engine for LLM API calls. Handles streaming responses, tool-call loops, thinking mode, retry logic, and token counting.

### `Tool.ts` (~29K lines)

Defines base types and interfaces for all tools — input schemas, permission models, and progress state types.

### `commands.ts` (~25K lines)

Manages registration and execution of all slash commands. Uses conditional imports to load different command sets per environment.

### `main.tsx`

Commander.js-based CLI parser and React/Ink renderer initialization. At startup, it overlaps MDM settings, keychain prefetch, and GrowthBook initialization for faster boot.

---

## Tech Stack

| Category | Technology |
|---|---|
| Runtime | [Bun](https://bun.sh) |
| Language | TypeScript (strict) |
| Terminal UI | [React](https://react.dev) + [Ink](https://github.com/vadimdemedes/ink) |
| CLI Parsing | [Commander.js](https://github.com/tj/commander.js) (extra-typings) |
| Schema Validation | [Zod v4](https://zod.dev) |
| Code Search | [ripgrep](https://github.com/BurntSushi/ripgrep) |
| Protocols | [MCP SDK](https://modelcontextprotocol.io), LSP |
| API | [Anthropic SDK](https://docs.anthropic.com) |
| Telemetry | OpenTelemetry + gRPC |
| Feature Flags | GrowthBook |
| Auth | OAuth 2.0, JWT, macOS Keychain |

---

## Notable Design Patterns

### Parallel Prefetch

Startup time is optimized by prefetching MDM settings, keychain reads, and API preconnect in parallel before heavy module evaluation begins.

```typescript
// main.tsx — fired as side-effects before other imports
startMdmRawRead()
startKeychainPrefetch()
```

### Lazy Loading

Heavy modules (OpenTelemetry, gRPC, analytics, and some feature-gated subsystems) are deferred via dynamic `import()` until actually needed.

### Agent Swarms

Sub-agents are spawned via `AgentTool`, with `coordinator/` handling multi-agent orchestration. `TeamCreateTool` enables team-level parallel work.

### Skill System

Reusable workflows defined in `skills/` are executed through `SkillTool`. Users can add custom skills.

### Plugin Architecture

Built-in and third-party plugins are loaded through the `plugins/` subsystem.

---

## Research / Ownership Disclaimer

- It exists to study source exposure, packaging failures, and the architecture of modern agentic CLI systems.
- The original Claude Code source remains the property of **Anthropic**.
- This repository is **not affiliated with, endorsed by, or maintained by Anthropic**.
