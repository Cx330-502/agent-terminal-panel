import { randomUUID } from 'node:crypto';
import { appendFile } from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import {
  compactTitle,
  isInsideWorkspace,
  listJsonlFiles,
  readHeadJsonLines,
  readTailJsonLines
} from './fileUtils';
import type {
  AgentSessionIdentity,
  AgentSessionProvider,
  HistoricalSession,
  SessionLaunchMode
} from './types';

type JsonRecord = Record<string, unknown>;

export class ClaudeSessionProvider implements AgentSessionProvider {
  readonly id = 'claude';
  readonly name = 'Claude Code';

  constructor(
    private readonly commandPrefix: string,
    private readonly projectsRoot = path.join(os.homedir(), '.claude', 'projects')
  ) {}

  async discover(workspaceRoots: string[], limit: number): Promise<HistoricalSession[]> {
    const result: HistoricalSession[] = [];
    const subagentsSegment = `${path.sep}subagents${path.sep}`;
    const files = (await listJsonlFiles(this.projectsRoot)).filter(
      (file) => !file.path.includes(subagentsSegment)
    );
    for (const file of files) {
      const head = await readHeadJsonLines(file.path);
      const sessionId = findString(head, 'sessionId');
      const cwd = findString(head, 'cwd');
      if (!sessionId || !cwd || !isInsideWorkspace(cwd, workspaceRoots)) continue;

      const tail = await readTailJsonLines(file.path);
      result.push({
        providerId: this.id,
        providerName: this.name,
        sessionId,
        cwd,
        title: compactTitle(findTitle(tail), `Claude ${sessionId.slice(0, 8)}`),
        updatedAt: file.modifiedAt,
        supportsFork: true
      });
      if (result.length >= limit) break;
    }
    return result;
  }

  buildLaunchCommand(session: AgentSessionIdentity, mode: SessionLaunchMode): string {
    const resume = `${this.commandPrefix} --resume ${safeSessionId(session.sessionId)}`;
    return mode === 'fork' ? `${resume} --fork-session` : resume;
  }

  async renameSession(
    session: AgentSessionIdentity,
    cwd: string,
    name: string
  ): Promise<void> {
    const sessionId = safeSessionId(session.sessionId);
    const expectedName = `${sessionId}.jsonl`;
    const files = await listJsonlFiles(this.projectsRoot);
    for (const file of files) {
      if (path.basename(file.path) !== expectedName || file.path.includes(`${path.sep}subagents${path.sep}`)) {
        continue;
      }
      const head = await readHeadJsonLines(file.path);
      if (findString(head, 'sessionId') !== sessionId || !samePath(findString(head, 'cwd'), cwd)) {
        continue;
      }
      await appendFile(
        file.path,
        `${JSON.stringify({
          type: 'custom-title',
          customTitle: name.trim(),
          sessionId,
          uuid: randomUUID(),
          timestamp: new Date().toISOString()
        })}\n`,
        'utf8'
      );
      return;
    }
    throw new Error(`Claude Code session ${sessionId} was not found in the current workspace`);
  }
}

function findTitle(records: unknown[]): string | undefined {
  for (let index = records.length - 1; index >= 0; index--) {
    const record = asRecord(records[index]);
    if (record?.type === 'custom-title' && typeof record.customTitle === 'string') {
      if (record.customTitle.trim()) return record.customTitle;
    }
  }
  for (let index = records.length - 1; index >= 0; index--) {
    const record = asRecord(records[index]);
    if (record?.type === 'last-prompt' && typeof record.lastPrompt === 'string') {
      if (record.lastPrompt.trim()) return record.lastPrompt;
    }
  }
  for (let index = records.length - 1; index >= 0; index--) {
    const record = asRecord(records[index]);
    if (record?.type !== 'user' || record.toolUseResult || record.isSidechain) continue;
    const text = messageText(record.message);
    if (text?.trim()) return text;
  }
  return undefined;
}

function messageText(value: unknown): string | undefined {
  const message = asRecord(value);
  const content = message?.content;
  if (typeof content === 'string') return content;
  if (!Array.isArray(content)) return undefined;
  const parts = content.flatMap((item) => {
    const block = asRecord(item);
    return block?.type === 'text' && typeof block.text === 'string' ? [block.text] : [];
  });
  return parts.length > 0 ? parts.join(' ') : undefined;
}

function findString(records: unknown[], key: string): string | undefined {
  for (const value of records) {
    const record = asRecord(value);
    if (typeof record?.[key] === 'string') return record[key] as string;
  }
  return undefined;
}

function safeSessionId(value: string): string {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu.test(value)) {
    throw new Error('Invalid Claude session id');
  }
  return value;
}

function samePath(left: string | undefined, right: string): boolean {
  if (!left) return false;
  const normalizedLeft = path.resolve(left);
  const normalizedRight = path.resolve(right);
  return process.platform === 'win32'
    ? normalizedLeft.toLowerCase() === normalizedRight.toLowerCase()
    : normalizedLeft === normalizedRight;
}

function asRecord(value: unknown): JsonRecord | undefined {
  return value !== null && typeof value === 'object' ? (value as JsonRecord) : undefined;
}
