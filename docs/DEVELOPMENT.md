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
    SessionLifecycleController -> continue / reset / closed-session recovery / name sync
    SessionHistoryController -> Codex / Claude provider adapters
    WorkspaceSessionRestore -> workspaceState snapshot + provider identity correlation
    AttachmentStore -> workspace/global extension storage
    CompletionNotifier
    ProviderViewState -> configuration subscriptions, initialization payload, View Badge

Webview
  WebviewApp
    TerminalController -> xterm.js + fit/WebGL/image addons
    SessionList / SidebarResize
    StatusDetector
    AttachmentController
    StartupIndicator
    CommunicationIndicator
    shared English / Simplified Chinese strings
```

`src/shared.ts` is the message contract between the extension host and Webview. Keep it serializable and make message variants explicit.

### Session lifecycle

The document host owns a single active Webview surface: a sidebar WebviewView or an editor WebviewPanel. Moving surfaces replaces the document and reuses SessionManager snapshots/replay. Only the active surface has a terminal message listener. A parked sidebar contains restricted command links; closing the editor reattaches the sidebar without disposing SessionManager. Editor renderer recovery replaces the panel at its editor column. VS Code owns dragging editor tabs into auxiliary windows; test this in a native multi-display development host, including focus and WSL/SSH placement.

1. The provider resolves the Webview and waits for its `ready` message.
2. `SessionManager.create` publishes the session immediately so the UI can render a startup state.
3. `PtyHost.spawn` resolves the configured command through the workspace-host system shell and returns the PID plus synchronous spawn duration.
4. A successful PTY spawn hides the Webview startup indicator immediately; first PTY output only completes the diagnostic timing recorded in the output channel.
5. Output is buffered for Webview reconstruction and sent to xterm.js for rendering.
6. `StatusDetector` reads the visible terminal screen and signals generic running/waiting/approval/completed states back to the host.

Startup timings are written to the `Agent Terminal Panel` LogOutputChannel. Do not log launch-command contents because they may include sensitive arguments.

### Launch commands and menu

`src/launchCommand.ts` resolves `shell.path` and `shell.args` for both PTY launches and Codex app-server RPC. An empty path preserves the workspace host's SHELL/ComSpec selection. An empty argument list selects Unix `-ic`, CMD `/d /s /c`, or PowerShell `-NoLogo -Command`; a non-empty list replaces the entire prefix, with the complete command appended once. The plain string-array schema enables the native Settings list editor. Shell settings use `machine-overridable` scope so remote hosts can have their own executable paths. Do not infer a VS Code terminal profile from `$SHELL`.

`SessionManager.spawn` reads the current process configuration for every new process, including rerun, Resume/Fork and recovery. The long-lived Codex provider receives a shell-config getter so name synchronization also observes subsequent settings changes. Shell changes do not restart existing processes. Tests exercise actual PTY rc loading with a deliberately unusable inherited SHELL, reconfiguration on restart, and a fake Codex app-server reachable only through the selected Bash startup file. The Windows runtime test launches PowerShell through `PtyHost`.

`src/launchProfiles.ts` normalizes the key/value `launchCommands` setting and merges the legacy ordered `launchProfiles` array. Key/value commands win on duplicate names. The primary `+` remains the only default-launch path; saved-command sessions carry their own name and command and therefore stay outside previous-window default-session recovery.

`media/launchMenu.ts` owns the anchored Webview menu, focus navigation, outside-click dismissal, and left/right collision handling. Keep the menu in the Webview document top level so the resizable session sidebar cannot clip it. The Extension Host resolves command IDs against the latest configuration before starting a PTY.

`SessionManager` records a launch source plus independent `canContinue` and `canRerun` capabilities for every terminal. `SessionLifecycleController` turns those capabilities into explicit actions: continue always builds a fresh Provider Resume command from the verified identity, while reset clears the terminal and reruns the source command. Default resets resolve the latest default command, saved and one-off commands retain their command snapshot, history Resume repeats its original Provider command, and history Fork remains non-rerunnable until its new identity is discovered and can be resumed. Automatic `Agent N` display names are allocated independently from session UUIDs and always choose the lowest free positive index.

### Webview styles

`getWebviewHtml` inlines the extension's own stylesheets as `<style>` elements and loads only `main.js` as a resource. With `retainContextWhenHidden: false` the document is rebuilt every time the view is shown again or recovered. Before this change, each rebuild refetched seven stylesheets through the Webview resource service worker. A single failed fetch left native grey controls, and the heartbeat could not detect it because JavaScript kept running. If a stylesheet cannot be read from the extension folder, it falls back to a `<link>`. Keep CSS free of relative `url()` references so inlining stays valid.

### Claude Code integration

`src/providerLaunch.ts` detects the Provider from a launch command. For a plain, fresh `claude` invocation, it appends `--session-id <uuid>`. `SessionManager` records the assigned ID for each spawn. `WorkspaceSessionRestore` then matches that exact ID when Claude writes the transcript, which happens only after the first prompt, so this tracking has no time limit. Claude launches without an assigned ID use a 30-minute window. Discovery polls only the tracked Providers. The Claude adapter reads only `$CLAUDE_CONFIG_DIR/projects` folders whose encoded names match a workspace root, and it caches transcript heads and titles. The Webview receives `launchProvider` and maps Shift+Enter to Meta+Enter (`ESC CR`) for Claude sessions so the composer inserts a newline.

### Attachment flow

Clipboard image bytes are encoded in the Webview and written by `AttachmentStore`. Dropped file/remote URI references and native-picker selections are validated through `vscode.workspace.fs`. Saved paths are quoted for the workspace-host platform before being pasted into xterm.js.

The controller understands browser files, `text/uri-list`, `application/vnd.code.uri-list`, `ResourceURLs`, `CodeFiles`, basic `CodeEditors` resources, and absolute text paths. VS Code reserves ordinary file drops for opening editors; holding `Shift` re-enables Webview delivery. The active-header picker and copy/paste are deterministic fallbacks when a host does not deliver drag events.

### Terminal selection scrolling

The xterm viewport uses a custom scroll model, so browser-native text selection does not automatically move scrollback near the top or bottom edge. `SelectionAutoScroll` observes a left-button selection drag without cancelling xterm events, then calls `Terminal.scrollLines` at a distance-proportional rate until mouseup. Keep this behavior isolated from HTML file drag/drop.

### Session history providers

Providers implement discovery, workspace matching, presentation, and native resume/fork command generation. New providers should be added under `src/sessionHistory/` and registered by `SessionHistoryController`. Do not guess undocumented resume arguments: provider support should ship only with verified commands and fixtures.

Provider name sync is equally adapter-specific. Codex uses the stable app-server `thread/name/set` request after the normal initialize handshake; never edit Codex SQLite directly. Claude Code appends its own `custom-title` JSONL record only after both the session UUID and cwd match. Unsupported providers keep panel-only names, and adapter failure must not roll back the user's local title.

### Previous-window restore

`WorkspaceSessionRestore` is distinct from the Provider history picker. Identity correlation may track direct Codex / Claude default, saved, one-off, and Fork launches so lifecycle actions and name sync can work, but serialization still requires `windowRestoreEligible` and therefore remains limited to default-`+` sessions with a verified Provider identity. Explicit closes remove entries through the normal `SessionManager` state update; custom commands and manually launched history sessions never become eligible.

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
| `src/sessionLifecycleController.ts` | Provider-aware restart/reset, closed-session recovery, and rename synchronization |
| `src/webviewDocumentHost.ts` | Webview document generations, heartbeat recovery, delivery checks, and replay-safe reloads |
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
| `test/runI18nRegression.js` | English/Chinese static and dynamic UI, accessibility, and narrow-layout regression |
| `test/runBrowserRegressions.mjs` | Isolated Chromium runner, harness lifecycle, JSON report, and failure screenshots |
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
npx playwright install chromium
npm run test:browser
```

Press `F5` in VS Code to launch an Extension Development Host. Configure `agentTerminalPanel.launchCommand` there and verify both an ordinary shell command and the intended Agent CLI.

## Local browser UI validation

The browser suite is an explicit local pre-release check rather than a GitHub CI job. It builds the Webview, starts the harness when needed, and runs every regression in an isolated browser context:

```bash
npm run test:browser
```

Failure evidence is written to `artifacts/browser/`. For interactive debugging, start the harness and run one script manually:

```bash
node test/serveHarness.mjs
playwright-cli open http://127.0.0.1:4173/test/browser-harness.html
playwright-cli run-code --filename=test/runAttachmentRegression.js
playwright-cli run-code --filename=test/runSelectionScrollRegression.js
playwright-cli run-code --filename=test/runOutputFollowRegression.js
playwright-cli run-code --filename=test/runLaunchMenuRegression.js
playwright-cli run-code --filename=test/runTerminalImageRegression.js
playwright-cli run-code --filename=test/runTerminalGutterRegression.js
playwright-cli run-code --filename=test/runTerminalRenderingRegression.js
playwright-cli run-code --filename=test/runTerminalSearchRegression.js
playwright-cli run-code --filename=test/runI18nRegression.js
playwright-cli run-code --filename=test/runUiRegression.js
```

The terminal-image regression proves that the Webview CSP blocks Sixel WebAssembly without `wasm-unsafe-eval` and renders non-transparent pixels with the narrow directive enabled. The terminal-gutter regression verifies WebGL activation, pre-paint resize fitting, native 10 px scrollbar geometry, theme-matched screen/viewport backgrounds, stable same-session state refreshes, and both plain and Sixel/Pets repaint paths. The terminal-rendering regression forces a real WebGL context loss and splits a TUI refresh from its Pets Sixel frame, then verifies immediate DOM fallback and the absence of transparent image-layer intermediate states. The standard UI matrix contains six desktop sizes, a same-width reduced-height pair, two narrow/mobile-like sizes, and a 320 px stress case. Review generated baseline, interaction, active/quiet/stalled communication states, dense-control, attachment-overlay, and startup screenshots in addition to automated overflow/occlusion probes.

The harness is not a substitute for an Extension Development Host check of:

- actual node-pty process launch and exit;
- WSL/SSH workspace-host placement;
- IME behavior in the VS Code Webview iframe;
- OS file-manager drag/drop;
- Marketplace target installation.

## Continuous integration and localization

`.github/workflows/ci.yml` runs on pull requests and pushes to `main`. Its runtime matrix executes the build, unit suite, and real PTY integration tests on Ubuntu, Windows, and macOS. The package job creates all six target VSIX files after that matrix passes. Browser installation and Webview regression stay out of CI and are run locally when preparing a release.

Manifest strings live in `package.nls.json` and `package.nls.zh-cn.json`. Extension-host prompts use `vscode.l10n.t` with translations in `l10n/bundle.l10n.zh-cn.json`. Webview strings live in the typed `src/webviewStrings.ts` dictionaries. `test/localization.test.ts` verifies manifest keys, runtime bundle coverage, dictionary parity, and the absence of hard-coded Chinese outside the localization source.

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
2. Run `npm run verify` and `npm run package`.
3. Commit the version, create `v<version>`, and push `main` plus the tag.
4. `.github/workflows/marketplace-publish.yml` verifies the tag/version match, repeats the unit/PTY gate, rebuilds all targets, generates structured notes from the matching `CHANGELOG.md` section, uploads six GitHub Release assets, signs into Azure through GitHub OIDC, verifies publisher access, and publishes the six Marketplace packages.

The workflow stores no long-lived Marketplace PAT. Publishing depends on the GitHub Environment variables and Azure federated identity configured for this repository.

To backfill a historical Marketplace version, dispatch the current workflow on
`main` with `release_tag` (for example, `gh workflow run marketplace-publish.yml
--ref main -f release_tag=v1.4.1`). It downloads the six existing GitHub Release
VSIX files, validates their publisher/name/version, and publishes those artifacts
using current authentication. It does not rebuild old code, move tags, or change
GitHub Release assets. Leave the input empty for the normal current-ref build.

Marketplace authentication uses `AZURE_CLIENT_ID` and `AZURE_TENANT_ID`, with
`allow-no-subscriptions: true`. It does not select an Azure resource subscription;
an expired trial subscription must not block tenant-level token acquisition.
The federated identity must still exist and retain Marketplace publisher access.
For a new identity independent of Azure resource lifecycle, use an Entra app
registration with GitHub federation and grant that identity publisher access.

## Palette-query compatibility (1.4.2)

The Webview sends resolved VS Code RGB foreground/background/cursor colors in its ready handshake, before automatic Agent creation. `SessionManager` answers exact OSC 10/11/12 default-color probes on the workspace host. Consumed queries are excluded from rendered output and raw replay; replies bypass user-input/status detection. OSC color setters delegate the affected slots back to xterm until a reset or palette change. Unsupported/chained queries retain native xterm handling.

Why: upstream Codex uses a [bounded startup palette probe](https://github.com/openai/codex/blob/main/codex-rs/tui/src/terminal_probe.rs) (250ms at inspection) and [caches unavailable results](https://github.com/openai/codex/blob/main/codex-rs/tui/src/terminal_palette.rs). The PTY regression compares an unanswered probe with host-side responses under the same deadline. It does not require Codex login or a network request.

VS Code [injects theme variables on documentElement](https://github.com/microsoft/vscode/blob/main/src/vs/workbench/contrib/webview/browser/pre/index.html). Observe that injection as well as host theme notifications: the two messages can arrive in either order. Do not reassign an unchanged xterm theme, which would reset OSC-defined colors on unrelated settings updates.
