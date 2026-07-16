import { randomBytes } from 'node:crypto';
import * as vscode from 'vscode';

export function getWebviewHtml(webview: vscode.Webview, extensionUri: vscode.Uri): string {
  const nonce = randomBytes(18).toString('base64');
  const xtermCss = webview.asWebviewUri(vscode.Uri.joinPath(extensionUri, 'media', 'xterm.css'));
  const styles = webview.asWebviewUri(vscode.Uri.joinPath(extensionUri, 'media', 'styles.css'));
  const script = webview.asWebviewUri(vscode.Uri.joinPath(extensionUri, 'media', 'main.js'));

  return `<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${webview.cspSource} 'unsafe-inline'; script-src 'nonce-${nonce}';">
  <link rel="stylesheet" href="${xtermCss}">
  <link rel="stylesheet" href="${styles}">
  <title>Agent Terminal Panel</title>
</head>
<body>
  <div id="app" class="app-shell">
    <aside id="session-sidebar" class="session-sidebar" aria-label="Agent 会话列表">
      <header class="session-header">
        <span class="session-heading">会话</span>
        <span class="session-actions">
          <button id="new-session" class="icon-button" type="button" title="新建会话" aria-label="新建会话">＋</button>
          <button id="new-session-folder" class="icon-button" type="button" title="选择工作目录并新建" aria-label="选择工作目录并新建">▣</button>
        </span>
      </header>
      <div id="session-list" class="session-list" role="tablist" aria-label="Agent 会话"></div>
    </aside>
    <div id="session-splitter" class="session-splitter" role="separator" aria-label="调整会话列表宽度" aria-orientation="vertical" tabindex="0"></div>
    <main class="terminal-pane">
      <header id="active-header" class="active-header" hidden>
        <div class="active-meta">
          <span id="active-status" class="status-dot" aria-hidden="true"></span>
          <span id="active-name" class="active-name"></span>
          <span id="active-cwd" class="active-cwd"></span>
        </div>
        <button id="restart-session" class="icon-button" type="button" title="重启当前会话" aria-label="重启当前会话">↻</button>
      </header>
      <div id="terminal-stack" class="terminal-stack" aria-live="off"></div>
      <div id="empty-state" class="empty-state">
        <p>还没有 Agent 会话</p>
        <button id="empty-new-session" class="primary-button" type="button">新建会话</button>
      </div>
    </main>
  </div>
  <script nonce="${nonce}" src="${script}"></script>
</body>
</html>`;
}
