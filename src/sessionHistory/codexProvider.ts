import * as os from 'node:os';
import * as path from 'node:path';
import {
  compactTitle,
  isInsideWorkspace,
  listJsonlFiles,
  readFirstJsonLine,
  readTailJsonLines
} from './fileUtils';
import type {
  AgentSessionProvider,
  HistoricalSession,
  SessionLaunchMode
} from './types';

interface JsonRecord {
  type?: unknown;
  payload?: unknown;
}

export class CodexSessionProvider implements AgentSessionProvider {
  readonly id = 'codex';
  readonly name = 'Codex';

  constructor(
    private readonly commandPrefix: string,
    private readonly sessionsRoot = path.join(
      process.env.CODEX_HOME || path.join(os.homedir(), '.codex'),
      'sessions'
    )
  ) {}

  async discover(workspaceRoots: string[], limit: number): Promise<HistoricalSession[]> {
    const result: HistoricalSession[] = [];
    for (const file of await listJsonlFiles(this.sessionsRoot)) {
      const first = asRecord(await readFirstJsonLine(file.path));
      const payload = asRecord(first?.payload);
      if (first?.type !== 'session_meta') continue;
      const sessionId = stringValue(payload?.id) ?? stringValue(payload?.session_id);
      const cwd = stringValue(payload?.cwd);
      if (!sessionId || !cwd || !isInsideWorkspace(cwd, workspaceRoots)) continue;

      const title = findLatestUserMessage(await readTailJsonLines(file.path));
      result.push({
        providerId: this.id,
        providerName: this.name,
        sessionId,
        cwd,
        title: compactTitle(title, `Codex ${sessionId.slice(0, 8)}`),
        updatedAt: file.modifiedAt,
        supportsFork: true
      });
      if (result.length >= limit) break;
    }
    return result;
  }

  buildLaunchCommand(session: HistoricalSession, mode: SessionLaunchMode): string {
    return `${this.commandPrefix} ${mode} ${safeSessionId(session.sessionId)}`;
  }
}

function findLatestUserMessage(records: unknown[]): string | undefined {
  for (let index = records.length - 1; index >= 0; index--) {
    const record = asRecord(records[index]);
    const payload = asRecord(record?.payload);
    if (record?.type === 'event_msg' && payload?.type === 'user_message') {
      const message = stringValue(payload.message);
      if (message?.trim()) return message;
    }
  }
  return undefined;
}

function safeSessionId(value: string): string {
  if (!/^[a-zA-Z0-9-]+$/u.test(value)) throw new Error('Invalid Codex session id');
  return value;
}

function asRecord(value: unknown): JsonRecord & Record<string, unknown> | undefined {
  return value !== null && typeof value === 'object'
    ? (value as JsonRecord & Record<string, unknown>)
    : undefined;
}

function stringValue(value: unknown): string | undefined {
  return typeof value === 'string' ? value : undefined;
}
