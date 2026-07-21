# Development guide

This document describes the implementation, validation, and release workflow. The Marketplace-facing product documentation lives in `README.md` and `README.en.md`.

## Design goals

- Run the Agent process on the VS Code workspace extension host.
- Preserve real terminal behavior through node-pty and xterm.js.
- Keep provider-specific history logic behind adapters; the terminal itself remains provider-agnostic.
- Make background attention useful without notifying for the visible, focused session.
- Keep local, WSL, SSH, Windows, Linux, Intel macOS, and Apple Silicon packaging explicit.

The implementation is original and built from VS Code extension APIs, xterm.js, and node-pty. No source code from another terminal-panel extension is included.

## Architecture

```text
VS Code workspace extension host
  AgentTerminalViewProvider
    SessionManager
      PtyHost -> node-pty -> configured system-shell command
      OutputBuffer
      CommunicationMonitor
        process tree -> Linux ss / macOS nettop / Windows TCP connections
        CodexSessionTracker -> process-open rollout JSONL metadata
    SessionHistoryController -> Codex / Claude provider adapters
    WorkspaceSessionRestore -> workspaceState snapshot + provider identity correlation
    AttachmentStore -> workspace/global extension storage
    CompletionNotifier

Webview
  WebviewApp
    TerminalController -> xterm.js + fit/WebGL/image addons
    SessionList / SidebarResize
    StatusDetector
    AttachmentController
    StartupIndicator
    CommunicationIndicator
```

`src/shared.ts` is the message contract between the extension host and Webview. Keep it serializable and make message variants explicit.

### Session lifecycle

1. The provider resolves the Webview and waits for its `ready` message.
2. `SessionManager.create` publishes the session immediately so the UI can render a startup state.
3. `PtyHost.spawn` resolves the configured command through the workspace-host system shell and returns the PID plus synchronous spawn duration.
4. A successful PTY spawn hides the Webview startup indicator immediately; first PTY output only completes the diagnostic timing recorded in the output channel.
5. Output is buffered for Webview reconstruction and sent to xterm.js for rendering.
6. `StatusDetector` reads the visible terminal screen and signals generic running/waiting/approval/completed states back to the host.

Startup timings are written to the `Agent Terminal Panel` LogOutputChannel. Do not log launch-command contents because they may include sensitive arguments.

### Launch profiles and menu

`src/launchProfiles.ts` normalizes the ordered `launchProfiles` setting. The primary `+` remains the only default-launch path; profile sessions carry their own name and command and therefore stay outside previous-window default-session recovery.

`media/launchMenu.ts` owns the anchored Webview menu, focus navigation, outside-click dismissal, and left/right collision handling. Keep the menu in the Webview document top level so the resizable session sidebar cannot clip it. The Extension Host resolves profile IDs against the latest configuration before starting a PTY.

### Attachment flow

Clipboard image bytes are encoded in the Webview and written by `AttachmentStore`. Dropped file/remote URI references and native-picker selections are validated through `vscode.workspace.fs`. Saved paths are quoted for the workspace-host platform before being pasted into xterm.js.

The controller understands browser files, `text/uri-list`, `application/vnd.code.uri-list`, `ResourceURLs`, `CodeFiles`, basic `CodeEditors` resources, and absolute text paths. VS Code reserves ordinary file drops for opening editors; holding `Shift` re-enables Webview delivery. The active-header picker and copy/paste are deterministic fallbacks when a host does not deliver drag events.

### Terminal selection scrolling

The xterm viewport uses a custom scroll model, so browser-native text selection does not automatically move scrollback near the top or bottom edge. `SelectionAutoScroll` observes a left-button selection drag without cancelling xterm events, then calls `Terminal.scrollLines` at a distance-proportional rate until mouseup. Keep this behavior isolated from HTML file drag/drop.

### Session history providers

Providers implement discovery, workspace matching, presentation, and native resume/fork command generation. New providers should be added under `src/sessionHistory/` and registered by `SessionHistoryController`. Do not guess undocumented resume arguments: provider support should ship only with verified commands and fixtures.

### Previous-window restore

`WorkspaceSessionRestore` is distinct from the Provider history picker. It continuously serializes only default-launch sessions that have a verified Provider session identity. Explicit closes remove entries through the normal `SessionManager` state update; custom commands and manually launched history sessions never become eligible.

The snapshot lives in `ExtensionContext.workspaceState` and contains no launch command or terminal output. On the next activation it remains pending until the user selects **Restore all** or **Ignore**. Pending recovery suppresses automatic session creation so proxy or network dependencies can be prepared first. Identity correlation polls current-workspace Codex/Claude history only while a new default session is unresolved, then stops after a bounded window.

### Communication health

`CommunicationMonitor` samples PTY counters for every session and optionally adds process-network and provider layers. A snapshot always labels its health basis so Webview code cannot silently present PTY bytes as network traffic.

- Linux uses one `ss -Htinp` table per sample, correlates socket owners against each Agent process tree, and reverse-matches loopback endpoints to a local proxy process. Proxy upstream bytes are marked `shared` because the proxy may serve several sessions or applications.
- macOS uses raw cumulative `nettop -P -L 1 -x -J bytes_in,bytes_out` counters and `ps` process trees. The parser accepts quoted CSV identities and aggregates duplicate PID rows.
- Windows uses `Get-CimInstance Win32_Process` plus `Get-NetTCPConnection`. It intentionally exposes connection counts only; when byte counters are unavailable, health falls back to PTY output.
- `CodexSessionTracker` discovers rollout JSONL only through files opened by the monitored process tree. It tails a bounded window, stores no message content, and extracts task phase, exact completed TTFT, duration, and token metadata.

Do not derive TPOT from terminal output timing or token-count deltas. Codex exposes TPOT/TBT through its optional OTel pipeline, but a provider-agnostic transparent terminal cannot assume control of the user's exporter. Add such metrics only through an explicit, reliable provider adapter.

## Source layout

| Path | Responsibility |
| --- | --- |
| `src/` | Extension-host orchestration, PTY, communication probes, storage, notifications, configuration |
| `src/sessionHistory/` | Provider-specific history discovery and launch adapters |
| `src/workspaceSessionRestore.ts` | Workspace snapshot persistence and default-session identity correlation |
| `media/` | Webview TypeScript, CSS, icons, generated browser bundle |
| `test/*.test.ts` | Node unit and PTY integration tests |
| `test/browser-harness.html` | Standalone Webview/xterm Chromium harness |
| `test/runUiRegression.js` | Multi-viewport layout and interaction probes |
| `test/runLaunchMenuRegression.js` | Launch-profile menu positioning, refresh, action, and keyboard regression |
| `test/runAttachmentRegression.js` | Clipboard and drag/drop regression flow |
| `test/runTerminalGutterRegression.js` | WebGL renderer, terminal resize, plain/Pets gutter, and Sixel repaint regression |
| `test/runTerminalRenderingRegression.js` | Immediate WebGL context-loss fallback and atomic TUI/Pets repaint regression |
| `test/runTerminalSearchRegression.js` | Terminal find widget, result navigation, shortcut, and narrow-layout regression |
| `scripts/package.mjs` | Six-target VSIX packaging and native-prebuild validation |

Frontend files should stay below 500 lines where practical. Repeated icon and startup UI behavior belongs in reusable modules rather than duplicated HTML or app logic.

## Local setup

Requirements:

- Node.js 22 or newer
- npm
- VS Code 1.106 or newer
- A host supported by the installed node-pty prebuild

```bash
npm ci
npm run check
npm test
npm run build
```

Press `F5` in VS Code to launch an Extension Development Host. Configure `agentTerminalPanel.launchCommand` there and verify both an ordinary shell command and the intended Agent CLI.

## Browser UI validation

Start the harness:

```bash
node test/serveHarness.mjs
```

Then run the Playwright scripts with a real Chromium page:

```bash
playwright-cli open http://127.0.0.1:4173/test/browser-harness.html
playwright-cli run-code --filename=test/runAttachmentRegression.js
playwright-cli run-code --filename=test/runSelectionScrollRegression.js
playwright-cli run-code --filename=test/runOutputFollowRegression.js
playwright-cli run-code --filename=test/runLaunchMenuRegression.js
playwright-cli run-code --filename=test/runTerminalImageRegression.js
playwright-cli run-code --filename=test/runTerminalGutterRegression.js
playwright-cli run-code --filename=test/runTerminalRenderingRegression.js
playwright-cli run-code --filename=test/runTerminalSearchRegression.js
playwright-cli run-code --filename=test/runUiRegression.js
```

The terminal-image regression proves that the Webview CSP blocks Sixel WebAssembly without `wasm-unsafe-eval` and renders non-transparent pixels with the narrow directive enabled. The terminal-gutter regression verifies WebGL activation, pre-paint resize fitting, native 10 px scrollbar geometry, theme-matched screen/viewport backgrounds, stable same-session state refreshes, and both plain and Sixel/Pets repaint paths. The terminal-rendering regression forces a real WebGL context loss and splits a TUI refresh from its Pets Sixel frame, then verifies immediate DOM fallback and the absence of transparent image-layer intermediate states. The standard UI matrix contains six desktop sizes, a same-width reduced-height pair, two narrow/mobile-like sizes, and a 320 px stress case. Review generated baseline, interaction, active/quiet/stalled communication states, dense-control, attachment-overlay, and startup screenshots in addition to automated overflow/occlusion probes.

The harness is not a substitute for an Extension Development Host check of:

- actual node-pty process launch and exit;
- WSL/SSH workspace-host placement;
- IME behavior in the VS Code Webview iframe;
- OS file-manager drag/drop;
- Marketplace target installation.

## Packaging

```bash
npm run package
```

The command builds the extension, validates that node-pty has all six prebuild directories, and writes:

```text
releases/v<version>/
  agent-terminal-panel-<version>-win32-x64.vsix
  agent-terminal-panel-<version>-win32-arm64.vsix
  agent-terminal-panel-<version>-linux-x64.vsix
  agent-terminal-panel-<version>-linux-arm64.vsix
  agent-terminal-panel-<version>-darwin-x64.vsix
  agent-terminal-panel-<version>-darwin-arm64.vsix
```

Every package excludes the other five native prebuilds. Inspect package contents and install at least the current-host VSIX before tagging a release.

## Release workflow

1. Update `package.json`, `package-lock.json`, `CHANGELOG.md`, and Marketplace screenshots.
2. Run TypeScript checks, Node tests, browser regression, and `npm run package`.
3. Commit the version, create `v<version>`, and push `main` plus the tag.
4. `.github/workflows/marketplace-publish.yml` verifies the tag/version match, rebuilds all targets, signs into Azure through GitHub OIDC, verifies publisher access, and publishes the six VSIX files.

The workflow stores no long-lived Marketplace PAT. Publishing depends on the GitHub Environment variables and Azure federated identity configured for this repository.
