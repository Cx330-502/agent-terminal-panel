import { getSessionHistoryConfig } from '../config';
import { ClaudeSessionProvider } from './claudeProvider';
import { CodexSessionProvider } from './codexProvider';
import { SessionHistoryRegistry } from './registry';

export function createSessionHistoryRegistry(): SessionHistoryRegistry {
  const config = getSessionHistoryConfig();
  return new SessionHistoryRegistry([
    new CodexSessionProvider(config.codexCommand),
    new ClaudeSessionProvider(config.claudeCommand)
  ]);
}
