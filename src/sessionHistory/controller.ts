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
      void vscode.window.showInformationMessage('请先打开一个 workspace，再读取 Agent 历史会话。');
      return;
    }

    const config = getSessionHistoryConfig();
    const registry = createSessionHistoryRegistry();
    const discovery = await vscode.window.withProgress(
      { location: vscode.ProgressLocation.Window, title: '扫描当前 workspace 的 Agent 会话…' },
      () => registry.discover(workspaceRoots, config.maxResults)
    );
    if (discovery.sessions.length === 0) {
      const failed = discovery.failedProviders.length
        ? `（读取失败：${discovery.failedProviders.join('、')}）`
        : '';
      void vscode.window.showInformationMessage(`当前 workspace 没有可恢复的 Agent 会话${failed}`);
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
        title: '从当前 workspace 的 Agent 历史会话启动',
        placeHolder: '选择 Codex 或 Claude Code 会话',
        matchOnDescription: true,
        matchOnDetail: true
      }
    );
    if (!selected) return;

    const actions: ModePickItem[] = [
      {
        label: '$(debug-continue) Resume',
        description: '继续原会话；终端关闭后可重启同一会话',
        mode: 'resume'
      }
    ];
    if (selected.session.supportsFork) {
      actions.push({
        label: '$(git-branch) Fork',
        description: '从旧上下文派生新会话；该启动动作只允许执行一次',
        mode: 'fork'
      });
    }
    const action = await vscode.window.showQuickPick(actions, {
      title: `${selected.session.providerName}: ${selected.session.title}`,
      placeHolder: '选择恢复方式'
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
  const formatter = new Intl.RelativeTimeFormat('zh-CN', { numeric: 'auto' });
  if (Math.abs(elapsedMinutes) < 60) return formatter.format(elapsedMinutes, 'minute');
  const elapsedHours = Math.round(elapsedMinutes / 60);
  if (Math.abs(elapsedHours) < 48) return formatter.format(elapsedHours, 'hour');
  const elapsedDays = Math.round(elapsedHours / 24);
  if (Math.abs(elapsedDays) < 60) return formatter.format(elapsedDays, 'day');
  return new Date(timestamp).toLocaleDateString('zh-CN');
}
