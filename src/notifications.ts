import * as vscode from 'vscode';
import { getNotificationConfig } from './config';
import {
  isSessionVisible,
  shouldPlayCompletionSound,
  shouldShowToast
} from './notificationPolicy';
import type { SessionAttention } from './sessionManager';

export interface NotificationCallbacks {
  isActiveSession(id: string): boolean;
  isViewVisible(): boolean;
  isWindowFocused(): boolean;
  setUnread(id: string, unread: boolean): void;
  reveal(id: string): void;
  playCompletionSound(): void;
}

export class CompletionNotifier {
  private readonly activeToasts = new Set<string>();

  constructor(private readonly callbacks: NotificationCallbacks) {}

  handle(event: SessionAttention): void {
    const visible = isSessionVisible({
      viewVisible: this.callbacks.isViewVisible(),
      windowFocused: this.callbacks.isWindowFocused(),
      isActiveSession: this.callbacks.isActiveSession(event.session.id)
    });
    this.callbacks.setUnread(event.session.id, !visible);

    const config = getNotificationConfig();
    if (
      event.session.status === 'completed' &&
      shouldPlayCompletionSound(config.completionSound, visible)
    ) {
      this.callbacks.playCompletionSound();
    }

    if (!shouldShowToast(config.showToast, visible) || this.activeToasts.has(event.key)) return;
    this.activeToasts.add(event.key);
    const message = notificationText(event);
    const openLabel = vscode.l10n.t('Open Session');
    void vscode.window.showInformationMessage(message, openLabel).then((action) => {
      this.activeToasts.delete(event.key);
      if (action) this.callbacks.reveal(event.session.id);
    });
  }
}

function notificationText(event: SessionAttention): string {
  if (event.session.status === 'approval') {
    return vscode.l10n.t('{0} is waiting for approval', event.session.name);
  }
  if (event.session.status === 'waiting') {
    return vscode.l10n.t('{0} is waiting for input', event.session.name);
  }
  if (event.detail?.startsWith('exit ')) {
    return vscode.l10n.t('{0} has exited', event.session.name);
  }
  return vscode.l10n.t('{0} has completed', event.session.name);
}
