import * as vscode from 'vscode';
import { ClosedSessionStore } from './closedSessionStore';
import type { ClosedSessionState } from './sessionManager';
import type { ClosedSessionSummary } from './shared';

export class ClosedSessionRecovery implements vscode.Disposable {
  private readonly store = new ClosedSessionStore();
  private expiryTimer: NodeJS.Timeout | undefined;

  constructor(
    private readonly reopen: (session: ClosedSessionState) => Promise<boolean>,
    private readonly onChanged: (summary: ClosedSessionSummary) => void
  ) {}

  remember(session: ClosedSessionState | undefined): void {
    if (!session) return;
    const entry = this.store.add(session);
    this.changed();
    const reopenLabel = vscode.l10n.t('Reopen');
    void vscode.window
      .showInformationMessage(vscode.l10n.t('Closed “{0}”', session.name), reopenLabel)
      .then((action) => {
        if (action === reopenLabel) void this.reopenEntry(entry.id);
      });
  }

  summary(): ClosedSessionSummary {
    return this.store.summary();
  }

  async reopenLatest(): Promise<boolean> {
    return this.reopenEntry();
  }

  dispose(): void {
    if (this.expiryTimer) clearTimeout(this.expiryTimer);
    this.expiryTimer = undefined;
  }

  private async reopenEntry(id?: string): Promise<boolean> {
    const entry = this.store.take(id);
    if (!entry) {
      this.changed();
      void vscode.window.showInformationMessage(
        vscode.l10n.t('There are no closed sessions to reopen.')
      );
      return false;
    }
    this.changed();
    if (await this.reopen(entry)) return true;
    this.store.restore(entry);
    this.changed();
    return false;
  }

  private changed(): void {
    if (this.expiryTimer) clearTimeout(this.expiryTimer);
    const delay = this.store.nextExpiryDelay();
    if (delay !== undefined) {
      this.expiryTimer = setTimeout(() => this.changed(), delay + 1);
    }
    this.onChanged(this.store.summary());
  }
}
