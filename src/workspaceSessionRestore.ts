import * as path from 'node:path';
import type { WorkspaceRestoreSummary } from './shared';
import type { SessionHistoryRegistry } from './sessionHistory/registry';
import type { AgentSessionIdentity, HistoricalSession } from './sessionHistory/types';

export const WORKSPACE_SESSION_STORAGE_KEY = 'workspaceWindowSessions';
export const LEGACY_WORKSPACE_SESSION_STORAGE_KEY = 'workspaceWindowSessions.v1';
const STORAGE_VERSION = 1;
const MAX_SESSIONS = 100;
const TRACKING_WINDOW_MS = 60_000;
// Claude Code creates its transcript only after the first prompt, which can be much later.
const LAZY_TRANSCRIPT_TRACKING_WINDOW_MS = 30 * 60_000;
const FAST_DISCOVERY_DELAY_MS = 2_000;
const SLOW_DISCOVERY_DELAY_MS = 5_000;
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
  windowRestoreEligible: boolean;
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
  expectedSessionId?: string;
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
  private liveIdentityKeys = new Set<string>();
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
    const current = state.get(WORKSPACE_SESSION_STORAGE_KEY);
    const legacy = current === undefined
      ? state.get(LEGACY_WORKSPACE_SESSION_STORAGE_KEY)
      : undefined;
    const loaded = current ?? legacy;
    const requiresMigration = legacy !== undefined || isLegacyPayload(current);
    this.pending = workspaceRoots.length > 0 ? loadEntries(loaded) : [];
    this.lastSerialized = requiresMigration ? '' : serializeState(this.pending);
    if (requiresMigration && workspaceRoots.length > 0) {
      this.persist();
      if (legacy !== undefined) {
        this.writeQueue = this.writeQueue
          .then(() => Promise.resolve(state.update(LEGACY_WORKSPACE_SESSION_STORAGE_KEY, undefined)))
          .catch(() => undefined);
      }
    }
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
    this.liveIdentityKeys = new Set(
      sessions.flatMap((session) => session.identity ? [identityKey(session.identity)] : [])
    );
    this.current = sessions.flatMap((session, order) =>
      session.windowRestoreEligible && session.identity
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

  trackSession(
    session: RestorableLiveSession,
    expectedProviderId: string,
    expectedSessionId?: string
  ): void {
    if (this.workspaceRoots.length === 0 || session.identity) return;
    this.tracking.set(session.id, {
      id: session.id,
      cwd: session.cwd,
      startedAt: session.startedAt,
      expectedProviderId,
      ...(expectedSessionId ? { expectedSessionId } : {})
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
        if (now - tracked.startedAt > trackingWindowMs(tracked)) this.tracking.delete(id);
      }
      if (this.tracking.size === 0) return;
      const limit = Math.min(MAX_SESSIONS, Math.max(20, this.tracking.size * 8));
      const providerIds = new Set(
        [...this.tracking.values()].map((tracked) => tracked.expectedProviderId)
      );
      const discovery = await this.registry.discover(this.workspaceRoots, limit, providerIds);
      if (this.disposed) return;
      const claimed = new Set(
        [
          ...this.pending.map((session) => identityKey(session)),
          ...this.current.map((session) => identityKey(session)),
          ...this.liveIdentityKeys
        ]
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
      const now = Date.now();
      const recentLaunch = [...this.tracking.values()].some(
        (tracked) => now - tracked.startedAt <= TRACKING_WINDOW_MS
      );
      this.scheduleDiscovery(recentLaunch ? FAST_DISCOVERY_DELAY_MS : SLOW_DISCOVERY_DELAY_MS);
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
      .then(() => Promise.resolve(this.state.update(WORKSPACE_SESSION_STORAGE_KEY, value)))
      .catch(() => undefined);
  }
}

export function matchTrackedSessions(
  trackedLaunches: TrackedLaunch[],
  sessions: HistoricalSession[],
  claimedKeys = new Set<string>()
): Array<{ tracked: TrackedLaunch; session: HistoricalSession }> {
  const result: Array<{ tracked: TrackedLaunch; session: HistoricalSession }> = [];
  const claimed = new Set(claimedKeys);
  // Reserve assigned identities before a timestamp-based match can claim the same transcript.
  const orderedLaunches = [...trackedLaunches].sort((left, right) =>
    Number(Boolean(right.expectedSessionId)) - Number(Boolean(left.expectedSessionId)) ||
    left.startedAt - right.startedAt
  );
  for (const tracked of orderedLaunches) {
    if (tracked.expectedSessionId) {
      const exact = sessions.find(
        (session) =>
          session.providerId === tracked.expectedProviderId &&
          session.sessionId === tracked.expectedSessionId &&
          !claimed.has(identityKey(session))
      );
      if (exact) {
        claimed.add(identityKey(exact));
        result.push({ tracked, session: exact });
      }
      continue;
    }
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

function trackingWindowMs(tracked: TrackedLaunch): number {
  if (tracked.expectedSessionId) return Number.POSITIVE_INFINITY;
  return tracked.expectedProviderId === 'claude'
    ? LAZY_TRANSCRIPT_TRACKING_WINDOW_MS
    : TRACKING_WINDOW_MS;
}

function loadEntries(value: unknown): WorkspaceRestoreEntry[] {
  if (Array.isArray(value)) return mergeEntries(value.flatMap(parseEntry));
  if (!isRecord(value) || !Array.isArray(value.sessions)) return [];
  if (value.version !== undefined && value.version !== STORAGE_VERSION) return [];
  return mergeEntries(value.sessions.flatMap(parseEntry));
}

function isLegacyPayload(value: unknown): boolean {
  return Array.isArray(value) || (
    isRecord(value) && value.version === undefined && Array.isArray(value.sessions)
  );
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
