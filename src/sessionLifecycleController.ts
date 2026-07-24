import * as vscode from 'vscode';
import type { SessionHistoryRegistry } from './sessionHistory/registry';
import {
  type ClosedSessionState,
  type SessionCreateOptions,
  SessionManager
} from './sessionManager';
import type { SessionRestartMode } from './shared';
import { detectLaunchProvider } from './workspaceSessionRestore';

interface SessionLifecycleContext {
  sessions: SessionManager;
  registry: SessionHistoryRegistry;
  ensureLaunchCommand(): Promise<boolean>;
  currentDefaultLaunchCommand(): string;
  createSessionAt(cwd: string, options: SessionCreateOptions): Promise<string>;
  trackProviderSession(id: string, providerId: string | undefined, startedAt?: number): void;
}

export class SessionLifecycleController {
  private readonly renameSyncs = new Map<string, Promise<void>>();

  constructor(private readonly context: SessionLifecycleContext) {}

  async reopenClosedSession(session: ClosedSessionState): Promise<boolean> {
    let options = session.options;
    if (options.resumeIdentity) {
      try {
        options = {
          ...options,
          launchCommand: this.context.registry.buildLaunchCommand(
            options.resumeIdentity,
            'resume'
          ),
          launchSource: 'historyResume',
          canRerun: true
        };
      } catch (error) {
        void vscode.window.showWarningMessage(
          vscode.l10n.t(
            'Unable to continue the closed Provider session: {0}',
            errorMessage(error)
          )
        );
        return false;
      }
    } else if (!options.launchCommand && !(await this.context.ensureLaunchCommand())) {
      return false;
    }
    await this.context.createSessionAt(session.cwd, options);
    return true;
  }

  async restart(id: string, mode: SessionRestartMode): Promise<void> {
    if (mode !== 'continue' && mode !== 'rerun') return;
    const session = this.context.sessions.get(id);
    if (!session) return;
    if (mode === 'continue') {
      const provider = this.context.sessions.providerSession(id);
      if (!provider) {
        void vscode.window.showInformationMessage(
          vscode.l10n.t('This terminal is not linked to a resumable Provider session yet.')
        );
        return;
      }
      try {
        const command = this.context.registry.buildLaunchCommand(provider.identity, 'resume');
        this.context.sessions.restart(id, command);
      } catch (error) {
        void vscode.window.showWarningMessage(
          vscode.l10n.t('Unable to continue the Provider session: {0}', errorMessage(error))
        );
      }
      return;
    }

    if (!session.canRerun) {
      void vscode.window.showInformationMessage(
        vscode.l10n.t(
          'A Fork launch runs only once. Resume the newly generated session from history to avoid repeating the Fork.'
        )
      );
      return;
    }
    const usesDefaultCommand = this.context.sessions.requiresDefaultLaunchCommand(id);
    if (usesDefaultCommand && !(await this.context.ensureLaunchCommand())) return;
    const startsNewProviderSession = session.launchSource === 'default'
      || session.launchSource === 'profile'
      || session.launchSource === 'custom';
    if (startsNewProviderSession) this.context.sessions.clearResumeIdentity(id);
    const startedAt = this.context.sessions.restart(id);
    if (startedAt === undefined || !startsNewProviderSession) return;
    const command = usesDefaultCommand
      ? this.context.currentDefaultLaunchCommand()
      : this.context.sessions.savedLaunchCommand(id);
    this.context.trackProviderSession(id, detectLaunchProvider(command ?? ''), startedAt);
  }

  async rename(id: string, name: string): Promise<void> {
    if (!this.context.sessions.rename(id, name)) return;
    await this.syncProviderName(id, true);
  }

  syncProviderName(id: string, notify: boolean): Promise<void> {
    const previous = this.renameSyncs.get(id) ?? Promise.resolve();
    const task = previous
      .catch(() => undefined)
      .then(() => this.syncProviderNameNow(id, notify));
    this.renameSyncs.set(id, task);
    void task
      .finally(() => {
        if (this.renameSyncs.get(id) === task) this.renameSyncs.delete(id);
      })
      .catch(() => undefined);
    return task;
  }

  private async syncProviderNameNow(id: string, notify: boolean): Promise<void> {
    const request = this.context.sessions.providerRenameRequest(id);
    if (!request) {
      if (notify) {
        void vscode.window.setStatusBarMessage(
          vscode.l10n.t('Renamed the Agent Terminal Panel session.'),
          2_500
        );
      }
      return;
    }
    try {
      const synced = await this.context.registry.renameSession(
        request.identity,
        request.cwd,
        request.name
      );
      this.context.sessions.completeProviderRename(id, request.name);
      if (!notify) return;
      void vscode.window.setStatusBarMessage(
        synced
          ? vscode.l10n.t(
              'Renamed the panel session and synced it to {0}.',
              request.identity.providerName
            )
          : vscode.l10n.t(
              'Renamed the panel session; this Provider has no name-sync adapter.'
            ),
        3_000
      );
    } catch (error) {
      this.context.sessions.completeProviderRename(id, request.name);
      void vscode.window.showWarningMessage(
        vscode.l10n.t(
          'The panel session was renamed, but {0} name sync failed: {1}',
          request.identity.providerName,
          errorMessage(error)
        )
      );
    }
  }
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
