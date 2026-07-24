import { randomUUID } from 'node:crypto';
import { CommunicationMonitor } from './communication/monitor';
import type { AgentProcessConfig, CommunicationHealthConfig } from './config';
import { isApprovalDecisionInput, isSubmissionInput } from './input';
import { OutputBuffer } from './outputBuffer';
import { PtyHost, type PtySize } from './ptyHost';
import { allocateAutomaticSessionName } from './sessionNames';
import type { AgentSessionIdentity } from './sessionHistory/types';
import type { SessionLaunchSource, SessionSnapshot, SessionStatus } from './shared';

interface SessionRecord {
  id: string;
  name: string;
  cwd: string;
  status: SessionStatus;
  unread: boolean;
  exitCode?: number;
  size: PtySize;
  activityEpoch: number;
  lastAttentionKey?: string;
  output: OutputBuffer;
  launchCommand?: string;
  launchSource: SessionLaunchSource;
  canRestart: boolean;
  automaticName: boolean;
  startedAt: number;
  pid?: number;
  spawnDurationMs?: number;
  startupDurationMs?: number;
  windowRestoreEligible: boolean;
  resumeIdentity?: AgentSessionIdentity;
}

export interface SessionCreateOptions {
  name?: string;
  launchCommand?: string;
  launchSource?: SessionLaunchSource;
  canRestart?: boolean;
  automaticName?: boolean;
  windowRestoreEligible?: boolean;
  resumeIdentity?: AgentSessionIdentity;
}

export interface ClosedSessionState {
  name: string;
  cwd: string;
  options: SessionCreateOptions;
}

export interface RestorableSessionState {
  id: string;
  name: string;
  cwd: string;
  isActive: boolean;
  startedAt: number;
  identity?: AgentSessionIdentity;
}

export interface SessionAttention {
  key: string;
  session: SessionSnapshot;
  detail?: string;
}

export interface SessionManagerCallbacks {
  onOutput(id: string, data: string): void;
  onClear(id: string): void;
  onStateChanged(): void;
  onAttention(event: SessionAttention): void;
  onStartupTiming(event: SessionStartupTiming): void;
}

export interface SessionStartupTiming {
  id: string;
  name: string;
  phase: 'spawned' | 'firstOutput' | 'exitedBeforeOutput' | 'failedBeforeOutput';
  durationMs: number;
  pid?: number;
  detail?: string;
}

export class SessionManager {
  private readonly sessions = new Map<string, SessionRecord>();
  private readonly ptyHost: PtyHost;
  private readonly communication: CommunicationMonitor;
  private activeId: string | undefined;

  constructor(
    private readonly getProcessConfig: () => AgentProcessConfig,
    getCommunicationConfig: () => CommunicationHealthConfig,
    private readonly callbacks: SessionManagerCallbacks
  ) {
    this.ptyHost = new PtyHost({
      onData: (id, data) => this.handlePtyData(id, data),
      onExit: (id, exitCode) => this.handlePtyExit(id, exitCode),
      onError: (id, error) => this.handlePtyError(id, error)
    });
    this.communication = new CommunicationMonitor(getCommunicationConfig, () =>
      this.callbacks.onStateChanged()
    );
  }

  create(cwd: string, size: PtySize, options: SessionCreateOptions = {}): string {
    const id = randomUUID();
    const requestedName = options.name?.trim();
    const automaticName = options.automaticName === true || !requestedName;
    const launchCommand = options.launchCommand?.trim();
    const launchSource = options.launchSource ?? (launchCommand ? 'custom' : 'default');
    const session: SessionRecord = {
      id,
      name: automaticName
        ? allocateAutomaticSessionName(
            [...this.sessions.values()].map((candidate) => candidate.name),
            requestedName
          )
        : requestedName,
      cwd,
      status: 'running',
      unread: false,
      size: normalizeSize(size),
      activityEpoch: 0,
      output: new OutputBuffer(),
      launchSource,
      canRestart: launchSource === 'historyFork' ? false : options.canRestart ?? true,
      automaticName,
      startedAt: Date.now(),
      windowRestoreEligible: options.windowRestoreEligible ?? false,
      ...(options.resumeIdentity ? { resumeIdentity: options.resumeIdentity } : {}),
      ...(launchCommand ? { launchCommand } : {})
    };
    this.sessions.set(id, session);
    this.communication.create(id);
    this.activeId = id;
    this.callbacks.onStateChanged();
    this.spawn(session);
    return id;
  }

  close(id: string): ClosedSessionState | undefined {
    const ids = [...this.sessions.keys()];
    const index = ids.indexOf(id);
    if (index < 0) return undefined;
    const session = this.sessions.get(id)!;
    const closed = session.canRestart
      ? {
          name: session.name,
          cwd: session.cwd,
          options: {
            name: session.name,
            launchSource: session.launchSource,
            canRestart: true,
            automaticName: session.automaticName,
            windowRestoreEligible: session.windowRestoreEligible,
            ...(session.launchCommand ? { launchCommand: session.launchCommand } : {}),
            ...(session.launchCommand && session.resumeIdentity
              ? { resumeIdentity: session.resumeIdentity }
              : {})
          }
        }
      : undefined;
    this.ptyHost.kill(id);
    this.communication.remove(id);
    this.sessions.delete(id);
    if (this.activeId === id) {
      const remaining = [...this.sessions.keys()];
      this.activeId = remaining[Math.min(index, remaining.length - 1)];
    }
    this.callbacks.onStateChanged();
    return closed;
  }

  restart(id: string): number | undefined {
    const session = this.sessions.get(id);
    if (!session || !session.canRestart) return undefined;
    this.ptyHost.kill(id);
    this.communication.restart(id);
    session.output.clear();
    session.exitCode = undefined;
    session.unread = false;
    session.status = 'running';
    session.startedAt = Date.now();
    session.pid = undefined;
    session.spawnDurationMs = undefined;
    session.startupDurationMs = undefined;
    session.activityEpoch++;
    session.lastAttentionKey = undefined;
    this.callbacks.onClear(id);
    this.callbacks.onStateChanged();
    this.spawn(session);
    return session.startedAt;
  }

  write(id: string, data: string): void {
    const session = this.sessions.get(id);
    if (!session) return;
    const submitted = isSubmissionInput(data);
    const approvalDecision = session.status === 'approval' && isApprovalDecisionInput(data);
    let changed = false;
    if (session.unread) {
      session.unread = false;
      changed = true;
    }
    if ((submitted || approvalDecision) && session.status !== 'running') {
      session.status = 'running';
      session.exitCode = undefined;
      session.activityEpoch++;
      changed = true;
    }
    if (changed) this.callbacks.onStateChanged();
    this.communication.recordPtyInput(id, data);
    this.ptyHost.write(id, data);
  }

  resize(id: string, size: PtySize): void {
    const session = this.sessions.get(id);
    if (!session) return;
    session.size = normalizeSize(size);
    this.ptyHost.resize(id, session.size);
  }

  rename(id: string, name: string): void {
    const session = this.sessions.get(id);
    const trimmed = name.trim();
    if (!session || !trimmed || trimmed === session.name) return;
    session.name = trimmed;
    session.automaticName = false;
    this.callbacks.onStateChanged();
  }

  activate(id: string): void {
    if (!this.sessions.has(id) || this.activeId === id) return;
    this.activeId = id;
    this.callbacks.onStateChanged();
  }

  activateNext(direction: 1 | -1): string | undefined {
    const ids = [...this.sessions.keys()];
    if (ids.length === 0) return undefined;
    const current = Math.max(0, ids.indexOf(this.activeId ?? ''));
    const next = (current + direction + ids.length) % ids.length;
    const id = ids[next];
    if (id) this.activate(id);
    return id;
  }

  setDetectedStatus(
    id: string,
    status: SessionStatus,
    attention: boolean,
    detail?: string
  ): void {
    const session = this.sessions.get(id);
    if (!session || (session.exitCode !== undefined && status !== 'completed')) return;
    if (status === 'running' && session.status !== 'running') session.activityEpoch++;
    const changed = session.status !== status;
    session.status = status;

    let attentionEvent: SessionAttention | undefined;
    if (attention && status !== 'running') {
      const key = `${id}:${session.activityEpoch}:${status}`;
      if (session.lastAttentionKey !== key) {
        session.lastAttentionKey = key;
        attentionEvent = { key, session: this.snapshot(session), detail };
      }
    }

    if (changed) this.callbacks.onStateChanged();
    if (attentionEvent) this.callbacks.onAttention(attentionEvent);
  }

  setUnread(id: string, unread: boolean): void {
    const session = this.sessions.get(id);
    if (!session || session.unread === unread) return;
    session.unread = unread;
    this.callbacks.onStateChanged();
  }

  acknowledge(id: string): void {
    this.setUnread(id, false);
  }

  getActiveId(): string | undefined {
    return this.activeId;
  }

  getActive(): SessionSnapshot | undefined {
    const session = this.activeId ? this.sessions.get(this.activeId) : undefined;
    return session ? this.snapshot(session) : undefined;
  }

  get(id: string): SessionSnapshot | undefined {
    const session = this.sessions.get(id);
    return session ? this.snapshot(session) : undefined;
  }

  get count(): number {
    return this.sessions.size;
  }

  requiresDefaultLaunchCommand(id: string): boolean {
    return this.sessions.get(id)?.launchSource === 'default';
  }

  clearResumeIdentity(id: string): void {
    const session = this.sessions.get(id);
    if (!session?.resumeIdentity) return;
    session.resumeIdentity = undefined;
    this.callbacks.onStateChanged();
  }

  setResumeIdentity(id: string, identity: AgentSessionIdentity): void {
    const session = this.sessions.get(id);
    if (!session || !session.windowRestoreEligible) return;
    if (
      session.resumeIdentity?.providerId === identity.providerId &&
      session.resumeIdentity.sessionId === identity.sessionId
    ) {
      return;
    }
    session.resumeIdentity = identity;
    this.callbacks.onStateChanged();
  }

  restorableSessions(): RestorableSessionState[] {
    return [...this.sessions.values()].flatMap((session) =>
      session.windowRestoreEligible
        ? [
            {
              id: session.id,
              name: session.name,
              cwd: session.cwd,
              isActive: session.id === this.activeId,
              startedAt: session.startedAt,
              ...(session.resumeIdentity ? { identity: session.resumeIdentity } : {})
            }
          ]
        : []
    );
  }

  restorableSession(id: string): RestorableSessionState | undefined {
    return this.restorableSessions().find((session) => session.id === id);
  }

  refreshCommunicationHealth(): void {
    this.communication.refreshConfig();
  }

  snapshots(): SessionSnapshot[] {
    return [...this.sessions.values()].map((session) => this.snapshot(session));
  }

  replays(): Record<string, string> {
    return Object.fromEntries(
      [...this.sessions.values()].map((session) => [session.id, session.output.toString()])
    );
  }

  dispose(): void {
    this.communication.dispose();
    this.ptyHost.dispose();
    this.sessions.clear();
  }

  private spawn(session: SessionRecord): void {
    const config = this.getProcessConfig();
    const info = this.ptyHost.spawn(session.id, session.cwd, session.size, {
      ...config,
      launchCommand: session.launchCommand ?? config.launchCommand
    });
    if (!info) return;
    session.pid = info.pid;
    this.communication.setPid(session.id, info.pid);
    session.spawnDurationMs = info.durationMs;
    this.callbacks.onStartupTiming({
      id: session.id,
      name: session.name,
      phase: 'spawned',
      durationMs: info.durationMs,
      pid: info.pid
    });
    this.callbacks.onStateChanged();
  }

  private handlePtyData(id: string, data: string): void {
    const session = this.sessions.get(id);
    if (!session) return;
    if (session.startupDurationMs === undefined) {
      this.finishStartup(session, 'firstOutput');
      this.callbacks.onStateChanged();
    }
    this.communication.recordPtyOutput(id, data);
    session.output.append(data);
    this.callbacks.onOutput(id, data);
  }

  private handlePtyExit(id: string, exitCode: number): void {
    const session = this.sessions.get(id);
    if (!session) return;
    if (session.startupDurationMs === undefined) {
      this.finishStartup(session, 'exitedBeforeOutput', `exit ${exitCode}`);
    }
    session.exitCode = exitCode;
    const message = `\r\n[Agent process exited with code ${exitCode}]\r\n`;
    this.communication.recordPtyOutput(id, message);
    session.output.append(message);
    this.callbacks.onOutput(id, message);
    this.setDetectedStatus(id, 'completed', true, `exit ${exitCode}`);
  }

  private handlePtyError(id: string, error: Error): void {
    const session = this.sessions.get(id);
    if (!session) return;
    if (session.startupDurationMs === undefined) {
      this.finishStartup(session, 'failedBeforeOutput', error.message);
    }
    session.exitCode = -1;
    const message = `\r\n[Unable to start Agent CLI: ${error.message}]\r\n`;
    this.communication.recordPtyOutput(id, message);
    session.output.append(message);
    this.callbacks.onOutput(id, message);
    this.setDetectedStatus(id, 'completed', true, error.message);
  }

  private finishStartup(
    session: SessionRecord,
    phase: Exclude<SessionStartupTiming['phase'], 'spawned'>,
    detail?: string
  ): void {
    session.startupDurationMs = Math.max(0, Date.now() - session.startedAt);
    this.callbacks.onStartupTiming({
      id: session.id,
      name: session.name,
      phase,
      durationMs: session.startupDurationMs,
      ...(session.pid === undefined ? {} : { pid: session.pid }),
      ...(detail ? { detail } : {})
    });
  }

  private snapshot(session: SessionRecord): SessionSnapshot {
    const communication = this.communication.snapshot(session.id, session.status);
    return {
      id: session.id,
      name: session.name,
      cwd: session.cwd,
      status: session.status,
      unread: session.unread,
      isActive: session.id === this.activeId,
      canRestart: session.canRestart,
      launchSource: session.launchSource,
      ...(session.spawnDurationMs === undefined
        ? {}
        : { spawnDurationMs: session.spawnDurationMs }),
      ...(session.startupDurationMs === undefined
        ? { startupElapsedMs: Math.max(0, Date.now() - session.startedAt) }
        : { startupDurationMs: session.startupDurationMs }),
      ...(communication ? { communication } : {}),
      ...(session.exitCode === undefined ? {} : { exitCode: session.exitCode })
    };
  }
}

function normalizeSize(size: PtySize): PtySize {
  return {
    cols: Number.isFinite(size.cols) ? Math.max(2, Math.floor(size.cols)) : 80,
    rows: Number.isFinite(size.rows) ? Math.max(2, Math.floor(size.rows)) : 24
  };
}
