import * as vscode from 'vscode';
import type { PtySize } from './ptyHost';
import type { SessionManager } from './sessionManager';
import type { SessionHistoryRegistry } from './sessionHistory/registry';
import type { HistoricalSession } from './sessionHistory/types';
import {
  WorkspaceSessionRestore,
  type WorkspaceRestoreEntry
} from './workspaceSessionRestore';

export interface WorkspaceRestoreLaunchContext {
  restore: WorkspaceSessionRestore;
  registry: SessionHistoryRegistry;
  sessions: SessionManager;
  size: PtySize;
  prepareView(): Promise<void>;
  reveal(id: string | undefined): Promise<void>;
}

export async function launchWorkspaceRestore(
  context: WorkspaceRestoreLaunchContext
): Promise<number> {
  const entries = context.restore.takePending();
  if (entries.length === 0) return 0;
  await context.prepareView();

  const failed: WorkspaceRestoreEntry[] = [];
  let activeId: string | undefined;
  let restored = 0;
  for (const entry of entries) {
    try {
      const id = context.sessions.create(entry.cwd, context.size, {
        name: entry.name,
        launchCommand: context.registry.buildLaunchCommand(toHistoricalSession(entry), 'resume'),
        canRestart: true,
        windowRestoreEligible: true,
        resumeIdentity: entry
      });
      restored++;
      if (entry.isActive) activeId = id;
    } catch {
      failed.push(entry);
    }
  }
  if (failed.length > 0) context.restore.requeue(failed);
  if (activeId) context.sessions.activate(activeId);
  await context.reveal(activeId ?? context.sessions.getActiveId());

  if (restored > 0) {
    void vscode.window.showInformationMessage(`已恢复上次窗口的 ${restored} 个 Agent 会话。`);
  }
  if (failed.length > 0) {
    void vscode.window.showWarningMessage(
      `${failed.length} 个会话缺少可用的 Provider Resume 支持，已保留在恢复列表中。`
    );
  }
  return restored;
}

function toHistoricalSession(entry: WorkspaceRestoreEntry): HistoricalSession {
  return {
    providerId: entry.providerId,
    providerName: entry.providerName,
    sessionId: entry.sessionId,
    cwd: entry.cwd,
    title: entry.name,
    updatedAt: entry.updatedAt,
    supportsFork: false
  };
}
