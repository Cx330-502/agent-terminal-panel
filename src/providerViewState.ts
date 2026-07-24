import * as vscode from 'vscode';
import type { ClosedSessionRecovery } from './closedSessionRecovery';
import {
  getLayoutSettings,
  getLaunchProfiles,
  getTerminalSettings
} from './config';
import type { SessionManager } from './sessionManager';
import type { HostMessage } from './shared';
import type { WorkspaceSessionRestore } from './workspaceSessionRestore';

export interface ProviderEventCallbacks {
  post(message: HostMessage): void;
  windowFocusChanged(focused: boolean): void;
  refreshCommunicationHealth(): void;
}

export function registerProviderEvents(
  callbacks: ProviderEventCallbacks
): vscode.Disposable[] {
  return [
    vscode.window.onDidChangeWindowState((state) => {
      callbacks.windowFocusChanged(state.focused);
    }),
    vscode.window.onDidChangeActiveColorTheme(() => callbacks.post({ type: 'refreshTheme' })),
    vscode.workspace.onDidChangeConfiguration((event) => {
      if (
        event.affectsConfiguration('terminal.integrated') ||
        event.affectsConfiguration('agentTerminalPanel.terminalImages.enabled')
      ) {
        callbacks.post({ type: 'terminalSettings', settings: getTerminalSettings() });
      }
      if (event.affectsConfiguration('agentTerminalPanel.sessionListPosition')) {
        callbacks.post({ type: 'layoutSettings', settings: getLayoutSettings() });
      }
      if (
        event.affectsConfiguration('agentTerminalPanel.launchCommands') ||
        event.affectsConfiguration('agentTerminalPanel.launchProfiles')
      ) {
        callbacks.post({ type: 'launchProfiles', profiles: getLaunchProfiles() });
      }
      if (event.affectsConfiguration('agentTerminalPanel.communicationHealth')) {
        callbacks.refreshCommunicationHealth();
      }
    })
  ];
}

export function createProviderInitializeMessage(
  sessions: SessionManager,
  workspaceRestore: WorkspaceSessionRestore,
  closedSessions: ClosedSessionRecovery
): HostMessage {
  return {
    type: 'initialize',
    sessions: sessions.snapshots(),
    activeId: sessions.getActiveId(),
    replays: sessions.replays(),
    terminalSettings: getTerminalSettings(),
    layoutSettings: getLayoutSettings(),
    launchProfiles: getLaunchProfiles(),
    workspaceRestore: workspaceRestore.summary(),
    closedSessions: closedSessions.summary(),
    platform: process.platform
  };
}

export function updateViewBadge(
  view: vscode.WebviewView | undefined,
  sessions: SessionManager
): void {
  if (!view) return;
  const count = sessions.snapshots().filter((session) => session.unread).length;
  view.badge = count > 0
    ? { value: count, tooltip: vscode.l10n.t('{0} sessions need attention', count) }
    : undefined;
}
