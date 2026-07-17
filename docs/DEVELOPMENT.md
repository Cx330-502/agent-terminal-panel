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
    SessionHistoryController -> Codex / Claude provider adapters
    AttachmentStore -> workspace/global extension storage
    CompletionNotifier

Webview
  WebviewApp
    TerminalController -> xterm.js + fit/image addons
    SessionList / SidebarResize
    StatusDetector
    AttachmentController
    StartupIndicator
```

`src/shared.ts` is the message contract between the extension host and Webview. Keep it serializable and make message variants explicit.

### Session lifecycle

1. The provider resolves the Webview and waits for its `ready` message.
2. `SessionManager.create` publishes the session immediately so the UI can render a startup state.
3. `PtyHost.spawn` resolves the configured command through the workspace-host system shell and returns the PID plus synchronous spawn duration.
4. The first PTY output completes startup timing and hides the Webview startup indicator.
5. Output is buffered for Webview reconstruction and sent to xterm.js for rendering.
6. `StatusDetector` reads the visible terminal screen and signals generic running/waiting/approval/completed states back to the host.

Startup timings are written to the `Agent Terminal Panel` LogOutputChannel. Do not log launch-command contents because they may include sensitive arguments.

### Attachment flow

Clipboard image bytes are encoded in the Webview and written by `AttachmentStore`. Dropped file/remote URI references are validated through `vscode.workspace.fs`. Saved paths are quoted for the workspace-host platform before being pasted into xterm.js.

The controller understands browser files, `text/uri-list`, `application/vnd.code.uri-list`, `ResourceURLs`, `CodeFiles`, basic `CodeEditors` resources, and absolute text paths. VS Code itself blocks pointer events to Webview iframes during some internal Explorer drags, so copy/paste remains the documented fallback for that host-level limitation.

### Session history providers

Providers implement discovery, workspace matching, presentation, and native resume/fork command generation. New providers should be added under `src/sessionHistory/` and registered by `SessionHistoryController`. Do not guess undocumented resume arguments: provider support should ship only with verified commands and fixtures.

## Source layout

| Path | Responsibility |
| --- | --- |
| `src/` | Extension-host orchestration, PTY, storage, notifications, configuration |
| `src/sessionHistory/` | Provider-specific history discovery and launch adapters |
| `media/` | Webview TypeScript, CSS, icons, generated browser bundle |
| `test/*.test.ts` | Node unit and PTY integration tests |
| `test/browser-harness.html` | Standalone Webview/xterm Chromium harness |
| `test/runUiRegression.js` | Multi-viewport layout and interaction probes |
| `test/runAttachmentRegression.js` | Clipboard and drag/drop regression flow |
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
playwright-cli run-code --filename=test/runUiRegression.js
```

The standard UI matrix contains six desktop sizes, a same-width reduced-height pair, two narrow/mobile-like sizes, and a 320 px stress case. Review generated baseline, interaction, dense-control, attachment-overlay, and startup screenshots in addition to automated overflow/occlusion probes.

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
