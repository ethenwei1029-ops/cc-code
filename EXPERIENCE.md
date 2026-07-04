# Claude Code 源码编译实战经验总结

> 项目：将 Claude Code 源码泄露快照编译为可执行二进制 (`cc-code`)
> 日期：2026-07-01 ~ 2026-07-02
> 环境：macOS arm64, Bun 1.3.14

---

## 一、项目背景

Claude Code 是 Anthropic 的 CLI 工具，源码通过 npm 包的 `.map` 文件泄露。
仓库初始只有 **18 个根级 .ts/.tsx 文件**（约 12,000 行），后补充完整源码到 **1,884 个文件**（约 512,000 行），位于 `src/` 目录下。

技术栈：TypeScript + Bun + React/Ink (自研终端 UI) + Commander.js

---

## 二、犯错记录与教训

### 错误 1：Stub 脚本覆盖了真实源码 ⚠️⚠️⚠️

**现象**：运行 `fix-stubs2.mjs` 脚本后，`Tool.ts`（792行真实代码）被覆盖成 34 行的 Proxy stub，`query.ts`（1729行）被覆盖成 28 行。

**根因**：脚本的过滤条件是 `content.includes('Auto-generated stub') || content.includes('Stub module')`。但真实文件中恰好包含类似关键词的注释，被误判为 stub 文件并覆盖。

**修复**：`git checkout HEAD -- <文件>` 恢复，并改用 `git ls-files` 来区分真实文件和生成文件。

**教训**：
- **任何批量修改脚本必须先做 dry-run**，打印将要修改的文件列表，确认无误后再执行
- 过滤条件要用**白名单**（git 追踪的文件列表），不要用黑名单（关键词匹配）
- 脚本应该 `continue` 跳过已存在文件，而不是追加/覆盖

```javascript
// ❌ 错误：用关键词匹配判断是否是 stub
if (content.includes('Auto-generated stub')) { ... }

// ✅ 正确：用 git 追踪列表判断
const gitFiles = new Set(execSync('git ls-files "*.ts" "*.tsx"').toString().split('\n'));
if (gitFiles.has(filePath)) continue; // 永远不碰真实文件
```

---

### 错误 2：MACRO.VERSION 的 define 在 --compile 模式下不生效

**现象**：编译后的二进制运行时报 `ReferenceError: MACRO is not defined`。在 Bun 插件中用了 `build.define('MACRO.VERSION', '"1.0.0-snapshot"')`，但编译产物中 `MACRO.VERSION` 原封不动。

**根因**：Bun 的 `--compile` 模式下，插件的 `define` 不生效。`--preload` 也不生效（代码顺序问题：import 被 hoist 到 `globalThis.MACRO = ...` 之前执行）。

**修复**：直接在源码中用 `sed` 替换所有 `MACRO.*` 引用为字面量。

```bash
# MACRO.VERSION → "1.0.0-snapshot"
# MACRO.PACKAGE_URL → "@anthropic-ai/claude-code"
# MACRO.FEEDBACK_CHANNEL → "#help-claude-code"
# MACRO.BUILD_TIME → Date.now()
find src -name "*.ts" -o -name "*.tsx" | xargs sed -i '' \
  -e 's/MACRO\.VERSION/"1.0.0-snapshot"/g' \
  -e 's/MACRO\.PACKAGE_URL/"@anthropic-ai\/claude-code"/g'
```

**教训**：
- `--compile` 模式的行为和普通 `--build` 不同，define/preload/plugin 的生效范围有差异
- 遇到 define 不生效时，直接源码替换是最可靠的方式
- **注意 sed 的贪婪匹配**：`MACRO.VERSION` 会误匹配 `MACRO.VERSION_CHANGELOG`，需要先处理长名称

---

### 错误 3：react-reconciler 的 CJS→ESM 命名导出问题

**现象**：报错 `Export named 'NoEventPriority' not found in module 'react-reconciler/constants.js'`。但 `require('react-reconciler/constants.js')` 确实有这个导出。

**根因**：`react-reconciler/constants.js` 是 CJS 文件，内容为 `module.exports = require('./cjs/...')`。Bun 的 ESM 导入无法从这种间接 CJS 中静态分析命名导出。

**修复**：创建 ESM 包装器 `constants.mjs`，手动 re-export 每个命名导出，并更新 `package.json` 的 `exports` 字段：

```javascript
// node_modules/react-reconciler/constants.mjs
import c from './cjs/react-reconciler-constants.production.js';
export const ConcurrentRoot = c.ConcurrentRoot;
export const NoEventPriority = c.NoEventPriority;
// ... 其他导出
```

```json
// package.json exports
{
  ".": "./index.js",
  "./constants.js": "./constants.mjs",
  "./constants": "./constants.mjs"
}
```

**教训**：
- Bun 对 CJS 的 ESM 互操作有局限：能处理 `module.exports = value`（默认导出），但不能处理 `module.exports = require(...)`（间接导出）
- 遇到 `Export named X not found` 但 CJS 中确实有该导出时，创建 ESM 包装器
- 修改 `exports` 字段时**必须包含 `"."` 入口**，否则主包导入会断

---

### 错误 4：React 18 缺少 useEffectEvent

**现象**：报错 `Export named 'useEffectEvent' not found in module 'react/index.js'`。同样是 CJS/ESM 问题，但根因是版本不匹配。

**根因**：源码使用了 `useEffectEvent`（React 19 的 API），但 package.json 声明了 `react: ^18.3.0`。

**修复**：`bun add react@^19.0.0`

**教训**：
- 遇到 `Export named X not found` 时，先检查是不是版本不匹配，再检查 CJS/ESM 问题
- 源码泄露的时间点（2026-03-31）对应的是较新的依赖版本，不要用旧版本

---

### 错误 5：Commander.js 版本冲突

**现象**：`new Command().configureHelp is not a function`。

**根因**：`@commander-js/extra-typings@13.1.0` 依赖 `commander@~13.1.0`，但 Bun 实际安装了 `commander@2.20.3`（被其他包的 peer dependency 覆盖）。

**修复**：显式安装正确版本：`bun add commander@~13.1.0`

**教训**：
- Bun 的依赖解析可能被 peer dependency 污染，导致安装错误的版本
- 遇到 "method not found" 时，用 `node -e "const c = require('pkg'); console.log(typeof c.method)"` 验证实际安装的版本
- 对关键依赖，显式在 package.json 中声明版本

---

### 错误 6：CI=1 环境变量导致认证失败

**现象**：运行 `cc-code` 报错 `ANTHROPIC_API_KEY or CLAUDE_CODE_OAUTH_TOKEN env var is required`。用户配置了 `ANTHROPIC_AUTH_TOKEN`（在 `~/.claude/settings.json` 的 env 中），但代码不认。

**根因**：代码中 `getAnthropicApiKeyWithSource()` 有两条路径：
- **CI 路径**（`isEnvTruthy(process.env.CI)`）：只检查 `ANTHROPIC_API_KEY` 和 `CLAUDE_CODE_OAUTH_TOKEN`，不检查 `ANTHROPIC_AUTH_TOKEN`，找不到就 **throw**
- **正常路径**：会检查 `ANTHROPIC_AUTH_TOKEN`、keychain 等多种来源

开发环境（ZCode agent）设置了 `CI=1`，导致走了 CI 路径。

**修复**：`unset CI` 或 `alias cc-code="CI= cc-code"`

**教训**：
- 环境变量可能隐式影响程序行为，排查 "明明配置了却不生效" 的问题时，先 `env | grep -iE "CI|NODE_ENV|TEST"` 检查
- 代码中的环境检测分支（CI/test/dev）可能有完全不同的逻辑路径
- 用户报 "卡住" 时，要区分是真卡住（hang）还是报错退出（crash），两者根因完全不同

---

### 错误 7：-d2e 无效短 flag

**现象**：`error: option creation failed due to '-d2e' in option flags '-d2e, --debug-to-stderr'`

**根因**：源码中 `new Option('-d2e, --debug-to-stderr', ...)` 使用了多字符短 flag，Commander.js 只支持单字符短 flag。这可能是 Anthropic 内部使用自定义 Commander.js 分支。

**修复**：`sed -i '' "s/new Option('-d2e, --debug-to-stderr'/new Option('--debug-to-stderr'/"`

**教训**：Anthropic 内部可能使用定制的 npm 包（自定义 Commander.js 分支、bun:bundle feature flags），公开版需要适配。

---

### 错误 8：node_modules 被重装后 shim 全部丢失

**现象**：运行 `bun add react@19` 后，之前在 `node_modules/` 中手动创建的所有 shim 包（@ant/*、@anthropic-ai/sandbox-runtime 等）全部消失。

**根因**：`bun add` 会重新解析依赖并重建 `node_modules`，手动创建的文件不持久。

**修复**：每次 `bun install/add` 后重新创建 shim。最终写了一个重建脚本。

**教训**：
- 不要在 `node_modules/` 中手动创建文件 — 它们会在每次 install 后丢失
- 更好的做法是使用 `patch-package` 或 Bun 插件的 `onResolve`/`onLoad` 来注入 shim
- 如果必须用 `node_modules` shim，写一个 `postinstall` 脚本

---

### 错误 9：SandboxManager shim 缺少静态方法

**现象**：`SandboxManager.isSupportedPlatform is not a function`

**根因**：创建 `@anthropic-ai/sandbox-runtime` shim 时，只添加了当时编译报错的方法，没有覆盖所有被调用的方法。

**修复**：逐步补全静态方法：`isSupportedPlatform`、`initialize` 等。

**教训**：
- Stub 类需要实现所有被调用的方法（包括静态方法），否则运行时报错
- 编译通过 ≠ 运行通过，stub 要在运行时逐步暴露缺失的方法
- 用 Proxy 模式可以避免这个问题，但对需要返回具体值的场景（如 `isSupportedPlatform` 应返回 `false`）不适用

---

## 三、关键技术方案

### 3.1 Bun 插件处理内部包

```typescript
// bun-plugin.ts
export default {
  name: 'shims',
  setup(build) {
    // bun:bundle → 所有 feature flag 返回 false
    build.onResolve({ filter: /^bun:bundle$/ }, () => ({
      path: './shims/bun-bundle.ts',
    }));
    // @ant/* 内部包 → 本地 shim
    build.onResolve({ filter: /^@ant\/computer-use-mcp$/ }, () => ({
      path: './shims/@ant/computer-use-mcp.ts',
    }));
  },
};
```

### 3.2 自动修复脚本

```javascript
// auto-fix.mjs — 迭代式修复
while (iterations < 20) {
  const { success, output } = runBuild();
  if (success) break;
  const errors = parseErrors(output); // 解析 "Could not resolve" 错误
  for (const err of errors) fixError(err); // 自动创建 stub 或安装包
}
```

### 3.3 调试卡住问题

```typescript
// debug-start.ts — 逐步加日志定位卡点
console.error('[DEBUG] 1. start');
try { /* step 1 */ } catch(e) { console.error('[DEBUG] FAIL:', e.message); }
// ...每一步都 try-catch + 日志
```

---

## 四、构建流程总结

```bash
# 1. 安装依赖
bun install

# 2. 创建 node_modules shim（每次 install 后需重建）
bun run recreate-shims.mjs

# 3. 编译
bun build src/entrypoints/cli.tsx \
  --compile \
  --outfile=cc-code \
  --target=bun \
  --plugin=./bun-plugin.ts

# 4. 安装
cp cc-code ~/bin/cc-code
```

### 依赖版本关键配置

| 包 | 正确版本 | 原因 |
|---|---|---|
| `react` | ^19.0.0 | 源码使用 `useEffectEvent` |
| `react-reconciler` | 0.33.0 | 需要 `NoEventPriority` 导出 |
| `commander` | ~13.1.0 | `configureHelp` 方法 |
| `@opentelemetry/resources` | ^2.0.0 | `resourceFromAttributes` 导出 |

---

## 五、源码缺失清单

以下文件在源码泄露时缺失，需手动创建 stub：

| 文件 | 类型 | 被引用位置 |
|---|---|---|
| `src/utils/protectedNamespace.ts` | 内部模块 | `envUtils.ts` |
| `src/components/agents/SnapshotUpdateDialog.tsx` | UI 组件 | `dialogLaunchers.tsx` |
| `src/assistant/AssistantSessionChooser.tsx` | UI 组件 | `dialogLaunchers.tsx` |
| `src/commands/assistant/assistant.ts` | 命令 | `dialogLaunchers.tsx` |
| `src/tools/TungstenTool/TungstenTool.ts` | 工具 | `tools.ts` |
| `src/tools/REPLTool/REPLTool.ts` | 工具 | `tools.ts` (require) |
| `src/tools/SuggestBackgroundPRTool/` | 工具 | `tools.ts` (require) |
| `src/tools/VerifyPlanExecutionTool/` | 工具 | `tools.ts` (require) |
| `src/tools/PowerShellTool/` | 工具 | `tools.ts` (require) |
| `src/tools/WorkflowTool/constants.ts` | 常量 | `constants/tools.ts` |
| `src/types/connectorText.ts` | 类型 | `utils/messages.ts` |
| `src/services/compact/snipCompact.ts` | 服务 | `utils/attachments.ts` |
| `src/services/compact/cachedMicrocompact.ts` | 服务 | `services/compact/microCompact.ts` |
| `src/ink/devtools.ts` | 调试 | `ink/reconciler.ts` |

以下 npm 包是 Anthropic 内部包，公开 npm 上不存在：

| 包 | 用途 | Shim 策略 |
|---|---|---|
| `@ant/claude-for-chrome-mcp` | Chrome 集成 | 空数组 + 空函数 |
| `@ant/computer-use-mcp` | 计算机使用 | 空函数 |
| `@ant/computer-use-swift` | Swift 原生 | 空类型 |
| `@anthropic-ai/sandbox-runtime` | 沙箱运行时 | 假类 + 静态方法返回 false |
| `@anthropic-ai/bedrock-sdk` | Bedrock SDK | 空默认导出 |
| `@anthropic-ai/foundry-sdk` | Foundry SDK | 空默认导出 |
| `@anthropic-ai/vertex-sdk` | Vertex SDK | 空默认导出 |
| `color-diff-napi` | 原生颜色 diff | 空对象 + 空函数 |
| `modifiers-napi` | 键盘修饰键检测 | 空默认导出 |

---

## 六、核心教训

1. **编译通过 ≠ 运行通过**：Bun 的 `--compile` 能打包所有模块，但运行时才会暴露 stub 缺失的方法、类型不匹配等问题
2. **CJS/ESM 互操作是 Bun 的痛点**：遇到 `Export named X not found` 但 CJS 确实有该导出时，创建 ESM 包装器
3. **`--compile` 模式的限制**：define、preload 在编译模式下可能不生效，直接改源码最可靠
4. **环境变量可能隐式改变行为**：`CI=1` 会触发完全不同的认证路径
5. **批量脚本必须用白名单**：用 `git ls-files` 区分真实文件和生成文件，永远不用关键词匹配
6. **node_modules 中的手动修改不持久**：每次 install 后需要重建
7. **调试 "卡住" 问题的方法**：写逐步日志脚本，每一步 try-catch，定位卡在哪一步
8. **Anthropic 内部有定制工具链**：`bun:bundle` feature flags、多字符短 flag、`@ant/*` 内部包，公开版需要适配
