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
  buildLaunchCommand(session: AgentSessionIdentity, mode: SessionLaunchMode): string;
  renameSession?(
    session: AgentSessionIdentity,
    cwd: string,
    name: string
  ): Promise<void>;
}

export interface SessionHistoryDiscovery {
  sessions: HistoricalSession[];
  failedProviders: string[];
}
