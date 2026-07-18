import { randomBytes } from 'node:crypto';
import * as vscode from 'vscode';

export function getWebviewHtml(webview: vscode.Webview, extensionUri: vscode.Uri): string {
  const nonce = randomBytes(18).toString('base64');
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
  const script = webview.asWebviewUri(vscode.Uri.joinPath(extensionUri, 'media', 'main.js'));

  return `<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src data: blob:; style-src ${webview.cspSource} 'unsafe-inline'; script-src 'nonce-${nonce}' 'wasm-unsafe-eval';">
  <link rel="stylesheet" href="${xtermCss}">
  <link rel="stylesheet" href="${styles}">
  <link rel="stylesheet" href="${attachmentStyles}">
  <link rel="stylesheet" href="${startupStyles}">
  <link rel="stylesheet" href="${communicationStyles}">
  <title>Agent Terminal Panel</title>
</head>
<body>
  <div id="app" class="app-shell">
    <aside id="session-sidebar" class="session-sidebar" aria-label="Agent 会话列表">
      <header class="session-header">
        <span class="session-heading">会话</span>
        <span class="session-actions">
          <button id="new-session" class="icon-button" type="button" title="新建会话" aria-label="新建会话" data-icon="add"></button>
          <button id="session-history" class="icon-button" type="button" title="从 Agent 历史会话启动" aria-label="从 Agent 历史会话启动" data-icon="history"></button>
          <button id="new-custom-session" class="icon-button" type="button" title="使用自定义命令新建" aria-label="使用自定义命令新建" data-icon="terminal"></button>
          <button id="new-session-folder" class="icon-button" type="button" title="选择工作目录并新建" aria-label="选择工作目录并新建" data-icon="folder"></button>
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
          <button id="pick-attachments" class="icon-button" type="button" title="选择图片文件；从 VS Code 资源管理器拖入时请按住 Shift" aria-label="选择图片文件" data-icon="image"></button>
          <button id="rename-active-session" class="icon-button" type="button" title="重命名当前会话" aria-label="重命名当前会话" data-icon="pencil"></button>
          <button id="restart-session" class="icon-button" type="button" title="重启当前会话" aria-label="重启当前会话" data-icon="restart"></button>
        </span>
      </header>
      <div id="terminal-stack" class="terminal-stack" aria-live="off"></div>
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
        <strong>放下图片</strong>
        <span>VS Code 资源管理器或系统文件管理器拖入时请按住 Shift；也可点击顶栏图片按钮</span>
      </div>
      <div id="attachment-status" class="attachment-status" role="status" aria-live="polite" hidden></div>
      <div id="empty-state" class="empty-state">
        <p>还没有 Agent 会话</p>
        <button id="empty-new-session" class="primary-button" type="button">新建会话</button>
        <button id="empty-custom-session" class="secondary-button" type="button">自定义命令新建</button>
        <button id="empty-session-history" class="secondary-button" type="button">恢复历史会话</button>
      </div>
    </main>
  </div>
  <script nonce="${nonce}" src="${script}"></script>
</body>
</html>`;
}
