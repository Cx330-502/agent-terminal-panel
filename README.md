# Agent Terminal Panel

在可移动的 VS Code `WebviewView` 中运行和管理多个交互式 Agent CLI 会话。视图默认位于 Secondary Side Bar，可直接拖到左侧栏、右侧栏或底部 Panel。PTY 始终运行在 workspace extension host，因此适用于本地工作区、WSL 和 Remote SSH。

扩展不依赖某个固定 Agent 产品，也没有默认绑定 Codex。首次新建会话时输入完整启动命令，之后也可以通过视图标题栏齿轮或命令面板中的 `Agent Terminal Panel: 配置启动命令` 随时修改。

启动命令由 workspace host 的系统 shell 执行，因此可以包含参数、引号、环境变量前缀或脚本路径，例如 `codex --model ...`、`claude`、`gemini`、`aider`，以及自建 Agent CLI。

## 功能

- 多会话：新建、切换、双击或 `F2` 重命名、关闭、重启。
- 完整启动命令可配置；新建或重启会话时读取最新配置。
- 可用一次性自定义命令创建会话，不修改默认启动命令，并在创建时直接命名。
- 可扫描当前 workspace 下的 Codex 与 Claude Code 本地历史记录，并以原生 Resume 或 Fork 方式启动。
- 历史会话按真实 cwd 严格过滤；provider 通过独立适配器注册，未验证的 CLI 不会套用猜测参数。
- 每个会话独立选择 cwd；普通新建默认使用当前编辑器所在 workspace folder。
- 会话列表可放在终端左侧或右侧，支持鼠标拖拽和键盘调整宽度，并持久化宽度。
- 设置按钮直接打开完整的 VS Code 扩展设置页。
- 切换视图或隐藏 Panel 后 PTY 继续在后台运行；Webview 重建时回放近期终端内容。
- xterm.js + node-pty，支持 resize、Bracketed Paste、中文 IME、真彩色和 OSC 10/11/12。
- 支持直接粘贴剪贴板图片，或把本机/远端图片拖到终端；图片保存到 workspace host 的扩展存储后，将安全转义的绝对路径插入当前输入区。
- 字体、字号、字重、行高、字距、光标、滚动和颜色均跟随 VS Code 原生终端设置及主题。
- 通用 Agent 状态：运行中、等待输入、等待审批、已完成；保留常见 Codex CLI 屏幕的兼容检测。
- 后台状态提供会话红点、原生 Toast、视图 badge 和可配置完成声音。
- 完成通知按“视图可见、当前会话、VS Code 聚焦”去重；当前可见会话不会产生干扰性提示。

## 平台包

`npm run package` 生成四个按真实原生架构打包的 VSIX：

| VSIX | 使用场景 |
| --- | --- |
| `agent-terminal-panel-0.4.0-linux-x64.vsix` | Linux x64、x64 WSL/SSH workspace host |
| `agent-terminal-panel-0.4.0-linux-arm64.vsix` | Linux ARM64、ARM64 SSH workspace host |
| `agent-terminal-panel-0.4.0-darwin-x64.vsix` | Intel Mac |
| `agent-terminal-panel-0.4.0-darwin-arm64.vsix` | Apple Silicon Mac |

在 WSL/SSH 窗口中应将对应 Linux VSIX 安装到远程端。扩展声明了 `extensionKind: ["workspace"]`，不会把远程会话误启动在本地 UI host。

## 使用

- 点击视图标题栏的 `+` 使用默认 cwd 新建会话。
- 点击终端新建按钮，输入一次性命令和会话名，不会修改默认启动命令。
- 点击历史按钮或运行 `Agent Terminal Panel: 从 Agent 历史会话启动`，选择当前 workspace 的 Codex/Claude Code 会话，再选择 Resume 或 Fork。
- 点击文件夹按钮选择 workspace folder、Home 或任意目录后新建。
- 点击视图标题栏的齿轮打开完整设置页；默认命令未配置时，首次新建会话会自动提示。
- 双击会话名称、双击顶部当前名称、点击铅笔或聚焦后按 `F2` 重命名。
- 聚焦终端后直接粘贴剪贴板图片，或把最多 8 张图片拖进终端区域；扩展只插入路径，不会自动提交输入。
- 拖动会话列表右侧分隔条调整宽度；分隔条聚焦时也可按左右方向键。
- 右键视图标题并选择 Move View，或直接拖动视图标题，可放到任一侧栏或 Panel。

快捷键只在该视图聚焦时生效：

| 操作 | Windows/Linux | macOS |
| --- | --- | --- |
| 新建会话 | `Ctrl+Shift+\`` | `Cmd+Shift+\`` |
| 下一会话 | `Ctrl+PageDown` | `Cmd+Alt+Right` |
| 上一会话 | `Ctrl+PageUp` | `Cmd+Alt+Left` |
| 关闭会话 | `Ctrl+W` | `Cmd+W` |

## 设置

| 设置 | 默认值 | 说明 |
| --- | --- | --- |
| `agentTerminalPanel.launchCommand` | 空 | workspace host 系统 shell 中执行的完整启动命令 |
| `agentTerminalPanel.environment` | `{}` | 会话附加环境变量 |
| `agentTerminalPanel.sessionListPosition` | `left` | 会话列表放在终端左侧或右侧 |
| `agentTerminalPanel.startSessionOnOpen` | `true` | 首次打开时自动创建会话 |
| `agentTerminalPanel.sessionHistory.maxResults` | `100` | 历史会话选择器的最大结果数 |
| `agentTerminalPanel.sessionHistory.codexCommand` | `codex` | Codex Resume/Fork 命令前缀 |
| `agentTerminalPanel.sessionHistory.claudeCommand` | `claude` | Claude Code Resume/Fork 命令前缀 |
| `agentTerminalPanel.notifications.showToast` | `true` | 后台审批、等待输入、完成 Toast |
| `agentTerminalPanel.notifications.completionSound` | `whenHidden` | `never`、`whenHidden` 或 `always` |

终端显示直接读取 `terminal.integrated.*` 设置以及 `terminal.*` 主题颜色，不维护第二套字体或配色配置。

图片粘贴与拖放单张上限为 25 MB、单次总量上限为 50 MB。图片放在当前 workspace 对应的 VS Code 扩展存储中，因此在 WSL/Remote SSH 窗口里会保存到远端 workspace host，而不是本地 UI 机器；不会在项目目录生成未跟踪文件。

## 开发与验证

```bash
npm install
npm run check
npm test
npm run build
npm run package
```

单元及集成测试覆盖状态机、通知可见性、Bracketed Paste、中文 PTY 输入、resize、可配置 CLI 启动、图片路径转义，以及 Codex/Claude Code JSONL 历史发现与 workspace 边界过滤。`test/browser-harness.html` 用真实 Chromium/xterm 检查 OSC 10/11/12、IME、文本/图片粘贴、图片拖放、窄/宽布局及带灰色输入区的 Codex CLI 兼容显示。

## 项目

- GitHub：[Cx330-502/agent-terminal-panel](https://github.com/Cx330-502/agent-terminal-panel)
- Issues：[问题与建议](https://github.com/Cx330-502/agent-terminal-panel/issues)
- License：MIT
- Roadmap：[TODO.md](./TODO.md)
