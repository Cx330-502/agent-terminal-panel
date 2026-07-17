# Roadmap TODO

## Closed-session recovery

- Keep a short-lived record when a session is closed.
- Offer an undo/quick-reopen action without silently restarting commands.
- Decide how long output, cwd, name, custom command and provider metadata should remain recoverable.

## Communication health

- Show source-labelled PTY, process-network and provider telemetry without conflating them.
- Detect long silent periods while an Agent still reports running.
- Explore Codex/Claude local session metrics plus cc-switch/CPA proxy correlation.
