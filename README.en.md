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
- **Find in long Agent output**: `Ctrl/Cmd+F` searches the active terminal scrollback with previous/next navigation, result counts, and Unicode queries.
- **Codex history survives xterm region scrolling**: a precise, removable compatibility path handles ratatui's top-anchored scroll frames for both live output and Webview replay without changing unrelated terminal sequences.
- **Per-session context**: choose a cwd or launch a named one-off custom command without changing the default.
- **Continue old work**: discover only Codex and Claude Code sessions belonging to the current workspace, then invoke each provider's native resume or fork command.
- **Restore a whole window in one click**: remember current-workspace sessions created with the default `+`, recognized as Codex or Claude, and not explicitly closed; then manually resume all of them after your proxy environment is ready.
- **Useful attention signals**: running, waiting for input, awaiting approval, and completed states, plus unread dots, a View badge, native toasts, and deduplicated completion sound.
- **See real activity behind “Working”**: layered PTY, process-socket, silence, and provider telemetry distinguishes useful work from a session that may be stuck without pretending terminal bytes are network traffic.
- **Terminal visible immediately**: the startup overlay only covers PTY creation and never blocks the terminal while an Agent or network is waiting for first output. Open `Output > Agent Terminal Panel` for Webview, spawn, and first-byte timings.
- **Practical image input**: paste, use the native file picker, or hold `Shift` while dropping OS/VS Code Explorer files and remote URI transfers. The extension inserts a safely quoted path without submitting it.
- **Native drop without Shift**: expand the sibling Image Drop Inbox and drop system files or Explorer images directly into the active Agent session.
- **Native VS Code appearance**: terminal font, size, weight, line height, cursor, scroll behavior, and colors all come from VS Code's integrated terminal settings and theme.
- **Follows the VS Code display language**: commands, settings, notifications, native dialogs, and Webview state are fully available in English and Simplified Chinese without mixed-language UI.
- **Continuously tested beyond one workstation**: every pull request and main-branch update runs builds, unit tests, and real PTY tests on Ubuntu, Windows, and macOS; the full Chromium Webview suite remains an explicit local pre-release check.
- **Optional terminal images**: enable Sixel/iTerm support for Codex Pets and similar tools only when needed.

<p align="center">
  <img src="media/screenshots/sidebar.webp" alt="Agent Terminal Panel in a narrow sidebar" width="390">
</p>

## Quick start

1. Install from the Marketplace and open the Agent Terminal icon in the Activity Bar.
2. Press `+`. On first use, enter a complete command available on the workspace host.
3. Examples include `codex`, `claude`, `gemini --model ...`, a `cc-switch-cli` wrapper, or a script with arguments and environment prefixes.
4. The arrow beside `+` opens an anchored menu with saved launch commands, cwd selection, one-off commands, and Provider history.
5. When a previous-window banner appears, prepare any proxy or network dependency and then select **Restore all**.

There is no hidden Codex default. Commands run through the workspace host's interactive system shell, loading the normal shell rc/PATH used by a native terminal, and the latest configuration is read for every new session or rerun default command.

Add name/value entries to `launchCommands` in the VS Code Settings UI, just like environment variables. The primary `+` still runs the default command; named commands appear only in the adjacent menu:

```json
"agentTerminalPanel.launchCommand": "codex",
"agentTerminalPanel.launchCommands": {
  "Claude": "claude",
  "Codex Full Auto": "codex --full-auto"
}
```

Each key is the menu label and initial terminal title; each value is the complete workspace-host command. Configuration changes refresh the menu without reloading the window. The legacy `launchProfiles` array remains readable, but new configurations should use `launchCommands`.

## Sessions and layout

- Rename by double-clicking a session or active title, clicking the pencil, or pressing `F2`.
- Automatic titles fill the lowest gap: after closing or renaming `Agent 2`, the next default session reuses `Agent 2`; internal session UUIDs are never reused.
- The circular arrow means “rerun launch command”: default sessions read the current default, saved and one-off commands rerun their own command, history Resume runs the same Provider Resume command again, and Fork launches cannot be repeated.
- Drag the session-list edge to resize it; the focused separator also supports arrow keys.
- Put the session list on the left or right with `agentTerminalPanel.sessionListPosition`.
- Move the entire view through VS Code's **Move View** action or by dragging the view title.
- The settings button opens the complete extension settings page.

### Previous-window session restore

This is intentionally separate from Provider-wide history and from the current-window, short-lived “undo close” feature:

- VS Code `workspaceState` scopes the snapshot to the current workspace; sessions from other workspaces are never mixed in.
- Only default-`+` sessions correlated with a built-in Codex or Claude session ID, plus their later restored continuations, are recorded. Saved launch commands, one-off commands, and manually selected Provider-history sessions are excluded.
- Explicitly closing a tab removes it immediately. Running, waiting, approval, and completed-but-still-open tabs remain eligible.
- Reopening a window shows a prompt but does not start Agents automatically. Pending recovery also suppresses `startSessionOnOpen`, leaving time to start cc-switch, a VPN, or another dependency first.
- **Restore all** invokes the configured native Codex or Claude Code resume command while preserving names, cwd values, relative order, and the active tab.
- The snapshot contains only Provider identity, session ID, name, cwd, and layout metadata—never the full command, custom arguments, or terminal output.

Shortcuts apply only while the Agent Terminal view is focused:

| Action | Windows / Linux | macOS |
| --- | --- | --- |
| New session | `Ctrl+Shift+\`` | `Cmd+Shift+\`` |
| Next session | `Ctrl+PageDown` | `Cmd+Alt+Right` |
| Previous session | `Ctrl+PageUp` | `Cmd+Alt+Left` |
| Close session | `Ctrl+W` | `Cmd+W` |
| Reopen recently closed session | `Ctrl+Shift+T` | `Cmd+Shift+T` |
| Find in active terminal | `Ctrl+F` | `Cmd+F` |

### Recently closed sessions

- Rerunnable sessions remain in an in-memory list for 30 minutes, capped at the latest 10. They are not persisted across extension-host restarts.
- Reopening is always explicit through the close notification, launch menu, or `Ctrl/Cmd+Shift+T`; the extension never silently starts a command.
- The recreated session keeps its name, cwd, and launch command, but does not pretend that the original process or lost terminal output survived.
- One-shot historical Fork launches are excluded so the same fork action cannot run twice by accident.

## Image paste, picker, and drop

- The simplest drop path is the native **Image Drop Inbox** in the Agent Terminal container. It accepts system files and VS Code Explorer resources without holding `Shift`.
- Paste a clipboard image into the focused terminal, or use the image button in the active-session header to open VS Code's native file picker.
- When dropping directly onto the terminal Webview canvas, hold `Shift` before entering and dropping. This is VS Code's official gesture for routing a file into a Webview instead of opening it in an editor (see [microsoft/vscode#182449](https://github.com/microsoft/vscode/issues/182449)).
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
| `agentTerminalPanel.launchCommands` | `{}` | Name/command entries shown beside `+`, editable as key/value rows in Settings |
| `agentTerminalPanel.launchProfiles` | `[]` | Legacy ordered object array; use `launchCommands` for new configuration |
| `agentTerminalPanel.environment` | `{}` | Environment variables added to Agent sessions |
| `agentTerminalPanel.sessionListPosition` | `left` | Place the session list left or right of the terminal |
| `agentTerminalPanel.startSessionOnOpen` | `true` | Create a session when the view first opens; paused while window recovery is pending |
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

For Codex Pets, enable `agentTerminalPanel.terminalImages.enabled` and create or restart the session. The extension uses the same WebGL-first rendering path as VS Code's native terminal, loads the xterm.js image addon, sets `TERM=xterm-sixel`, and removes terminal identity overrides that can hide image capabilities. The compatibility path was verified in [openai/codex#27335](https://github.com/openai/codex/issues/27335).

## Platforms and remote development

The Marketplace selects the package for the current extension host. [GitHub Release v1.0.0](https://github.com/Cx330-502/agent-terminal-panel/releases/tag/v1.0.0) also provides native packages for:

- Windows x64 and ARM64
- Linux x64 and ARM64, including WSL and Remote SSH workspace hosts
- Intel macOS and Apple Silicon

Each VSIX carries only the matching `node-pty` prebuild. The extension declares `extensionKind: ["workspace"]`, so install it into the remote environment when using a remote window.

VSIX files are published only as GitHub Release assets and Marketplace packages, never in Git history. Local `npm run package` builds remain available under the ignored `releases/vVERSION/` directory.

## Privacy

The extension has no cloud service and does not upload terminal output, history, communication metrics, or images. Any network traffic, account routing, or proxy behavior belongs to the Agent command and environment you configure. History discovery reads provider records on the workspace host and filters them by the current workspace cwd. Previous-window recovery stores only Provider/session identity, name, cwd, and order in VS Code workspace state—not full commands or output. When Codex communication metadata is enabled, the extension reads only rollout JSONL files already opened by that Codex process and retains event phase, timing, and token numbers—not prompt or response text. Process-network and Codex metadata probes can be disabled independently.

## Project

- Author: [Cx330-502](https://github.com/Cx330-502)
- Source and issues: [Cx330-502/agent-terminal-panel](https://github.com/Cx330-502/agent-terminal-panel)
- Roadmap: [TODO.md](./TODO.md)
- License: MIT
