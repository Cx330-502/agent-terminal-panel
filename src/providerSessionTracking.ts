import type { SessionManager } from './sessionManager';
import type { WorkspaceSessionRestore } from './workspaceSessionRestore';

export function trackProviderSession(
  restore: WorkspaceSessionRestore,
  sessions: SessionManager,
  id: string,
  providerId: string | undefined,
  startedAt?: number
): void {
  if (!providerId) return;
  const session = sessions.restorableSession(id);
  if (!session || session.identity) return;
  restore.trackSession(
    startedAt === undefined ? session : { ...session, startedAt },
    providerId
  );
}
