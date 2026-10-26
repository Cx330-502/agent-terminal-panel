import type {
  AgentSessionIdentity,
  AgentSessionProvider,
  HistoricalSession,
  SessionHistoryDiscovery,
  SessionLaunchMode
} from './types';

export class SessionHistoryRegistry {
  constructor(private readonly providers: AgentSessionProvider[]) {}

  async discover(
    workspaceRoots: string[],
    limit: number,
    providerIds?: ReadonlySet<string>
  ): Promise<SessionHistoryDiscovery> {
    const providers = providerIds
      ? this.providers.filter((provider) => providerIds.has(provider.id))
      : this.providers;
    const outcomes = await Promise.allSettled(
      providers.map((provider) => provider.discover(workspaceRoots, limit))
    );
    const failedProviders: string[] = [];
    const discovered: HistoricalSession[] = [];
    outcomes.forEach((outcome, index) => {
      if (outcome.status === 'fulfilled') discovered.push(...outcome.value);
      else {
        const provider = providers[index];
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

  buildLaunchCommand(session: AgentSessionIdentity, mode: SessionLaunchMode): string {
    const provider = this.providers.find((candidate) => candidate.id === session.providerId);
    if (!provider) throw new Error(`Unsupported session provider: ${session.providerId}`);
    return provider.buildLaunchCommand(session, mode);
  }

  async renameSession(
    session: AgentSessionIdentity,
    cwd: string,
    name: string
  ): Promise<boolean> {
    const provider = this.providers.find((candidate) => candidate.id === session.providerId);
    if (!provider?.renameSession) return false;
    await provider.renameSession(session, cwd, name);
    return true;
  }
}
