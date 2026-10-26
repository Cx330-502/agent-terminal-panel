import { randomUUID } from 'node:crypto';
import { appendFile, readdir } from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import {
  compactTitle,
  type DatedFile,
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

interface SessionHead {
  sessionId: string;
  cwd: string;
}

/** Claude Code stores transcripts under `$CLAUDE_CONFIG_DIR/projects`, defaulting to `~/.claude`. */
export function claudeProjectsRoot(environment: Record<string, string> = {}): string {
  const configDir = environment.CLAUDE_CONFIG_DIR?.trim() || process.env.CLAUDE_CONFIG_DIR?.trim();
  return path.join(configDir || path.join(os.homedir(), '.claude'), 'projects');
}

export class ClaudeSessionProvider implements AgentSessionProvider {
  readonly id = 'claude';
  readonly name = 'Claude Code';
  // Transcript heads never change and titles only change with the file, so repeated identity
  // polling while a fresh Claude session waits for its first prompt stays cheap.
  private readonly heads = new Map<string, SessionHead>();
  private readonly titles = new Map<string, { modifiedAt: number; title: string | undefined }>();

  constructor(
    private readonly commandPrefix: string,
    private readonly projectsRoot = claudeProjectsRoot()
  ) {}

  async discover(workspaceRoots: string[], limit: number): Promise<HistoricalSession[]> {
    const result: HistoricalSession[] = [];
    for (const file of await this.listSessionFiles(workspaceRoots)) {
      const head = await this.readHead(file.path);
      if (!head || !isInsideWorkspace(head.cwd, workspaceRoots)) continue;

      result.push({
        providerId: this.id,
        providerName: this.name,
        sessionId: head.sessionId,
        cwd: head.cwd,
        title: compactTitle(await this.readTitle(file), `Claude ${head.sessionId.slice(0, 8)}`),
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
    const files = await this.listSessionFiles([cwd]);
    for (const file of files) {
      if (path.basename(file.path) !== expectedName) continue;
      const head = await this.readHead(file.path);
      if (head?.sessionId !== sessionId || !samePath(head.cwd, cwd)) continue;
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

  /** Project directories are named after the launch cwd, so only workspace-related ones are read. */
  private async listSessionFiles(workspaceRoots: string[]): Promise<DatedFile[]> {
    const prefixes = workspaceRoots.map((root) => projectDirectoryKey(path.resolve(root)));
    const directories = await readdir(this.projectsRoot, { withFileTypes: true }).catch(() => []);
    const subagentsSegment = `${path.sep}subagents${path.sep}`;
    const listed = await Promise.all(
      directories
        .filter((entry) => entry.isDirectory())
        .filter((entry) => {
          const key = projectDirectoryKey(entry.name);
          return prefixes.some((prefix) => key.startsWith(prefix));
        })
        .map((entry) => listJsonlFiles(path.join(this.projectsRoot, entry.name)))
    );
    return listed
      .flat()
      .filter((file) => !file.path.includes(subagentsSegment))
      .sort((left, right) => right.modifiedAt - left.modifiedAt);
  }

  private async readHead(file: string): Promise<SessionHead | undefined> {
    const cached = this.heads.get(file);
    if (cached) return cached;
    const records = await readHeadJsonLines(file).catch(() => []);
    const sessionId = findString(records, 'sessionId');
    const cwd = findString(records, 'cwd');
    if (!sessionId || !cwd) return undefined;
    const head = { sessionId, cwd };
    this.heads.set(file, head);
    return head;
  }

  private async readTitle(file: DatedFile): Promise<string | undefined> {
    const cached = this.titles.get(file.path);
    if (cached?.modifiedAt === file.modifiedAt) return cached.title;
    const title = findTitle(await readTailJsonLines(file.path).catch(() => []));
    this.titles.set(file.path, { modifiedAt: file.modifiedAt, title });
    return title;
  }
}

/**
 * Claude encodes the launch cwd by replacing path punctuation with `-`, and long names may be
 * truncated. Comparing a normalized, bounded prefix tolerates encoding differences across versions.
 */
function projectDirectoryKey(value: string): string {
  return value.replace(/[^a-zA-Z0-9]/gu, '-').toLowerCase().slice(0, 96);
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
    if (record?.type === 'summary' && typeof record.summary === 'string') {
      if (record.summary.trim()) return record.summary;
    }
  }
  for (let index = records.length - 1; index >= 0; index--) {
    const record = asRecord(records[index]);
    if (record?.type !== 'user' || record.toolUseResult || record.isSidechain || record.isMeta) {
      continue;
    }
    const text = messageText(record.message)?.trim();
    // Slash commands, local command output and injected reminders are wrapped in pseudo-tags.
    if (text && !text.startsWith('<')) return text;
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
