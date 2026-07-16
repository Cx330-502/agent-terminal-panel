import * as fs from 'node:fs';
import * as os from 'node:os';
import * as vscode from 'vscode';
import {
  getAgentProcessConfig,
  getLaunchCommand,
  getTerminalSettings,
  shouldStartSessionOnOpen
} from './config';
import { CompletionNotifier } from './notifications';
import { SessionManager, type SessionAttention } from './sessionManager';
import type { HostMessage, WebviewMessage } from './shared';
import { getWebviewHtml } from './webviewHtml';

export const VIEW_ID = 'agentTerminalPanel.terminalView';

interface CwdPickItem extends vscode.QuickPickItem {
  path?: string;
  browse?: boolean;
}

export class AgentTerminalViewProvider implements vscode.WebviewViewProvider, vscode.Disposable {
  private readonly disposables: vscode.Disposable[] = [];
  private readonly viewDisposables: vscode.Disposable[] = [];
  private readonly readyWaiters = new Set<() => void>();
  private readonly sessions: SessionManager;
  private readonly notifier: CompletionNotifier;
  private view: vscode.WebviewView | undefined;
  private webviewReady = false;
  private viewVisible = false;
  private windowFocused = vscode.window.state.focused;
  private didAutoStart = false;
  private lastSize = { cols: 80, rows: 24 };

  constructor(private readonly extensionUri: vscode.Uri) {
    this.sessions = new SessionManager(getAgentProcessConfig, {
      onOutput: (id, data) => this.post({ type: 'output', id, data }),
      onClear: (id) => this.post({ type: 'clear', id }),
      onStateChanged: () => this.handleStateChanged(),
      onAttention: (event) => this.handleAttention(event)
    });
    this.notifier = new CompletionNotifier({
      isActiveSession: (id) => this.sessions.getActiveId() === id,
      isViewVisible: () => this.viewVisible,
      isWindowFocused: () => this.windowFocused,
      setUnread: (id, unread) => this.sessions.setUnread(id, unread),
      reveal: (id) => void this.revealSession(id),
      playCompletionSound: () => this.post({ type: 'playCompletionSound' })
    });

    this.disposables.push(
      vscode.window.onDidChangeWindowState((state) => {
        this.windowFocused = state.focused;
        if (state.focused) this.acknowledgeVisibleSession();
      }),
      vscode.window.onDidChangeActiveColorTheme(() => this.post({ type: 'refreshTheme' })),
      vscode.workspace.onDidChangeConfiguration((event) => {
        if (event.affectsConfiguration('terminal.integrated')) {
          this.post({ type: 'terminalSettings', settings: getTerminalSettings() });
        }
      })
    );
  }

  resolveWebviewView(webviewView: vscode.WebviewView): void {
    this.clearViewDisposables();
    this.view = webviewView;
    this.viewVisible = webviewView.visible;
    webviewView.webview.options = {
      enableScripts: true,
      localResourceRoots: [this.extensionUri]
    };
    webviewView.webview.html = getWebviewHtml(webviewView.webview, this.extensionUri);

    this.viewDisposables.push(
      webviewView.webview.onDidReceiveMessage((message: WebviewMessage) => {
        void this.handleMessage(message);
      }),
      webviewView.onDidChangeVisibility(() => {
        this.viewVisible = webviewView.visible;
        if (webviewView.visible) this.acknowledgeVisibleSession();
      }),
      webviewView.onDidDispose(() => {
        if (this.view === webviewView) {
          this.view = undefined;
          this.webviewReady = false;
          this.viewVisible = false;
        }
      })
    );
    this.updateBadge();
  }

  async createSession(chooseCwd = false): Promise<string | undefined> {
    if (!(await this.ensureLaunchCommand())) return undefined;
    const cwd = chooseCwd ? await this.pickWorkingDirectory() : this.defaultWorkingDirectory();
    if (!cwd) return undefined;
    if (!this.webviewReady) {
      await this.show();
      await this.waitForWebviewReady();
    }
    const id = this.sessions.create(cwd, this.lastSize);
    await this.show();
    this.post({ type: 'focusSession', id });
    this.acknowledgeVisibleSession();
    return id;
  }

  closeActiveSession(): void {
    const id = this.sessions.getActiveId();
    if (id) this.sessions.close(id);
  }

  async restartActiveSession(): Promise<void> {
    const id = this.sessions.getActiveId();
    if (id) await this.restartSession(id);
  }

  async configureLaunchCommand(showConfirmation = true): Promise<string | undefined> {
    const config = vscode.workspace.getConfiguration('agentTerminalPanel');
    const launchCommand = await vscode.window.showInputBox({
      title: '配置 Agent 启动命令',
      prompt: '输入在 workspace extension host 中执行的完整命令行',
      placeHolder: 'agent-cli --flag value',
      value: getLaunchCommand(),
      ignoreFocusOut: true,
      validateInput: (value) => (value.trim() ? undefined : '启动命令不能为空')
    });
    if (launchCommand === undefined) return undefined;

    const inspected = config.inspect<string>('launchCommand');
    const target =
      inspected?.workspaceValue !== undefined
        ? vscode.ConfigurationTarget.Workspace
        : vscode.ConfigurationTarget.Global;
    const trimmed = launchCommand.trim();
    await config.update('launchCommand', trimmed, target);
    if (showConfirmation) {
      void vscode.window.showInformationMessage('Agent 启动命令已更新，新建或重启会话时生效。');
    }
    return trimmed;
  }

  async renameActiveSession(): Promise<void> {
    const session = this.sessions.getActive();
    if (!session) return;
    const name = await vscode.window.showInputBox({
      title: '重命名 Agent 会话',
      value: session.name,
      validateInput: (value) => (value.trim() ? undefined : '名称不能为空')
    });
    if (name !== undefined) this.sessions.rename(session.id, name);
  }

  switchSession(direction: 1 | -1): void {
    const id = this.sessions.activateNext(direction);
    if (!id) return;
    this.post({ type: 'focusSession', id });
    this.acknowledgeVisibleSession();
  }

  dispose(): void {
    this.clearViewDisposables();
    for (const disposable of this.disposables.splice(0)) disposable.dispose();
    this.sessions.dispose();
  }

  private async handleMessage(message: WebviewMessage): Promise<void> {
    switch (message.type) {
      case 'ready':
        this.webviewReady = true;
        for (const waiter of [...this.readyWaiters]) waiter();
        this.lastSize = normalizeSize(message.cols, message.rows);
        this.postInitialize();
        if (!this.didAutoStart && this.sessions.count === 0 && shouldStartSessionOnOpen()) {
          this.didAutoStart = true;
          await this.createSession(false);
        }
        return;
      case 'input':
        this.sessions.write(message.id, message.data);
        return;
      case 'resize':
        this.lastSize = normalizeSize(message.cols, message.rows);
        this.sessions.resize(message.id, this.lastSize);
        return;
      case 'newSession':
        await this.createSession(message.chooseCwd);
        return;
      case 'switchSession':
        this.sessions.activate(message.id);
        this.post({ type: 'focusSession', id: message.id });
        this.acknowledgeVisibleSession();
        return;
      case 'renameSession':
        this.sessions.rename(message.id, message.name);
        return;
      case 'closeSession':
        this.sessions.close(message.id);
        return;
      case 'restartSession':
        await this.restartSession(message.id);
        return;
      case 'status':
        this.sessions.setDetectedStatus(
          message.id,
          message.status,
          message.attention,
          message.detail
        );
        return;
      case 'focusChanged':
        if (message.focused) this.acknowledgeVisibleSession();
        return;
      case 'clipboardRead': {
        const text = await vscode.env.clipboard.readText();
        this.post({ type: 'clipboardText', requestId: message.requestId, text });
        return;
      }
      case 'clipboardWrite':
        await vscode.env.clipboard.writeText(message.text);
        return;
    }
  }

  private handleStateChanged(): void {
    this.post({
      type: 'state',
      sessions: this.sessions.snapshots(),
      activeId: this.sessions.getActiveId()
    });
    this.updateBadge();
  }

  private handleAttention(event: SessionAttention): void {
    this.notifier.handle(event);
    this.updateBadge();
  }

  private postInitialize(): void {
    this.post({
      type: 'initialize',
      sessions: this.sessions.snapshots(),
      activeId: this.sessions.getActiveId(),
      replays: this.sessions.replays(),
      terminalSettings: getTerminalSettings(),
      platform: process.platform
    });
    const activeId = this.sessions.getActiveId();
    if (activeId) this.post({ type: 'focusSession', id: activeId });
  }

  private post(message: HostMessage): void {
    if (!this.webviewReady || !this.view) return;
    void this.view.webview.postMessage(message);
  }

  private acknowledgeVisibleSession(): void {
    if (!this.viewVisible || !this.windowFocused) return;
    const id = this.sessions.getActiveId();
    if (id) this.sessions.acknowledge(id);
  }

  private updateBadge(): void {
    if (!this.view) return;
    const count = this.sessions.snapshots().filter((session) => session.unread).length;
    this.view.badge = count > 0 ? { value: count, tooltip: `${count} 个会话需要处理` } : undefined;
  }

  private async revealSession(id: string): Promise<void> {
    this.sessions.activate(id);
    await this.show();
    this.post({ type: 'focusSession', id });
    this.acknowledgeVisibleSession();
  }

  private async ensureLaunchCommand(): Promise<boolean> {
    if (getLaunchCommand()) return true;
    return (await this.configureLaunchCommand(false)) !== undefined;
  }

  private async restartSession(id: string): Promise<void> {
    if (!(await this.ensureLaunchCommand())) return;
    this.sessions.restart(id);
  }

  private async show(): Promise<void> {
    if (this.view) {
      this.view.show(false);
      return;
    }
    await vscode.commands.executeCommand(`${VIEW_ID}.focus`);
  }

  private waitForWebviewReady(): Promise<void> {
    if (this.webviewReady) return Promise.resolve();
    return new Promise((resolve) => {
      let timer: NodeJS.Timeout;
      const finish = (): void => {
        clearTimeout(timer);
        this.readyWaiters.delete(finish);
        resolve();
      };
      timer = setTimeout(finish, 2000);
      this.readyWaiters.add(finish);
    });
  }

  private defaultWorkingDirectory(): string {
    const candidate = this.defaultWorkingDirectoryUri().fsPath;
    return candidate && fs.existsSync(candidate) ? candidate : os.homedir();
  }

  private defaultWorkingDirectoryUri(): vscode.Uri {
    const activeUri = vscode.window.activeTextEditor?.document.uri;
    const activeFolder = activeUri ? vscode.workspace.getWorkspaceFolder(activeUri) : undefined;
    return activeFolder?.uri ?? vscode.workspace.workspaceFolders?.[0]?.uri ?? vscode.Uri.file(os.homedir());
  }

  private async pickWorkingDirectory(): Promise<string | undefined> {
    const items: CwdPickItem[] = (vscode.workspace.workspaceFolders ?? []).map((folder) => ({
      label: `$(root-folder) ${folder.name}`,
      description: folder.uri.fsPath,
      path: folder.uri.fsPath
    }));
    if (items.length > 0) items.push({ label: '', kind: vscode.QuickPickItemKind.Separator });
    items.push(
      { label: '$(home) Home', description: os.homedir(), path: os.homedir() },
      { label: '$(folder-opened) 浏览…', browse: true }
    );
    const selected = await vscode.window.showQuickPick(items, {
      title: '选择 Agent 工作目录',
      placeHolder: '会话会在 workspace extension host 上从此目录启动'
    });
    if (!selected) return undefined;
    if (selected.path) return selected.path;
    if (!selected.browse) return undefined;
    const picked = await vscode.window.showOpenDialog({
      title: '选择 Agent 工作目录',
      defaultUri: this.defaultWorkingDirectoryUri(),
      canSelectFiles: false,
      canSelectFolders: true,
      canSelectMany: false,
      openLabel: '在此目录中新建'
    });
    return picked?.[0]?.fsPath;
  }

  private clearViewDisposables(): void {
    for (const disposable of this.viewDisposables.splice(0)) disposable.dispose();
  }
}

function normalizeSize(cols: number, rows: number): { cols: number; rows: number } {
  return {
    cols: Number.isFinite(cols) ? Math.max(2, Math.floor(cols)) : 80,
    rows: Number.isFinite(rows) ? Math.max(2, Math.floor(rows)) : 24
  };
}
