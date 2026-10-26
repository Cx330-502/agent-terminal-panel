import { getAgentProcessConfig, getAgentShellConfig, getSessionHistoryConfig } from '../config';
import { ClaudeSessionProvider, claudeProjectsRoot } from './claudeProvider';
import { CodexSessionProvider } from './codexProvider';
import { SessionHistoryRegistry } from './registry';

export function createSessionHistoryRegistry(clientVersion = 'unknown'): SessionHistoryRegistry {
  const config = getSessionHistoryConfig();
  const environment = getAgentProcessConfig().environment;
  return new SessionHistoryRegistry([
    new CodexSessionProvider(config.codexCommand, {
      clientVersion,
      environment,
      getShellConfig: getAgentShellConfig
    }),
    new ClaudeSessionProvider(config.claudeCommand, claudeProjectsRoot(environment))
  ]);
}
