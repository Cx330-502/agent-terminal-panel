import type {
  AgentSessionProvider,
  HistoricalSession,
  SessionHistoryDiscovery,
  SessionLaunchMode
} from './types';

export class SessionHistoryRegistry {
  constructor(private readonly providers: AgentSessionProvider[]) {}

  async discover(workspaceRoots: string[], limit: number): Promise<SessionHistoryDiscovery> {
    const outcomes = await Promise.allSettled(
      this.providers.map((provider) => provider.discover(workspaceRoots, limit))
    );
    const failedProviders: string[] = [];
    const discovered: HistoricalSession[] = [];
    outcomes.forEach((outcome, index) => {
      if (outcome.status === 'fulfilled') discovered.push(...outcome.value);
      else {
        const provider = this.providers[index];
        if (provider) failedProviders.push(provider.name);
      }
    });

    const unique = new Map<string, HistoricalSession>();
    for (const session of discovered) {
      unique.set(`${session.providerId}:${session.sessionId}`, session);
    }
    return {
      sessions: [...unique.values()]
        .sort((left, right) => right.updatedAt - left.updatedAt)
        .slice(0, limit),
      failedProviders
    };
  }

  buildLaunchCommand(session: HistoricalSession, mode: SessionLaunchMode): string {
    const provider = this.providers.find((candidate) => candidate.id === session.providerId);
    if (!provider) throw new Error(`Unsupported session provider: ${session.providerId}`);
    return provider.buildLaunchCommand(session, mode);
  }
}
