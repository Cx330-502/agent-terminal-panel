import { createReadStream } from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { createInterface } from 'node:readline';
import { renameCodexThread } from './codexAppServer';
import {
  compactTitle,
  isInsideWorkspace,
  listJsonlFiles,
  readFirstJsonLine,
  readTailJsonLines
} from './fileUtils';
import type {
  AgentSessionIdentity,
  AgentSessionProvider,
  HistoricalSession,
  SessionLaunchMode
} from './types';

interface JsonRecord {
  type?: unknown;
  payload?: unknown;
}

export interface CodexSessionProviderOptions {
  clientVersion?: string;
  environment?: Record<string, string>;
  renameThread?: typeof renameCodexThread;
  sessionIndexPath?: string;
  sessionsRoot?: string;
}

export class CodexSessionProvider implements AgentSessionProvider {
  readonly id = 'codex';
  readonly name = 'Codex';
  private readonly clientVersion: string;
  private readonly commandPrefix: string;
  private readonly environment: Record<string, string>;
  private readonly renameThread: typeof renameCodexThread;
  private readonly sessionIndexPath: string;
  private readonly sessionsRoot: string;

  constructor(commandPrefix: string, options: CodexSessionProviderOptions = {}) {
    const codexHome = options.environment?.CODEX_HOME
      ?? process.env.CODEX_HOME
      ?? path.join(os.homedir(), '.codex');
    this.clientVersion = options.clientVersion ?? 'unknown';
    this.commandPrefix = commandPrefix;
    this.environment = options.environment ?? {};
    this.renameThread = options.renameThread ?? renameCodexThread;
    this.sessionsRoot = options.sessionsRoot ?? path.join(codexHome, 'sessions');
    this.sessionIndexPath = options.sessionIndexPath
      ?? path.join(path.dirname(this.sessionsRoot), 'session_index.jsonl');
  }

  async discover(workspaceRoots: string[], limit: number): Promise<HistoricalSession[]> {
    const result: HistoricalSession[] = [];
    const names = await readThreadNames(this.sessionIndexPath);
    for (const file of await listJsonlFiles(this.sessionsRoot)) {
      const first = asRecord(await readFirstJsonLine(file.path));
      const payload = asRecord(first?.payload);
      if (first?.type !== 'session_meta') continue;
      const sessionId = stringValue(payload?.id) ?? stringValue(payload?.session_id);
      const cwd = stringValue(payload?.cwd);
      if (!sessionId || !cwd || !isInsideWorkspace(cwd, workspaceRoots)) continue;

      const title = names.get(sessionId)
        ?? findLatestUserMessage(await readTailJsonLines(file.path));
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

  buildLaunchCommand(session: AgentSessionIdentity, mode: SessionLaunchMode): string {
    return `${this.commandPrefix} ${mode} ${safeSessionId(session.sessionId)}`;
  }

  async renameSession(
    session: AgentSessionIdentity,
    _cwd: string,
    name: string
  ): Promise<void> {
    await this.renameThread(this.commandPrefix, safeSessionId(session.sessionId), name, {
      clientVersion: this.clientVersion,
      environment: this.environment
    });
  }
}

async function readThreadNames(file: string): Promise<Map<string, string>> {
  const result = new Map<string, string>();
  const stream = createReadStream(file, { encoding: 'utf8' });
  const lines = createInterface({ input: stream, crlfDelay: Infinity });
  try {
    for await (const line of lines) {
      let entry: unknown;
      try {
        entry = JSON.parse(line);
      } catch {
        continue;
      }
      const record = asRecord(entry);
      const id = stringValue(record?.id);
      const name = stringValue(record?.thread_name);
      if (id && name?.trim()) result.set(id, name.trim());
    }
  } catch {
    return new Map();
  } finally {
    lines.close();
    stream.destroy();
  }
  return result;
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
