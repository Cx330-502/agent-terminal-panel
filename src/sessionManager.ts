import { randomUUID } from 'node:crypto';
import type { AgentProcessConfig } from './config';
import { isApprovalDecisionInput, isSubmissionInput } from './input';
import { OutputBuffer } from './outputBuffer';
import { PtyHost, type PtySize } from './ptyHost';
import type { SessionSnapshot, SessionStatus } from './shared';

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
}

export class SessionManager {
  private readonly sessions = new Map<string, SessionRecord>();
  private readonly ptyHost: PtyHost;
  private activeId: string | undefined;
  private nameCounter = 0;

  constructor(
    private readonly getProcessConfig: () => AgentProcessConfig,
    private readonly callbacks: SessionManagerCallbacks
  ) {
    this.ptyHost = new PtyHost({
      onData: (id, data) => this.handlePtyData(id, data),
      onExit: (id, exitCode) => this.handlePtyExit(id, exitCode),
      onError: (id, error) => this.handlePtyError(id, error)
    });
  }

  create(cwd: string, size: PtySize): string {
    const id = randomUUID();
    const session: SessionRecord = {
      id,
      name: `Agent ${++this.nameCounter}`,
      cwd,
      status: 'running',
      unread: false,
      size: normalizeSize(size),
      activityEpoch: 0,
      output: new OutputBuffer()
    };
    this.sessions.set(id, session);
    this.activeId = id;
    this.callbacks.onStateChanged();
    this.spawn(session);
    return id;
  }

  close(id: string): void {
    const ids = [...this.sessions.keys()];
    const index = ids.indexOf(id);
    if (index < 0) return;
    this.ptyHost.kill(id);
    this.sessions.delete(id);
    if (this.activeId === id) {
      const remaining = [...this.sessions.keys()];
      this.activeId = remaining[Math.min(index, remaining.length - 1)];
    }
    this.callbacks.onStateChanged();
  }

  restart(id: string): void {
    const session = this.sessions.get(id);
    if (!session) return;
    this.ptyHost.kill(id);
    session.output.clear();
    session.exitCode = undefined;
    session.unread = false;
    session.status = 'running';
    session.activityEpoch++;
    session.lastAttentionKey = undefined;
    this.callbacks.onClear(id);
    this.callbacks.onStateChanged();
    this.spawn(session);
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

  snapshots(): SessionSnapshot[] {
    return [...this.sessions.values()].map((session) => this.snapshot(session));
  }

  replays(): Record<string, string> {
    return Object.fromEntries(
      [...this.sessions.values()].map((session) => [session.id, session.output.toString()])
    );
  }

  dispose(): void {
    this.ptyHost.dispose();
    this.sessions.clear();
  }

  private spawn(session: SessionRecord): void {
    this.ptyHost.spawn(session.id, session.cwd, session.size, this.getProcessConfig());
  }

  private handlePtyData(id: string, data: string): void {
    const session = this.sessions.get(id);
    if (!session) return;
    session.output.append(data);
    this.callbacks.onOutput(id, data);
  }

  private handlePtyExit(id: string, exitCode: number): void {
    const session = this.sessions.get(id);
    if (!session) return;
    session.exitCode = exitCode;
    const message = `\r\n[Agent process exited with code ${exitCode}]\r\n`;
    session.output.append(message);
    this.callbacks.onOutput(id, message);
    this.setDetectedStatus(id, 'completed', true, `exit ${exitCode}`);
  }

  private handlePtyError(id: string, error: Error): void {
    const session = this.sessions.get(id);
    if (!session) return;
    session.exitCode = -1;
    const message = `\r\n[Unable to start Agent CLI: ${error.message}]\r\n`;
    session.output.append(message);
    this.callbacks.onOutput(id, message);
    this.setDetectedStatus(id, 'completed', true, error.message);
  }

  private snapshot(session: SessionRecord): SessionSnapshot {
    return {
      id: session.id,
      name: session.name,
      cwd: session.cwd,
      status: session.status,
      unread: session.unread,
      isActive: session.id === this.activeId,
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
