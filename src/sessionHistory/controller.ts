import * as vscode from 'vscode';
import { getSessionHistoryConfig } from '../config';
import { createSessionHistoryRegistry } from './createRegistry';
import type { HistoricalSession, SessionLaunchMode } from './types';

export interface HistoricalSessionLaunch {
  cwd: string;
  name: string;
  launchCommand: string;
  canRestart: boolean;
}

interface HistoryPickItem extends vscode.QuickPickItem {
  session: HistoricalSession;
}

interface ModePickItem extends vscode.QuickPickItem {
  mode: SessionLaunchMode;
}

export class SessionHistoryController {
  constructor(
    private readonly launch: (options: HistoricalSessionLaunch) => Promise<void>
  ) {}

  async open(): Promise<void> {
    const workspaceRoots = (vscode.workspace.workspaceFolders ?? []).map(
      (folder) => folder.uri.fsPath
    );
    if (workspaceRoots.length === 0) {
      void vscode.window.showInformationMessage(
        vscode.l10n.t('Open a workspace before reading Agent session history.')
      );
      return;
    }

    const config = getSessionHistoryConfig();
    const registry = createSessionHistoryRegistry();
    const discovery = await vscode.window.withProgress(
      {
        location: vscode.ProgressLocation.Window,
        title: vscode.l10n.t('Scanning Agent sessions in the current workspace…')
      },
      () => registry.discover(workspaceRoots, config.maxResults)
    );
    if (discovery.sessions.length === 0) {
      const failed = discovery.failedProviders.length
        ? vscode.l10n.t(' (failed to read: {0})', discovery.failedProviders.join(', '))
        : '';
      void vscode.window.showInformationMessage(
        vscode.l10n.t('No restorable Agent sessions were found in the current workspace{0}', failed)
      );
      return;
    }

    const selected = await vscode.window.showQuickPick(
      discovery.sessions.map<HistoryPickItem>((session) => ({
        label: `$(history) ${session.title}`,
        description: `${session.providerName} · ${formatUpdatedAt(session.updatedAt)}`,
        detail: `${session.cwd} · ${session.sessionId}`,
        session
      })),
      {
        title: vscode.l10n.t('Launch from Agent Session History in the Current Workspace'),
        placeHolder: vscode.l10n.t('Choose a Codex or Claude Code session'),
        matchOnDescription: true,
        matchOnDetail: true
      }
    );
    if (!selected) return;

    const actions: ModePickItem[] = [
      {
        label: '$(debug-continue) Resume',
        description: vscode.l10n.t('Continue the original session; it can be restarted after the terminal closes.'),
        mode: 'resume'
      }
    ];
    if (selected.session.supportsFork) {
      actions.push({
        label: '$(git-branch) Fork',
        description: vscode.l10n.t('Derive a new session from the old context. This launch can run only once.'),
        mode: 'fork'
      });
    }
    const action = await vscode.window.showQuickPick(actions, {
      title: `${selected.session.providerName}: ${selected.session.title}`,
      placeHolder: vscode.l10n.t('Choose a recovery method')
    });
    if (!action) return;

    await this.launch({
      cwd: selected.session.cwd,
      name: `${action.mode === 'fork' ? 'Fork' : selected.session.providerName}: ${selected.session.title}`,
      launchCommand: registry.buildLaunchCommand(selected.session, action.mode),
      canRestart: action.mode === 'resume'
    });
  }
}

function formatUpdatedAt(timestamp: number): string {
  const elapsedMinutes = Math.round((timestamp - Date.now()) / 60_000);
  const formatter = new Intl.RelativeTimeFormat(vscode.env.language, { numeric: 'auto' });
  if (Math.abs(elapsedMinutes) < 60) return formatter.format(elapsedMinutes, 'minute');
  const elapsedHours = Math.round(elapsedMinutes / 60);
  if (Math.abs(elapsedHours) < 48) return formatter.format(elapsedHours, 'hour');
  const elapsedDays = Math.round(elapsedHours / 24);
  if (Math.abs(elapsedDays) < 60) return formatter.format(elapsedDays, 'day');
  return new Date(timestamp).toLocaleDateString(vscode.env.language);
}
