export type SessionLaunchMode = 'resume' | 'fork';

export interface AgentSessionIdentity {
  providerId: string;
  providerName: string;
  sessionId: string;
}

export interface HistoricalSession extends AgentSessionIdentity {
  cwd: string;
  title: string;
  updatedAt: number;
  supportsFork: boolean;
}

export interface AgentSessionProvider {
  readonly id: string;
  readonly name: string;
  discover(workspaceRoots: string[], limit: number): Promise<HistoricalSession[]>;
  buildLaunchCommand(session: HistoricalSession, mode: SessionLaunchMode): string;
}

export interface SessionHistoryDiscovery {
  sessions: HistoricalSession[];
  failedProviders: string[];
}
