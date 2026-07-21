# Roadmap TODO

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
