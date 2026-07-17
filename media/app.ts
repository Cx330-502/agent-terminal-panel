import type { HostMessage, SessionSnapshot, VSCodeApi, WebviewMessage } from '../src/shared';
import { AttachmentController } from './attachmentController';
import { CommunicationIndicator } from './communicationIndicator';
import { hydrateIcons } from './icons';
import { SessionList, statusLabel } from './sessionList';
import { SidebarResize } from './sidebarResize';
import { StartupIndicator } from './startupIndicator';
import { TerminalController } from './terminalController';

export class WebviewApp {
  private readonly root: HTMLElement;
  private readonly terminalController: TerminalController;
  private readonly attachmentController: AttachmentController;
  private readonly sessionList: SessionList;
  private readonly sidebarResize: SidebarResize;
  private readonly startupIndicator: StartupIndicator;
  private readonly communicationIndicator: CommunicationIndicator;
  private readonly activeHeader = requiredElement<HTMLElement>('active-header');
  private readonly activeName = requiredElement<HTMLElement>('active-name');
  private readonly activeCwd = requiredElement<HTMLElement>('active-cwd');
  private readonly activeStatus = requiredElement<HTMLElement>('active-status');
  private readonly restartButton = requiredElement<HTMLButtonElement>('restart-session');
  private readonly emptyState = requiredElement<HTMLElement>('empty-state');
  private sessions: SessionSnapshot[] = [];
  private activeId: string | undefined;
  private audioContext: AudioContext | undefined;
  private lastSoundAt = 0;

  constructor(private readonly vscode: VSCodeApi) {
    hydrateIcons(document);
    this.root = requiredElement<HTMLElement>('app');
    const stack = requiredElement<HTMLElement>('terminal-stack');
    const splitter = requiredElement<HTMLElement>('session-splitter');
    this.terminalController = new TerminalController(stack, vscode);
    this.attachmentController = new AttachmentController(
      stack,
      requiredElement('attachment-overlay'),
      requiredElement('attachment-status'),
      vscode,
      (id, text) => this.terminalController.pasteText(id, text),
      (id) => this.terminalController.requestClipboardPaste(id)
    );
    this.sessionList = new SessionList(requiredElement('session-list'), {
      switchSession: (id) => {
        this.terminalController.activate(id);
        this.post({ type: 'switchSession', id });
      },
      renameSession: (id, name) => this.post({ type: 'renameSession', id, name }),
      closeSession: (id) => this.post({ type: 'closeSession', id })
    });
    this.sidebarResize = new SidebarResize(this.root, splitter, vscode);
    this.startupIndicator = new StartupIndicator(
      requiredElement('startup-overlay'),
      requiredElement('startup-title'),
      requiredElement('startup-detail')
    );
    this.communicationIndicator = new CommunicationIndicator(
      requiredElement('communication-summary'),
      requiredElement('communication-dot'),
      requiredElement('communication-health-full'),
      requiredElement('communication-health-compact'),
      requiredElement('communication-traffic'),
      requiredElement('communication-latency')
    );
    this.bindControls();
    this.bindWindowEvents();
  }

  start(): void {
    window.addEventListener('message', (event: MessageEvent<HostMessage>) => {
      this.handleHostMessage(event.data);
    });
    this.post({ type: 'ready', cols: 80, rows: 24 });
    this.reportFocus();
  }

  dispose(): void {
    this.attachmentController.dispose();
    this.startupIndicator.dispose();
    this.terminalController.dispose();
    void this.audioContext?.close();
  }

  private handleHostMessage(message: HostMessage): void {
    switch (message.type) {
      case 'initialize':
        this.applyLayoutSettings(message.layoutSettings.sessionListPosition);
        this.terminalController.initialize(message.terminalSettings, message.platform);
        this.applyState(message.sessions, message.activeId, message.replays);
        return;
      case 'state':
        this.applyState(message.sessions, message.activeId);
        return;
      case 'output':
        this.terminalController.write(message.id, message.data);
        return;
      case 'clear':
        this.terminalController.clear(message.id);
        return;
      case 'focusSession':
        this.terminalController.activate(message.id);
        return;
      case 'clipboardText':
        this.terminalController.receiveClipboardText(message.requestId, message.text);
        return;
      case 'attachmentResult':
        this.attachmentController.receiveResult(
          message.requestId,
          message.id,
          message.insertText,
          message.savedCount,
          message.errors
        );
        return;
      case 'terminalSettings':
        this.terminalController.updateSettings(message.settings);
        return;
      case 'layoutSettings':
        this.applyLayoutSettings(message.settings.sessionListPosition);
        return;
      case 'refreshTheme':
        this.terminalController.refreshTheme();
        return;
      case 'playCompletionSound':
        void this.playCompletionSound();
        return;
    }
  }

  private applyState(
    sessions: SessionSnapshot[],
    activeId: string | undefined,
    replays?: Record<string, string>
  ): void {
    this.sessions = sessions;
    this.activeId = activeId;
    this.attachmentController.setActiveId(activeId);
    this.sessionList.render(sessions);
    this.terminalController.syncSessions(sessions, activeId, replays);
    const active = sessions.find((session) => session.id === activeId);
    this.startupIndicator.render(active);
    this.communicationIndicator.render(active);
    this.renderActiveHeader();
    this.emptyState.hidden = sessions.length > 0;
  }

  private renderActiveHeader(): void {
    const active = this.sessions.find((session) => session.id === this.activeId);
    this.activeHeader.hidden = !active;
    if (!active) return;
    this.activeName.textContent = active.name;
    this.activeName.title = '双击重命名会话';
    this.activeCwd.textContent = active.cwd;
    this.activeCwd.title = active.cwd;
    this.activeStatus.className = `status-dot status-${active.status}`;
    this.activeHeader.classList.toggle(
      'communication-stalled',
      active.communication?.health === 'stalled'
    );
    this.activeStatus.title = statusLabel(active);
    this.restartButton.disabled = !active.canRestart;
    this.restartButton.title = active.canRestart
      ? '重启当前会话'
      : 'Fork 启动只执行一次；请从历史记录 Resume 新会话';
  }

  private bindControls(): void {
    requiredElement<HTMLButtonElement>('new-session').addEventListener('click', () => {
      this.post({ type: 'newSession', chooseCwd: false });
    });
    requiredElement<HTMLButtonElement>('new-session-folder').addEventListener('click', () => {
      this.post({ type: 'newSession', chooseCwd: true });
    });
    requiredElement<HTMLButtonElement>('new-custom-session').addEventListener('click', () => {
      this.post({ type: 'newCustomSession', chooseCwd: false });
    });
    requiredElement<HTMLButtonElement>('session-history').addEventListener('click', () => {
      this.post({ type: 'openSessionHistory' });
    });
    requiredElement<HTMLButtonElement>('pick-attachments').addEventListener('click', () => {
      this.attachmentController.pickFiles();
    });
    requiredElement<HTMLButtonElement>('empty-new-session').addEventListener('click', () => {
      this.post({ type: 'newSession', chooseCwd: false });
    });
    requiredElement<HTMLButtonElement>('empty-custom-session').addEventListener('click', () => {
      this.post({ type: 'newCustomSession', chooseCwd: false });
    });
    requiredElement<HTMLButtonElement>('empty-session-history').addEventListener('click', () => {
      this.post({ type: 'openSessionHistory' });
    });
    this.restartButton.addEventListener('click', () => {
      if (this.activeId) this.post({ type: 'restartSession', id: this.activeId });
    });
    requiredElement<HTMLButtonElement>('rename-active-session').addEventListener('click', () => {
      if (this.activeId) this.post({ type: 'promptRenameSession', id: this.activeId });
    });
    this.activeName.addEventListener('dblclick', () => {
      if (this.activeId) this.post({ type: 'promptRenameSession', id: this.activeId });
    });
  }

  private applyLayoutSettings(position: 'left' | 'right'): void {
    this.root.classList.toggle('session-list-right', position === 'right');
    this.sidebarResize.setPosition(position);
  }

  private bindWindowEvents(): void {
    window.addEventListener('focus', () => this.reportFocus());
    window.addEventListener('blur', () => this.reportFocus());
    document.addEventListener('visibilitychange', () => this.reportFocus());
  }

  private reportFocus(): void {
    this.post({
      type: 'focusChanged',
      focused: document.visibilityState === 'visible' && document.hasFocus()
    });
  }

  private async playCompletionSound(): Promise<void> {
    const now = performance.now();
    if (now - this.lastSoundAt < 800) return;
    this.lastSoundAt = now;
    const context = (this.audioContext ??= new AudioContext());
    if (context.state === 'suspended') await context.resume();
    const start = context.currentTime + 0.01;
    playTone(context, 523.25, start, 0.09);
    playTone(context, 659.25, start + 0.085, 0.12);
  }

  private post(message: WebviewMessage): void {
    this.vscode.postMessage(message);
  }
}

function playTone(context: AudioContext, frequency: number, start: number, duration: number): void {
  const oscillator = context.createOscillator();
  const gain = context.createGain();
  oscillator.type = 'sine';
  oscillator.frequency.setValueAtTime(frequency, start);
  gain.gain.setValueAtTime(0.0001, start);
  gain.gain.linearRampToValueAtTime(0.035, start + 0.012);
  gain.gain.exponentialRampToValueAtTime(0.0001, start + duration);
  oscillator.connect(gain);
  gain.connect(context.destination);
  oscillator.start(start);
  oscillator.stop(start + duration + 0.01);
}

function requiredElement<T extends HTMLElement = HTMLElement>(id: string): T {
  const element = document.getElementById(id);
  if (!element) throw new Error(`Missing webview element: ${id}`);
  return element as T;
}
