# Agent Terminal Panel

把任意 Agent CLI 变成一个可移动、可并行、真正运行在 workspace host 上的 VS Code 工作台。

[English](https://github.com/Cx330-502/agent-terminal-panel/blob/main/README.en.md) · [Marketplace](https://marketplace.visualstudio.com/items?itemName=Cx330-502.agent-terminal-panel) · [开发文档](https://github.com/Cx330-502/agent-terminal-panel/blob/main/docs/DEVELOPMENT.md) · [更新记录](./CHANGELOG.md)

<p align="center">
  <img src="media/screenshots/panel.webp" alt="Agent Terminal Panel 宽面板多会话界面" width="100%">
</p>

Agent Terminal Panel 不绑定 Codex、Claude 或任何单一产品。你提供启动命令，它提供完整 PTY、多会话管理、后台运行、状态提醒、历史恢复和图片输入。视图可以放在左侧栏、右侧栏或底部 Panel；在 WSL 和 Remote SSH 中，进程会留在远端 workspace extension host，而不是误跑到本地 UI 机器。

## 为什么值得装

- **一个面板管理所有 Agent**：`codex`、`claude`、`gemini`、`aider`、内部 CLI、代理包装命令或任意交互式 shell 程序都可以使用。
- **不是“看起来像终端”的文本框**：底层使用 xterm.js + node-pty，支持 resize、Bracketed Paste、中文 IME、真彩色、OSC 10/11/12 和 Codex 灰色输入区。
- **会话真正并行**：新建、切换、重命名、关闭、重启；切走视图后 PTY 仍在后台运行，Webview 重建时可回放近期输出。
- **每个会话都有自己的上下文**：可选择 cwd，也可用一次性自定义命令和独立名称启动，不污染默认命令。
- **从旧上下文继续工作**：只扫描当前 workspace 的 Codex / Claude Code 历史记录，并使用 provider 原生 Resume 或 Fork 命令。
- **知道什么时候该回来**：运行中、等待输入、等待审批、已完成四态，会话红点、View Badge、原生 Toast 和去重完成声音协同工作。
- **启动不再只剩空白**：界面区分 PTY 创建与 Agent 首个输出；`输出 > Agent Terminal Panel` 会记录 Webview、spawn 和首字节耗时。
- **图片输入更顺手**：剪贴板图片直接粘贴；系统文件管理器、远端 URI 和可到达 Webview 的 VS Code 数据类型可拖入，保存后只插入安全转义的路径，不自动提交。
- **终端外观原生一致**：字体、字号、字重、行高、字距、光标、滚动和颜色全部读取 VS Code 原生终端设置与主题。
- **可选 Codex Pets / 终端图片**：按需启用 Sixel/iTerm 图片支持，默认关闭以节省多会话内存。

<p align="center">
  <img src="media/screenshots/sidebar.webp" alt="Agent Terminal Panel 窄侧栏界面" width="390">
</p>

## 三分钟开始

1. 从 Marketplace 安装后打开 Activity Bar 中的 Agent Terminal 图标。
2. 点击 `+`，首次使用时输入 workspace host 上可执行的完整启动命令。
3. 示例：`codex`、`claude`、`gemini --model ...`、`cc-switch-cli ...`，或带参数、引号和环境变量前缀的脚本命令。
4. 需要不同命令时点击终端图标，新建一次性自定义命令会话并直接命名。
5. 点击文件夹图标选择 cwd；点击历史图标从当前 workspace 的旧会话 Resume / Fork。

默认命令没有绑定任何 provider，也没有偷偷预设 Codex。启动命令由 workspace host 的系统 shell 执行，新建或重启时读取最新配置。

## 会话与布局

- 双击会话名、双击顶部名称、点击铅笔或按 `F2` 可重命名。
- 拖动会话列表边缘可调整宽度；分隔条聚焦后也可用左右方向键。
- `agentTerminalPanel.sessionListPosition` 可把会话列放在终端左侧或右侧。
- 右键视图标题选择 **Move View**，或直接拖动视图标题，可移动到任一侧栏或 Panel。
- 设置按钮直接打开完整扩展设置页，而不是只编辑启动命令。

快捷键仅在 Agent Terminal 视图聚焦时生效：

| 操作 | Windows / Linux | macOS |
| --- | --- | --- |
| 新建会话 | `Ctrl+Shift+\`` | `Cmd+Shift+\`` |
| 下一会话 | `Ctrl+PageDown` | `Cmd+Alt+Right` |
| 上一会话 | `Ctrl+PageUp` | `Cmd+Alt+Left` |
| 关闭会话 | `Ctrl+W` | `Cmd+W` |

## 图片粘贴与拖放

- 聚焦终端后粘贴剪贴板图片，或从系统文件管理器把最多 8 张图片拖入终端区域。
- 单张上限 25 MB，单次总量上限 50 MB；扩展只插入路径，不会自动发送回车。
- 图片保存到当前 workspace 对应的 VS Code 扩展存储，不会在项目目录制造未跟踪文件。
- WSL / Remote SSH 中图片会进入远端 workspace host 的扩展存储，因此远端 Agent 可以直接访问路径。
- VS Code 核心在部分 Explorer 内部拖拽期间会禁用 Webview iframe 指针事件（参见 [microsoft/vscode#182449](https://github.com/microsoft/vscode/issues/182449)）。这类拖拽若未到达插件，请在 Explorer 复制图片后直接粘贴到终端；系统文件管理器拖放不受该限制。

## 状态与通知

插件从终端屏幕和信号中识别通用 Agent 状态，并兼容常见 Codex CLI 屏幕：

- 蓝色：运行中
- 黄色：等待输入
- 橙色：等待审批
- 绿色：已完成
- 红点：后台会话有未读状态

Toast 与完成声音会结合“当前会话、视图是否可见、VS Code 是否聚焦”去重。你正在看的会话不会反复打扰，切到后台后又不会悄悄错过审批或完成。

## 设置

| 设置 | 默认值 | 说明 |
| --- | --- | --- |
| `agentTerminalPanel.launchCommand` | 空 | workspace host 系统 shell 中执行的完整命令 |
| `agentTerminalPanel.environment` | `{}` | 叠加到 Agent 会话的环境变量 |
| `agentTerminalPanel.sessionListPosition` | `left` | 会话列表位于终端左侧或右侧 |
| `agentTerminalPanel.startSessionOnOpen` | `true` | 首次打开视图时自动创建会话 |
| `agentTerminalPanel.terminalImages.enabled` | `false` | 启用 Sixel/iTerm 图片及 Codex Pets 兼容环境 |
| `agentTerminalPanel.sessionHistory.maxResults` | `100` | 当前 workspace 历史选择器最大结果数 |
| `agentTerminalPanel.sessionHistory.codexCommand` | `codex` | Codex Resume / Fork 命令前缀 |
| `agentTerminalPanel.sessionHistory.claudeCommand` | `claude` | Claude Code Resume / Fork 命令前缀 |
| `agentTerminalPanel.notifications.showToast` | `true` | 后台审批、等待输入和完成 Toast |
| `agentTerminalPanel.notifications.completionSound` | `whenHidden` | `never`、`whenHidden` 或 `always` |

Codex Pets 用户可启用 `agentTerminalPanel.terminalImages.enabled` 后新建或重启会话。插件会加载 xterm.js image addon，设置 `TERM=xterm-sixel`，并移除会覆盖图片能力探测的 `TERM_PROGRAM` / `TERM_PROGRAM_VERSION`。兼容方案已在 [openai/codex#27335](https://github.com/openai/codex/issues/27335) 中验证。

## 平台与远程开发

Marketplace 会按当前 extension host 自动安装对应目标。GitHub `releases/v0.5.0/` 同时提供：

- Windows x64 / ARM64
- Linux x64 / ARM64（包括 WSL 与 Remote SSH workspace host）
- macOS Intel / Apple Silicon

每个 VSIX 只携带目标平台对应的 `node-pty` 原生预编译，不需要为同一个平台安装“通用包 + 原生包”。扩展声明 `extensionKind: ["workspace"]`，远程窗口应安装在远端环境。

## 隐私与边界

插件自身不提供云服务，也不上传终端内容、历史记录或图片。启动的 Agent CLI 是否联网、经过何种账号或代理，完全由你的命令与环境决定。历史发现只读取本机或远端 workspace host 上的 provider 记录，并按当前 workspace cwd 过滤。

## 项目

- 作者：[Cx330-502](https://github.com/Cx330-502)
- 源码与问题：[Cx330-502/agent-terminal-panel](https://github.com/Cx330-502/agent-terminal-panel)
- Roadmap：[TODO.md](https://github.com/Cx330-502/agent-terminal-panel/blob/main/TODO.md)
- License：MIT
