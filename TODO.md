# Roadmap TODO

## Completed in 1.3.0

- Workspace-host shell path/arguments for Agent launches and Codex name synchronization (#2), with Bash/Zsh, CMD and PowerShell execution defaults.

## Completed in 1.4.0 — floating Agent window (#1)

- Editor WebviewPanel uses VS Code floating editor windows to move the session group to a second display and back to the sidebar.
- One active terminal surface uses the same workspace-host PTYs. Host tests cover message ownership, return on close, disposed sidebar and panel replacement. Native multi-display drag and remote focus remain manual validation items.

## Completed in 1.4.1 — completion detection and repeated sounds

- Read the live grid instead of the scrollback viewport; require observed work before composer completion, and ignore running/unknown BEL/OSC notifications as completion evidence.
- Deduplicate host attention per submitted turn, preserve work through approval echoes, latch completed turns against stale redraws, and clear stale timers on restart. Generic TUI status remains heuristic; providers without recognizable work/idle signals may not report completion.

## Completed in 1.4.2 — palette query latency and resets

- Initial Webview handshake supplies VS Code RGB colors before Agent spawn; workspace host answers exact default OSC 10/11/12 probes without renderer round trips and omits consumed probes from replay. Dynamic color setters remain owned by xterm.
- A real PTY fixture reproduces timeout without a responding renderer and succeeds within its 250ms budget with host-side colors. Browser coverage checks unchanged-setting palette preservation, delayed CSS theme injection, and replay isolation.
- Manual follow-up: verify the user's intermittent black composer on the affected machine. Existing WebGL/Pets tests remain, but these deterministic palette tests do not prove every GPU, provider repaint or raw-tail replay failure resolved. Capture the raw frame and color response if it recurs.

## Completed in 1.2.0

- Explicit Provider Resume versus terminal reset/rerun lifecycle actions, including one-shot Fork transition rules and Provider-aware recently closed recovery.
- Codex app-server and Claude Code `custom-title` name synchronization with panel-only fallback for unsupported providers.

## Completed in 0.9.1

- Pull-request/main CI with Ubuntu, Windows, and macOS runtime coverage.
- One-command Chromium regression suite with deterministic failure artifacts and Marketplace release gating.
- Cross-platform PTY tests for Chinese input, resize, and custom shell commands, including native Windows.
- VS Code-native English and Simplified Chinese localization across contributions, host prompts, and Webview UI.

## Completed in 0.9.0

- Native, collapsible image-drop Inbox using VS Code TreeView `files` and `text/uri-list` payloads.
- Explicit short-lived recovery for the latest 10 restartable closed sessions, expiring after 30 minutes.
- Versioned and migrated workspace/Webview state plus terminal scrollback search.

## Communication health follow-ups

- Add provider adapters beyond Codex only when their local telemetry and resume formats are stable enough to verify.
- Explore an opt-in proxy integration for per-request attribution; process-level observation alone cannot split shared cc-switch/CPA traffic by account or Agent session.
- Show TPOT/TBT only if a provider exposes reliable explicit telemetry. Do not infer it from PTY timing.
- Validate macOS and Windows probes on additional native host versions and retain PTY fallback for missing commands or permissions.

## Terminal history durability follow-ups

- Prevent long sessions from silently losing old output across all three retention boundaries: inherited xterm.js scrollback, provider resize/resume replay caps, and the extension host's 4 MiB raw PTY reconstruction buffer.
- Preserve VS Code terminal-setting inheritance while defining an explicit, bounded retention policy for users who need substantially longer history.
- Replace raw ANSI tail replay as the only Webview-reconstruction source with a verifiable checkpoint/transcript strategy that survives Webview rebuilds without unbounded memory use or replaying an incomplete terminal state.
