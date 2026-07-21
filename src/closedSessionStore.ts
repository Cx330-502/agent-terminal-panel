import { randomUUID } from 'node:crypto';
import type { ClosedSessionState } from './sessionManager';
import type { ClosedSessionSummary } from './shared';

const DEFAULT_TTL_MS = 30 * 60_000;
const DEFAULT_LIMIT = 10;

export interface ClosedSessionEntry extends ClosedSessionState {
  id: string;
  closedAt: number;
}

export class ClosedSessionStore {
  private entries: ClosedSessionEntry[] = [];

  constructor(
    private readonly ttlMs = DEFAULT_TTL_MS,
    private readonly limit = DEFAULT_LIMIT,
    private readonly now = () => Date.now()
  ) {}

  add(session: ClosedSessionState): ClosedSessionEntry {
    this.prune();
    const entry = { ...session, id: randomUUID(), closedAt: this.now() };
    this.entries.unshift(entry);
    this.entries.length = Math.min(this.entries.length, this.limit);
    return entry;
  }

  take(id?: string): ClosedSessionEntry | undefined {
    this.prune();
    const index = id ? this.entries.findIndex((entry) => entry.id === id) : 0;
    if (index < 0 || index >= this.entries.length) return undefined;
    return this.entries.splice(index, 1)[0];
  }

  restore(entry: ClosedSessionEntry): void {
    this.prune();
    this.entries = [entry, ...this.entries.filter((item) => item.id !== entry.id)]
      .slice(0, this.limit);
  }

  summary(): ClosedSessionSummary {
    this.prune();
    return {
      count: this.entries.length,
      ...(this.entries[0] ? { name: this.entries[0].name } : {})
    };
  }

  nextExpiryDelay(): number | undefined {
    this.prune();
    const oldest = this.entries.at(-1);
    return oldest ? Math.max(0, oldest.closedAt + this.ttlMs - this.now()) : undefined;
  }

  private prune(): void {
    const threshold = this.now() - this.ttlMs;
    this.entries = this.entries.filter((entry) => entry.closedAt > threshold);
  }
}
