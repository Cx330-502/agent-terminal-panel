# Roadmap TODO

## Closed-session recovery

- Keep a short-lived record when a session is closed.
- Offer an undo/quick-reopen action without silently restarting commands.
- Decide how long output, cwd, name, custom command and provider metadata should remain recoverable.

## Communication health follow-ups

- Add provider adapters beyond Codex only when their local telemetry and resume formats are stable enough to verify.
- Explore an opt-in proxy integration for per-request attribution; process-level observation alone cannot split shared cc-switch/CPA traffic by account or Agent session.
- Show TPOT/TBT only if a provider exposes reliable explicit telemetry. Do not infer it from PTY timing.
- Validate macOS and Windows probes on additional native host versions and retain PTY fallback for missing commands or permissions.
