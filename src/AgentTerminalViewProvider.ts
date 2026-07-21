import * as vscode from 'vscode';
import { AttachmentController } from './attachmentController';
import { ClosedSessionRecovery } from './closedSessionRecovery';
import {
  getAgentProcessConfig,
  getCommunicationHealthConfig,
  getLayoutSettings,
  getLaunchCommand,
  getLaunchProfiles,
  getTerminalSettings,
  shouldStartSessionOnOpen
} from './config';
import { promptCustomSessionOptions } from './customSessionPrompt';
import { configureDefaultLaunchCommand } from './defaultLaunchCommand';
import { CompletionNotifier } from './notifications';
import { normalizePtySize } from './ptySize';
import { createSessionHistoryRegistry } from './sessionHistory/createRegistry';
import {
  SessionHistoryController,
  type HistoricalSessionLaunch
} from './sessionHistory/controller';
import {
  SessionManager,
  type ClosedSessionState,
  type SessionCreateOptions,
  type SessionAttention,
  type SessionStartupTiming
} from './sessionManager';
import type { HostMessage, WebviewMessage } from './shared';
import { promptSessionRename } from './sessionRename';
import { StartupLogger } from './startupLogger';
import { WebviewReadyBarrier } from './webviewReadyBarrier';
import { handleWebviewUtilityMessage } from './webviewUtilityMessages';
import { getWebviewHtml } from './webviewHtml';
import { defaultWorkingDirectory, pickWorkingDirectory } from './workingDirectory';
import {
  detectLaunchProvider,
  WorkspaceSessionRestore
} from './workspaceSessionRestore';
import { launchWorkspaceRestore } from './workspaceSessionRestoreLaunch';

export const VIEW_ID = 'agentTerminalPanel.terminalView';
export class AgentTerminalViewProvider implements vscode.WebviewViewProvider, vscode.Disposable {
  private readonly disposables: vscode.Disposable[] = [];
  private readonly viewDisposables: vscode.Disposable[] = [];
  private readonly readyBarrier = new WebviewReadyBarrier();
  private readonly sessions: SessionManager;
  private readonly notifier: CompletionNotifier;
  private readonly sessionHistory: SessionHistoryController;
  private readonly workspaceRestore: WorkspaceSessionRestore;
  private readonly sessionRegistry = createSessionHistoryRegistry();
  private readonly attachments: AttachmentController;
  private readonly closedSessions: ClosedSessionRecovery;
  private readonly startupLogger = new StartupLogger();
  private view: vscode.WebviewView | undefined;
  private webviewReady = false;
  private viewVisible = false;
  private windowFocused = vscode.window.state.focused;
  private didAutoStart = false;
  private lastSize = { cols: 80, rows: 24 };

  constructor(
    private readonly extensionUri: vscode.Uri,
    private readonly extensionId: string,
    storageUri: vscode.Uri | undefined,
    globalStorageUri: vscode.Uri,
    workspaceState: vscode.Memento
  ) {
    this.attachments = new AttachmentController(
      storageUri ?? globalStorageUri,
      (message) => this.post(message)
    );
    this.sessions = new SessionManager(getAgentProcessConfig, getCommunicationHealthConfig, {
      onOutput: (id, data) => this.post({ type: 'output', id, data }),
      onClear: (id) => this.post({ type: 'clear', id }),
      onStateChanged: () => this.handleStateChanged(),
      onAttention: (event) => this.handleAttention(event),
      onStartupTiming: (event) => this.handleStartupTiming(event)
    });
    this.closedSessions = new ClosedSessionRecovery(
      (session) => this.reopenClosedSessionState(session),
      (closedSessions) => this.post({ type: 'closedSessions', closedSessions })
    );
    this.notifier = new CompletionNotifier({
      isActiveSession: (id) => this.sessions.getActiveId() === id,
      isViewVisible: () => this.viewVisible,
      isWindowFocused: () => this.windowFocused,
      setUnread: (id, unread) => this.sessions.setUnread(id, unread),
      reveal: (id) => void this.revealSession(id),
      playCompletionSound: () => this.post({ type: 'playCompletionSound' })
    });
    this.sessionHistory = new SessionHistoryController((options) =>
      this.launchHistoricalSession(options)
    );
    this.workspaceRestore = new WorkspaceSessionRestore(
      workspaceState,
      (vscode.workspace.workspaceFolders ?? []).map((folder) => folder.uri.fsPath),
      this.sessionRegistry,
      {
        onIdentity: (id, identity) => this.sessions.setResumeIdentity(id, identity),
        onPendingChanged: () => this.postWorkspaceRestore()
      }
    );

    this.disposables.push(
      this.startupLogger,
      this.closedSessions,
      this.workspaceRestore,
      vscode.window.onDidChangeWindowState((state) => {
        this.windowFocused = state.focused;
        if (state.focused) this.acknowledgeVisibleSession();
      }),
      vscode.window.onDidChangeActiveColorTheme(() => this.post({ type: 'refreshTheme' })),
      vscode.workspace.onDidChangeConfiguration((event) => {
        if (event.affectsConfiguration('terminal.integrated')) {
          this.post({ type: 'terminalSettings', settings: getTerminalSettings() });
        }
        if (event.affectsConfiguration('agentTerminalPanel.terminalImages.enabled')) {
          this.post({ type: 'terminalSettings', settings: getTerminalSettings() });
        }
        if (event.affectsConfiguration('agentTerminalPanel.sessionListPosition')) {
          this.post({ type: 'layoutSettings', settings: getLayoutSettings() });
        }
        if (event.affectsConfiguration('agentTerminalPanel.launchProfiles'))
          this.post({ type: 'launchProfiles', profiles: getLaunchProfiles() });
        if (event.affectsConfiguration('agentTerminalPanel.communicationHealth')) {
          this.sessions.refreshCommunicationHealth();
        }
      })
    );
  }

  resolveWebviewView(webviewView: vscode.WebviewView): void {
    this.startupLogger.beginWebviewResolve();
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
    return this.createSessionWithOptions(chooseCwd, { windowRestoreEligible: true });
  }
  async createCustomSession(chooseCwd = false): Promise<string | undefined> {
    const options = await promptCustomSessionOptions();
    return options ? this.createSessionWithOptions(chooseCwd, options) : undefined;
  }
  async createProfileSession(id: string): Promise<string | undefined> {
    const profile = getLaunchProfiles().find((item) => item.id === id);
    if (!profile) return undefined;
    return this.createSessionWithOptions(false, { name: profile.name, launchCommand: profile.command });
  }
  async showNewSessionMenu(): Promise<void> {
    await this.show();
    await this.waitForWebviewReady();
    this.post({ type: 'openLaunchMenu' });
  }
  async showSearch(): Promise<void> {
    await this.show();
    await this.waitForWebviewReady();
    this.post({ type: 'openSearch' });
  }
  async openSessionHistory(): Promise<void> {
    await this.sessionHistory.open();
  }
  async restoreWorkspaceSessions(): Promise<void> {
    if (!this.workspaceRestore.hasPending) return;
    this.didAutoStart = true;
    await launchWorkspaceRestore({
      restore: this.workspaceRestore,
      registry: this.sessionRegistry,
      sessions: this.sessions,
      size: this.lastSize,
      prepareView: () => this.prepareView(),
      reveal: (id) => this.revealRestoredSession(id)
    });
  }

  dismissWorkspaceRestore(): void {
    this.workspaceRestore.dismissPending();
  }

  private async createSessionWithOptions(
    chooseCwd: boolean,
    options: SessionCreateOptions = {}
  ): Promise<string | undefined> {
    const cwd = chooseCwd ? await pickWorkingDirectory() : defaultWorkingDirectory();
    if (!cwd) return undefined;
    return this.createSessionAt(cwd, options);
  }

  private async createSessionAt(
    cwd: string,
    options: SessionCreateOptions = {}
  ): Promise<string> {
    this.didAutoStart = true;
    if (!this.webviewReady) {
      await this.show();
      await this.waitForWebviewReady();
    }
    const id = this.sessions.create(cwd, this.lastSize, options);
    const restorable = this.sessions.restorableSession(id);
    const providerId = detectLaunchProvider(getLaunchCommand());
    if (restorable && !restorable.identity && !options.launchCommand && providerId) {
      this.workspaceRestore.trackDefaultSession(restorable, providerId);
    }
    await this.show();
    this.post({ type: 'focusSession', id });
    this.acknowledgeVisibleSession();
    return id;
  }

  closeActiveSession(): void {
    const id = this.sessions.getActiveId();
    if (id) this.closeSession(id);
  }

  async reopenClosedSession(): Promise<boolean> {
    return this.closedSessions.reopenLatest();
  }

  activeSessionForInbox(): { id: string; name: string } | undefined {
    const session = this.sessions.getActive();
    return session ? { id: session.id, name: session.name } : undefined;
  }

  insertIntoSession(id: string, text: string): boolean {
    if (!this.sessions.get(id)) return false;
    this.sessions.activate(id);
    this.sessions.write(id, text);
    void this.show().then(() => this.post({ type: 'focusSession', id }));
    return true;
  }

  async restartActiveSession(): Promise<void> {
    const id = this.sessions.getActiveId();
    if (id) await this.restartSession(id);
  }

  openSettings(): void {
    void vscode.commands.executeCommand('workbench.action.openSettings', `@ext:${this.extensionId}`);
  }

  async configureLaunchCommand(showConfirmation = true): Promise<string | undefined> {
    return configureDefaultLaunchCommand(showConfirmation);
  }

  async renameActiveSession(): Promise<void> {
    const session = this.sessions.getActive();
    if (!session) return;
    await this.renameSession(session.id);
  }

  private async renameSession(id: string): Promise<void> {
    const session = this.sessions.get(id);
    if (!session) return;
    const name = await promptSessionRename(session.name);
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
    if (await handleWebviewUtilityMessage(message, {
      hasSession: (id) => Boolean(this.sessions.get(id)),
      attachments: this.attachments,
      post: (hostMessage) => this.post(hostMessage)
    })) return;
    switch (message.type) {
      case 'ready':
        this.webviewReady = true;
        this.startupLogger.webviewReady();
        this.readyBarrier.resolve();
        this.lastSize = normalizePtySize(message.cols, message.rows);
        this.postInitialize();
        if (
          !this.didAutoStart &&
          this.sessions.count === 0 &&
          !this.workspaceRestore.hasPending &&
          shouldStartSessionOnOpen()
        ) {
          this.didAutoStart = true;
          await this.createSession(false);
        }
        return;
      case 'input':
        this.sessions.write(message.id, message.data);
        return;
      case 'resize':
        this.lastSize = normalizePtySize(message.cols, message.rows);
        this.sessions.resize(message.id, this.lastSize);
        return;
      case 'newSession':
        await this.createSession(message.chooseCwd);
        return;
      case 'newProfileSession':
        await this.createProfileSession(message.id);
        return;
      case 'newCustomSession':
        await this.createCustomSession(message.chooseCwd);
        return;
      case 'openSessionHistory':
        await this.openSessionHistory();
        return;
      case 'openSettings':
        this.openSettings();
        return;
      case 'restoreWorkspaceSessions':
        await this.restoreWorkspaceSessions();
        return;
      case 'dismissWorkspaceRestore':
        this.dismissWorkspaceRestore();
        return;
      case 'switchSession':
        this.sessions.activate(message.id);
        this.post({ type: 'focusSession', id: message.id });
        this.acknowledgeVisibleSession();
        return;
      case 'renameSession':
        this.sessions.rename(message.id, message.name);
        return;
      case 'promptRenameSession':
        await this.renameSession(message.id);
        return;
      case 'closeSession':
        this.closeSession(message.id);
        return;
      case 'reopenClosedSession':
        await this.reopenClosedSession();
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
    }
  }

  private handleStateChanged(): void {
    this.workspaceRestore.syncCurrent(this.sessions.restorableSessions());
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

  private handleStartupTiming(event: SessionStartupTiming): void {
    this.startupLogger.sessionTiming(event);
  }

  private postInitialize(): void {
    this.post({
      type: 'initialize',
      sessions: this.sessions.snapshots(),
      activeId: this.sessions.getActiveId(),
      replays: this.sessions.replays(),
      terminalSettings: getTerminalSettings(),
      layoutSettings: getLayoutSettings(),
      launchProfiles: getLaunchProfiles(),
      workspaceRestore: this.workspaceRestore.summary(),
      closedSessions: this.closedSessions.summary(),
      platform: process.platform
    });
    const activeId = this.sessions.getActiveId();
    if (activeId) this.post({ type: 'focusSession', id: activeId });
  }

  private post(message: HostMessage): void {
    if (!this.webviewReady || !this.view) return;
    void this.view.webview.postMessage(message);
  }

  private postWorkspaceRestore(): void {
    this.post({ type: 'workspaceRestore', restore: this.workspaceRestore.summary() });
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

  private closeSession(id: string): void {
    this.closedSessions.remember(this.sessions.close(id));
  }

  private async reopenClosedSessionState(session: ClosedSessionState): Promise<boolean> {
    if (!session.options.launchCommand && !(await this.ensureLaunchCommand())) return false;
    await this.createSessionAt(session.cwd, session.options);
    return true;
  }

  private async restartSession(id: string): Promise<void> {
    if (this.sessions.get(id)?.canRestart === false) {
      void vscode.window.showInformationMessage(
        'Fork 启动只执行一次。请从历史会话中 Resume 新生成的会话，避免重复 Fork。'
      );
      return;
    }
    const usesDefaultCommand = this.sessions.requiresDefaultLaunchCommand(id);
    if (usesDefaultCommand && !(await this.ensureLaunchCommand())) return;
    if (usesDefaultCommand) this.sessions.clearResumeIdentity(id);
    const startedAt = this.sessions.restart(id);
    const restorable = this.sessions.restorableSession(id);
    const providerId = detectLaunchProvider(getLaunchCommand());
    if (usesDefaultCommand && startedAt !== undefined && restorable && providerId) {
      this.workspaceRestore.trackDefaultSession(
        { ...restorable, startedAt },
        providerId
      );
    }
  }

  private async launchHistoricalSession(options: HistoricalSessionLaunch): Promise<void> {
    this.didAutoStart = true;
    if (!this.webviewReady) {
      await this.show();
      await this.waitForWebviewReady();
    }
    const id = this.sessions.create(options.cwd, this.lastSize, options);
    await this.show();
    this.post({ type: 'focusSession', id });
    this.acknowledgeVisibleSession();
  }

  private async prepareView(): Promise<void> {
    if (this.webviewReady) return;
    await this.show();
    await this.waitForWebviewReady();
  }

  private async revealRestoredSession(id: string | undefined): Promise<void> {
    await this.show();
    if (id) this.post({ type: 'focusSession', id });
    this.acknowledgeVisibleSession();
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
    return this.readyBarrier.wait((timeoutMs) =>
      this.startupLogger.webviewReadyTimeout(timeoutMs)
    );
  }

  private clearViewDisposables(): void {
    for (const disposable of this.viewDisposables.splice(0)) disposable.dispose();
  }
}
