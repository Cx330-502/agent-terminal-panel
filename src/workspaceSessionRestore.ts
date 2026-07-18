import * as path from 'node:path';
import type { WorkspaceRestoreSummary } from './shared';
import type { SessionHistoryRegistry } from './sessionHistory/registry';
import type { AgentSessionIdentity, HistoricalSession } from './sessionHistory/types';

const STORAGE_KEY = 'workspaceWindowSessions.v1';
const STORAGE_VERSION = 1;
const MAX_SESSIONS = 100;
const TRACKING_WINDOW_MS = 60_000;
const TIMESTAMP_TOLERANCE_MS = 5_000;

export interface WorkspaceState {
  get<T>(key: string): T | undefined;
  update(key: string, value: unknown): Thenable<void>;
}

export interface RestorableLiveSession {
  id: string;
  name: string;
  cwd: string;
  isActive: boolean;
  startedAt: number;
  identity?: AgentSessionIdentity;
}

export interface WorkspaceRestoreEntry extends AgentSessionIdentity {
  name: string;
  cwd: string;
  updatedAt: number;
  order: number;
  isActive: boolean;
}

interface TrackedLaunch {
  id: string;
  cwd: string;
  startedAt: number;
  expectedProviderId: string;
}

interface PersistedWorkspaceSessions {
  version: number;
  sessions: WorkspaceRestoreEntry[];
}

export interface WorkspaceSessionRestoreCallbacks {
  onIdentity(id: string, identity: AgentSessionIdentity): void;
  onPendingChanged(): void;
}

export class WorkspaceSessionRestore {
  private pending: WorkspaceRestoreEntry[];
  private current: WorkspaceRestoreEntry[] = [];
  private readonly tracking = new Map<string, TrackedLaunch>();
  private timer: NodeJS.Timeout | undefined;
  private discovering = false;
  private disposed = false;
  private lastSerialized: string;
  private writeQueue = Promise.resolve();

  constructor(
    private readonly state: WorkspaceState,
    private readonly workspaceRoots: string[],
    private readonly registry: SessionHistoryRegistry,
    private readonly callbacks: WorkspaceSessionRestoreCallbacks
  ) {
    this.pending = workspaceRoots.length > 0 ? loadEntries(state.get(STORAGE_KEY)) : [];
    this.lastSerialized = serializeState(this.pending);
  }

  get hasPending(): boolean {
    return this.pending.length > 0;
  }

  summary(): WorkspaceRestoreSummary {
    return {
      count: this.pending.length,
      names: this.pending.slice(0, 3).map((session) => session.name)
    };
  }

  pendingEntries(): WorkspaceRestoreEntry[] {
    return this.pending.map((entry) => ({ ...entry }));
  }

  syncCurrent(sessions: RestorableLiveSession[]): void {
    const liveIds = new Set(sessions.map((session) => session.id));
    for (const id of this.tracking.keys()) {
      if (!liveIds.has(id)) this.tracking.delete(id);
    }
    this.current = sessions.flatMap((session, order) =>
      session.identity
        ? [
            {
              ...session.identity,
              name: session.name,
              cwd: session.cwd,
              updatedAt: session.startedAt,
              order,
              isActive: session.isActive
            }
          ]
        : []
    );
    this.persist();
  }

  trackDefaultSession(session: RestorableLiveSession, expectedProviderId: string): void {
    if (this.workspaceRoots.length === 0 || session.identity) return;
    this.tracking.set(session.id, {
      id: session.id,
      cwd: session.cwd,
      startedAt: session.startedAt,
      expectedProviderId
    });
    this.scheduleDiscovery(250);
  }

  takePending(): WorkspaceRestoreEntry[] {
    const entries = this.pendingEntries();
    if (entries.length === 0) return entries;
    this.pending = [];
    this.callbacks.onPendingChanged();
    this.persist();
    return entries;
  }

  requeue(entries: WorkspaceRestoreEntry[]): void {
    if (entries.length === 0) return;
    this.pending = mergeEntries([...entries, ...this.pending]);
    this.callbacks.onPendingChanged();
    this.persist();
  }

  dismissPending(): void {
    if (this.pending.length === 0) return;
    this.pending = [];
    this.callbacks.onPendingChanged();
    this.persist();
  }

  dispose(): void {
    this.disposed = true;
    if (this.timer) clearTimeout(this.timer);
    this.timer = undefined;
    this.tracking.clear();
  }

  private scheduleDiscovery(delayMs: number): void {
    if (this.disposed || this.discovering || this.timer || this.tracking.size === 0) return;
    this.timer = setTimeout(() => {
      this.timer = undefined;
      void this.discoverIdentities();
    }, delayMs);
  }

  private async discoverIdentities(): Promise<void> {
    if (this.disposed || this.discovering || this.tracking.size === 0) return;
    this.discovering = true;
    try {
      const now = Date.now();
      for (const [id, tracked] of this.tracking) {
        if (now - tracked.startedAt > TRACKING_WINDOW_MS) this.tracking.delete(id);
      }
      if (this.tracking.size === 0) return;
      const limit = Math.min(MAX_SESSIONS, Math.max(20, this.tracking.size * 8));
      const discovery = await this.registry.discover(this.workspaceRoots, limit);
      if (this.disposed) return;
      const claimed = new Set(
        [...this.pending, ...this.current].map((session) => identityKey(session))
      );
      for (const match of matchTrackedSessions(
        [...this.tracking.values()],
        discovery.sessions,
        claimed
      )) {
        this.tracking.delete(match.tracked.id);
        this.callbacks.onIdentity(match.tracked.id, {
          providerId: match.session.providerId,
          providerName: match.session.providerName,
          sessionId: match.session.sessionId
        });
      }
    } finally {
      this.discovering = false;
      this.scheduleDiscovery(2_000);
    }
  }

  private persist(): void {
    if (this.workspaceRoots.length === 0) return;
    const current = this.current.map((entry) => ({
      ...entry,
      order: entry.order + this.pending.length
    }));
    const sessions = mergeEntries([...this.pending, ...current]);
    const serialized = serializeState(sessions);
    if (serialized === this.lastSerialized) return;
    this.lastSerialized = serialized;
    const value: PersistedWorkspaceSessions = { version: STORAGE_VERSION, sessions };
    this.writeQueue = this.writeQueue
      .then(() => Promise.resolve(this.state.update(STORAGE_KEY, value)))
      .catch(() => undefined);
  }
}

export function detectLaunchProvider(command: string): string | undefined {
  const tokens = command.match(/(?:[^\s"']+|"[^"]*"|'[^']*')+/gu)?.map(unquote) ?? [];
  while (tokens[0] === 'env' || tokens[0] === 'command' || tokens[0] === 'exec') tokens.shift();
  while (tokens[0]?.includes('=') && !tokens[0].startsWith('-')) tokens.shift();
  if (tokens[0] === 'npx' || tokens[0] === 'bunx') tokens.shift();
  if (tokens[0] === 'pnpm' && tokens[1] === 'dlx') tokens.splice(0, 2);
  const executable = tokens[0] ? path.basename(tokens[0]).toLowerCase() : '';
  if (executable === 'codex' || executable === 'codex.exe') return 'codex';
  if (executable === 'claude' || executable === 'claude.exe') return 'claude';
  return undefined;
}

export function matchTrackedSessions(
  trackedLaunches: TrackedLaunch[],
  sessions: HistoricalSession[],
  claimedKeys = new Set<string>()
): Array<{ tracked: TrackedLaunch; session: HistoricalSession }> {
  const result: Array<{ tracked: TrackedLaunch; session: HistoricalSession }> = [];
  const claimed = new Set(claimedKeys);
  for (const tracked of [...trackedLaunches].sort((left, right) => left.startedAt - right.startedAt)) {
    const candidates = sessions.filter(
      (session) =>
        !claimed.has(identityKey(session)) &&
        samePath(session.cwd, tracked.cwd) &&
        session.providerId === tracked.expectedProviderId &&
        session.updatedAt >= tracked.startedAt - TIMESTAMP_TOLERANCE_MS
    );
    const afterStart = candidates.filter((session) => session.updatedAt >= tracked.startedAt);
    const selected = (afterStart.length > 0 ? afterStart : candidates).sort(
      (left, right) =>
        Math.abs(left.updatedAt - tracked.startedAt) -
        Math.abs(right.updatedAt - tracked.startedAt)
    )[0];
    if (!selected) continue;
    claimed.add(identityKey(selected));
    result.push({ tracked, session: selected });
  }
  return result;
}

function loadEntries(value: unknown): WorkspaceRestoreEntry[] {
  if (!isRecord(value) || value.version !== STORAGE_VERSION || !Array.isArray(value.sessions)) {
    return [];
  }
  return mergeEntries(value.sessions.flatMap(parseEntry));
}

function parseEntry(value: unknown): WorkspaceRestoreEntry[] {
  if (!isRecord(value)) return [];
  const providerId = boundedString(value.providerId, 64);
  const providerName = boundedString(value.providerName, 100);
  const sessionId = boundedString(value.sessionId, 160);
  const name = boundedString(value.name, 200);
  const cwd = boundedString(value.cwd, 4096);
  if (!providerId || !providerName || !sessionId || !name || !cwd) return [];
  return [
    {
      providerId,
      providerName,
      sessionId,
      name,
      cwd,
      updatedAt: finiteNumber(value.updatedAt),
      order: finiteNumber(value.order),
      isActive: value.isActive === true
    }
  ];
}

function mergeEntries(entries: WorkspaceRestoreEntry[]): WorkspaceRestoreEntry[] {
  const unique = new Map<string, WorkspaceRestoreEntry>();
  for (const entry of entries) unique.set(identityKey(entry), { ...entry });
  const sorted = [...unique.values()]
    .sort((left, right) => left.order - right.order)
    .slice(0, MAX_SESSIONS);
  const activeKey = [...entries].reverse().find((entry) => entry.isActive);
  return sorted.map((entry, order) => ({
    ...entry,
    order,
    isActive: activeKey ? identityKey(entry) === identityKey(activeKey) : false
  }));
}

function serializeState(sessions: WorkspaceRestoreEntry[]): string {
  return JSON.stringify({ version: STORAGE_VERSION, sessions: mergeEntries(sessions) });
}

function identityKey(identity: AgentSessionIdentity): string {
  return `${identity.providerId}:${identity.sessionId}`;
}

function samePath(left: string, right: string): boolean {
  const normalizedLeft = path.resolve(left);
  const normalizedRight = path.resolve(right);
  return process.platform === 'win32'
    ? normalizedLeft.toLowerCase() === normalizedRight.toLowerCase()
    : normalizedLeft === normalizedRight;
}

function unquote(value: string): string {
  return value.length >= 2 && (value[0] === '"' || value[0] === "'")
    ? value.slice(1, -1)
    : value;
}

function boundedString(value: unknown, maxLength: number): string | undefined {
  return typeof value === 'string' && value.trim()
    ? value.trim().slice(0, maxLength)
    : undefined;
}

function finiteNumber(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : 0;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value));
}
