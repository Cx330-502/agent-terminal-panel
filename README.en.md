# Agent Terminal Panel

Turn almost any Agent CLI into a movable, parallel VS Code workspace that runs on the real workspace host.

[中文](./README.md) · [Marketplace](https://marketplace.visualstudio.com/items?itemName=Cx330-502.agent-terminal-panel) · [Development](./docs/DEVELOPMENT.md) · [Changelog](./CHANGELOG.md)

<p align="center">
  <img src="media/screenshots/panel.webp" alt="Agent Terminal Panel with multiple sessions" width="100%">
</p>

Agent Terminal Panel is provider-agnostic. You supply the launch command; it supplies a real PTY, multiple background sessions, status and attention signals, history resume/fork, and image input. Move the view between either sidebar and the bottom Panel. In WSL and Remote SSH, processes stay on the workspace extension host instead of accidentally launching on the local UI machine.

## Highlights

- **One panel for many agents**: run Codex, Claude Code, Gemini CLI, Aider, internal tools, proxy wrappers, scripts, or another interactive shell command.
- **A real terminal stack**: xterm.js + node-pty with resize, bracketed paste, CJK IME, true color, OSC 10/11/12, and correct rendering of the Codex shaded composer.
- **Parallel sessions**: create, switch, rename, close, and restart. PTYs continue in the background and recent output is replayed when the Webview is rebuilt.
- **Per-session context**: choose a cwd or launch a named one-off custom command without changing the default.
- **Continue old work**: discover only Codex and Claude Code sessions belonging to the current workspace, then invoke each provider's native resume or fork command.
- **Useful attention signals**: running, waiting for input, awaiting approval, and completed states, plus unread dots, a View badge, native toasts, and deduplicated completion sound.
- **See real activity behind “Working”**: layered PTY, process-socket, silence, and provider telemetry distinguishes useful work from a session that may be stuck without pretending terminal bytes are network traffic.
- **Terminal visible immediately**: the startup overlay only covers PTY creation and never blocks the terminal while an Agent or network is waiting for first output. Open `Output > Agent Terminal Panel` for Webview, spawn, and first-byte timings.
- **Practical image input**: paste, use the native file picker, or hold `Shift` while dropping OS/VS Code Explorer files and remote URI transfers. The extension inserts a safely quoted path without submitting it.
- **Native VS Code appearance**: terminal font, size, weight, line height, cursor, scroll behavior, and colors all come from VS Code's integrated terminal settings and theme.
- **Optional terminal images**: enable Sixel/iTerm support for Codex Pets and similar tools only when needed.

<p align="center">
  <img src="media/screenshots/sidebar.webp" alt="Agent Terminal Panel in a narrow sidebar" width="390">
</p>

## Quick start

1. Install from the Marketplace and open the Agent Terminal icon in the Activity Bar.
2. Press `+`. On first use, enter a complete command available on the workspace host.
3. Examples include `codex`, `claude`, `gemini --model ...`, a `cc-switch-cli` wrapper, or a script with arguments and environment prefixes.
4. Use the terminal icon for a named one-off custom command.
5. Use the folder icon to choose a cwd, or the history icon to resume/fork a session from the current workspace.

There is no hidden Codex default. Commands run through the workspace host's system shell and the latest configuration is read for every new or restarted session.

## Sessions and layout

- Rename by double-clicking a session or active title, clicking the pencil, or pressing `F2`.
- Drag the session-list edge to resize it; the focused separator also supports arrow keys.
- Put the session list on the left or right with `agentTerminalPanel.sessionListPosition`.
- Move the entire view through VS Code's **Move View** action or by dragging the view title.
- The settings button opens the complete extension settings page.

Shortcuts apply only while the Agent Terminal view is focused:

| Action | Windows / Linux | macOS |
| --- | --- | --- |
| New session | `Ctrl+Shift+\`` | `Cmd+Shift+\`` |
| Next session | `Ctrl+PageDown` | `Cmd+Alt+Right` |
| Previous session | `Ctrl+PageUp` | `Cmd+Alt+Left` |
| Close session | `Ctrl+W` | `Cmd+W` |

## Image paste, picker, and drop

- Paste a clipboard image into the focused terminal, or use the image button in the active-session header to open VS Code's native file picker.
- Hold `Shift` before entering and dropping files from either VS Code Explorer or the OS file manager. This is VS Code's official gesture for routing a file into a Webview instead of opening it in an editor (see [microsoft/vscode#182449](https://github.com/microsoft/vscode/issues/182449)).
- Browser files, `ResourceURLs`, VS Code URI lists, `CodeFiles`, remote URIs, and absolute image paths are supported, up to eight images per operation.
- The per-file limit is 25 MB and the per-operation limit is 50 MB. Paths are inserted without an automatic Enter.
- Clipboard/browser file bytes are stored in VS Code extension storage; Explorer/URI files already on the workspace host keep their original path, so no project copy is created.
- In WSL and Remote SSH, uploaded images are stored on the remote workspace host where the Agent can access them.
- If a particular VS Code build, desktop environment, or remote host still does not route the drop into the Webview, use the header picker or copy/paste; neither path depends on iframe drag routing.

## Communication health without invented metrics

Version 0.6.0 adds a responsive communication strip to the active-session header. Its sources stay deliberately separate:

- **PTY layer** works for every Agent and reports terminal input/output rates plus silence duration. These are terminal bytes, not network throughput.
- **Process-network layer** reads cumulative TCP counters for the Agent process tree through `ss` on Linux, WSL, and Remote SSH, uses `nettop` on macOS, and reports established connection counts on Windows before falling back to PTY activity when byte counters are unavailable.
- **Codex provider layer** maps only rollout JSONL files already opened by the monitored Codex process (`/proc/<pid>/fd` on Linux, `lsof` on macOS), then extracts the exact `task_complete.time_to_first_token_ms`, turn duration, and token metadata.
- **Local proxy correlation** detects loopback-only Agent sockets and can locate a local cc-switch-like proxy. A `*` beside the proxy name means its upstream rate is a process-shared estimate, not traffic exclusively attributed to one Agent session.

Green means recent activity, yellow means the quiet threshold was crossed, and red means the session is possibly stalled. A red signal is diagnostic rather than proof of a broken network: local tools, server queues, and model work can all be silent. Codex tool activity reported in JSONL is exempt from the silence warning.

The extension does not fabricate TPOT/TBT. Exact values are shown only when a provider exposes reliable telemetry. Completed Codex `TTFT` is exact; an in-progress “first event” is explicitly labelled as an approximation. Traffic beyond a remote CPA or a shared multi-account proxy cannot be attributed to an account or request from the Agent socket alone, and the UI preserves that limitation.

## Settings

| Setting | Default | Purpose |
| --- | --- | --- |
| `agentTerminalPanel.launchCommand` | empty | Complete command executed by the workspace-host system shell |
| `agentTerminalPanel.environment` | `{}` | Environment variables added to Agent sessions |
| `agentTerminalPanel.sessionListPosition` | `left` | Place the session list left or right of the terminal |
| `agentTerminalPanel.startSessionOnOpen` | `true` | Create a session when the view first opens |
| `agentTerminalPanel.terminalImages.enabled` | `false` | Enable Sixel/iTerm images and the Codex Pets compatibility environment |
| `agentTerminalPanel.communicationHealth.enabled` | `true` | Show source-labelled communication health |
| `agentTerminalPanel.communicationHealth.sampleIntervalMs` | `2000` | UI and PTY refresh interval; platform probes may sample less often |
| `agentTerminalPanel.communicationHealth.quietThresholdSeconds` | `15` | Silence before a running session becomes quiet |
| `agentTerminalPanel.communicationHealth.stalledThresholdSeconds` | `45` | Silence before a running session becomes possibly stalled |
| `agentTerminalPanel.communicationHealth.processNetwork.enabled` | `true` | Enable workspace-host process-network probes |
| `agentTerminalPanel.communicationHealth.codexSessionMetrics.enabled` | `true` | Extract TTFT and token metadata from the active Codex process |
| `agentTerminalPanel.sessionHistory.maxResults` | `100` | Maximum current-workspace history results |
| `agentTerminalPanel.sessionHistory.codexCommand` | `codex` | Codex resume/fork command prefix |
| `agentTerminalPanel.sessionHistory.claudeCommand` | `claude` | Claude Code resume/fork command prefix |
| `agentTerminalPanel.notifications.showToast` | `true` | Background approval, input, and completion toasts |
| `agentTerminalPanel.notifications.completionSound` | `whenHidden` | `never`, `whenHidden`, or `always` |

For Codex Pets, enable `agentTerminalPanel.terminalImages.enabled` and create or restart the session. The extension loads the xterm.js image addon, sets `TERM=xterm-sixel`, and removes terminal identity overrides that can hide image capabilities. The compatibility path was verified in [openai/codex#27335](https://github.com/openai/codex/issues/27335).

## Platforms and remote development

The Marketplace selects the package for the current extension host. `releases/v0.6.2/` also contains native packages for:

- Windows x64 and ARM64
- Linux x64 and ARM64, including WSL and Remote SSH workspace hosts
- Intel macOS and Apple Silicon

Each VSIX carries only the matching `node-pty` prebuild. The extension declares `extensionKind: ["workspace"]`, so install it into the remote environment when using a remote window.

## Privacy

The extension has no cloud service and does not upload terminal output, history, communication metrics, or images. Any network traffic, account routing, or proxy behavior belongs to the Agent command and environment you configure. History discovery reads provider records on the workspace host and filters them by the current workspace cwd. When Codex communication metadata is enabled, the extension reads only rollout JSONL files already opened by that Codex process and retains event phase, timing, and token numbers—not prompt or response text. Process-network and Codex metadata probes can be disabled independently.

## Project

- Author: [Cx330-502](https://github.com/Cx330-502)
- Source and issues: [Cx330-502/agent-terminal-panel](https://github.com/Cx330-502/agent-terminal-panel)
- Roadmap: [TODO.md](./TODO.md)
- License: MIT
