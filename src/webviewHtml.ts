import { randomBytes } from 'node:crypto';
import * as vscode from 'vscode';
import { getWebviewStrings } from './webviewStrings';

export function getWebviewHtml(
  webview: vscode.Webview,
  extensionUri: vscode.Uri,
  language = vscode.env.language
): string {
  const nonce = randomBytes(18).toString('base64');
  const strings = getWebviewStrings(language);
  const lang = language.toLowerCase().replace('_', '-').startsWith('zh-cn') ? 'zh-CN' : 'en';
  const xtermCss = webview.asWebviewUri(vscode.Uri.joinPath(extensionUri, 'media', 'xterm.css'));
  const styles = webview.asWebviewUri(vscode.Uri.joinPath(extensionUri, 'media', 'styles.css'));
  const attachmentStyles = webview.asWebviewUri(
    vscode.Uri.joinPath(extensionUri, 'media', 'attachments.css')
  );
  const startupStyles = webview.asWebviewUri(
    vscode.Uri.joinPath(extensionUri, 'media', 'startup.css')
  );
  const communicationStyles = webview.asWebviewUri(
    vscode.Uri.joinPath(extensionUri, 'media', 'communication.css')
  );
  const sessionControlsStyles = webview.asWebviewUri(
    vscode.Uri.joinPath(extensionUri, 'media', 'sessionControls.css')
  );
  const searchStyles = webview.asWebviewUri(
    vscode.Uri.joinPath(extensionUri, 'media', 'search.css')
  );
  const script = webview.asWebviewUri(vscode.Uri.joinPath(extensionUri, 'media', 'main.js'));

  return `<!doctype html>
<html lang="${lang}">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src data: blob:; style-src ${webview.cspSource} 'unsafe-inline'; script-src 'nonce-${nonce}' 'wasm-unsafe-eval';">
  <link rel="stylesheet" href="${xtermCss}">
  <link rel="stylesheet" href="${styles}">
  <link rel="stylesheet" href="${attachmentStyles}">
  <link rel="stylesheet" href="${startupStyles}">
  <link rel="stylesheet" href="${communicationStyles}">
  <link rel="stylesheet" href="${sessionControlsStyles}">
  <link rel="stylesheet" href="${searchStyles}">
  <title>${html(strings.documentTitle)}</title>
</head>
<body>
  <div id="app" class="app-shell">
    <aside id="session-sidebar" class="session-sidebar" aria-label="${html(strings.sessionSidebarAria)}">
      <header class="session-header">
        <span id="session-heading" class="session-heading">${html(strings.sessionHeading)}</span>
        <span class="session-actions">
          <span class="new-session-split">
            <button id="new-session" class="icon-button split-primary" type="button" title="${html(strings.newDefaultSession)}" aria-label="${html(strings.newDefaultSession)}" data-icon="add"></button>
            <button id="new-session-menu" class="icon-button split-secondary" type="button" title="${html(strings.otherLaunchMethods)}" aria-label="${html(strings.otherLaunchMethods)}" aria-haspopup="menu" aria-controls="launch-menu" aria-expanded="false" data-icon="chevronDown"></button>
          </span>
        </span>
      </header>
      <div id="session-list" class="session-list" role="tablist" aria-label="${html(strings.sessionListAria)}"></div>
    </aside>
    <div id="session-splitter" class="session-splitter" role="separator" aria-label="${html(strings.sessionSplitterAria)}" aria-orientation="vertical" tabindex="0"></div>
    <main class="terminal-pane">
      <header id="active-header" class="active-header" hidden>
        <div class="active-meta">
          <span id="active-status" class="status-dot" aria-hidden="true"></span>
          <span id="active-name" class="active-name"></span>
          <span id="active-cwd" class="active-cwd"></span>
        </div>
        <div id="communication-summary" class="communication-summary" role="status" aria-live="polite" hidden>
          <span class="communication-health">
            <span id="communication-dot" class="communication-dot" aria-hidden="true"></span>
            <span id="communication-health-full" class="communication-health-full"></span>
            <span id="communication-health-compact" class="communication-health-compact"></span>
          </span>
          <span id="communication-traffic" class="communication-traffic"></span>
          <span id="communication-latency" class="communication-latency"></span>
        </div>
        <span class="active-actions">
          <button id="find-terminal" class="icon-button" type="button" title="${html(strings.findTerminal)}" aria-label="${html(strings.findTerminal)}" data-icon="search"></button>
          <button id="pick-attachments" class="icon-button" type="button" title="${html(strings.pickAttachmentsTitle)}" aria-label="${html(strings.pickAttachmentsAria)}" data-icon="image"></button>
          <button id="rename-active-session" class="icon-button" type="button" title="${html(strings.renameCurrentSession)}" aria-label="${html(strings.renameCurrentSession)}" data-icon="pencil"></button>
          <button id="restart-session" class="icon-button" type="button" title="${html(strings.restartCurrentSession)}" aria-label="${html(strings.restartCurrentSession)}" data-icon="restart"></button>
        </span>
      </header>
      <section id="workspace-restore" class="workspace-restore" aria-live="polite" hidden>
        <span class="workspace-restore-copy">
          <strong id="workspace-restore-title"></strong>
          <span id="workspace-restore-detail"></span>
        </span>
        <span class="workspace-restore-actions">
          <button id="restore-workspace-sessions" class="primary-button compact-button" type="button">${html(strings.restoreAll)}</button>
          <button id="dismiss-workspace-restore" class="secondary-button compact-button" type="button">${html(strings.dismiss)}</button>
        </span>
      </section>
      <div id="terminal-stack" class="terminal-stack" aria-live="off">
        <div id="terminal-search" class="terminal-search" role="search" hidden>
          <input id="terminal-search-input" type="text" autocomplete="off" spellcheck="false" aria-label="${html(strings.searchInputAria)}">
          <span id="terminal-search-result" class="terminal-search-result" role="status" aria-live="polite"></span>
          <button id="terminal-search-previous" class="icon-button" type="button" title="${html(strings.searchPreviousTitle)}" aria-label="${html(strings.searchPreviousAria)}" data-icon="arrowUp"></button>
          <button id="terminal-search-next" class="icon-button" type="button" title="${html(strings.searchNextTitle)}" aria-label="${html(strings.searchNextAria)}" data-icon="arrowDown"></button>
          <button id="terminal-search-close" class="icon-button" type="button" title="${html(strings.searchCloseTitle)}" aria-label="${html(strings.searchCloseAria)}" data-icon="close"></button>
        </div>
      </div>
      <div id="startup-overlay" class="startup-overlay" role="status" aria-live="polite" hidden>
        <div class="startup-card">
          <span class="startup-spinner" aria-hidden="true"></span>
          <span class="startup-copy">
            <strong id="startup-title" class="startup-title"></strong>
            <span id="startup-detail" class="startup-detail"></span>
          </span>
        </div>
      </div>
      <div id="attachment-overlay" class="attachment-overlay" hidden>
        <strong id="attachment-overlay-title">${html(strings.dropImages)}</strong>
        <span id="attachment-overlay-detail">${html(strings.dropImagesHint)}</span>
      </div>
      <div id="attachment-status" class="attachment-status" role="status" aria-live="polite" hidden></div>
      <div id="empty-state" class="empty-state">
        <p id="empty-state-copy">${html(strings.emptyState)}</p>
        <button id="empty-new-session" class="primary-button" type="button">${html(strings.emptyNewDefault)}</button>
        <button id="empty-new-session-menu" class="secondary-button" type="button" aria-haspopup="menu" aria-controls="launch-menu" aria-expanded="false">${html(strings.emptyOtherLaunch)}</button>
      </div>
    </main>
  </div>
  <div id="launch-menu" class="launch-menu" role="menu" aria-label="${html(strings.launchMenuAria)}" hidden></div>
  <script nonce="${nonce}" src="${script}"></script>
</body>
</html>`;
}

function html(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}
