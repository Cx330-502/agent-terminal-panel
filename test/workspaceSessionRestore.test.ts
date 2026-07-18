import assert from 'node:assert/strict';
import test from 'node:test';
import { SessionHistoryRegistry } from '../src/sessionHistory/registry';
import type { AgentSessionProvider, HistoricalSession } from '../src/sessionHistory/types';
import {
  detectLaunchProvider,
  matchTrackedSessions,
  WorkspaceSessionRestore,
  type WorkspaceState
} from '../src/workspaceSessionRestore';

test('workspace restore keeps pending sessions until manual restore and explicit close', async () => {
  const state = new FakeWorkspaceState({
    version: 1,
    sessions: [entry('codex', 'old-session', 'Old Agent', 0, true)]
  });
  const restore = new WorkspaceSessionRestore(
    state,
    ['/workspace/project'],
    new SessionHistoryRegistry([]),
    { onIdentity() {}, onPendingChanged() {} }
  );

  assert.deepEqual(restore.summary(), { count: 1, names: ['Old Agent'] });
  const [pending] = restore.takePending();
  assert.equal(restore.summary().count, 0);
  assert.equal(pending?.sessionId, 'old-session');

  restore.syncCurrent([
    {
      id: 'live-1',
      name: 'Renamed Agent',
      cwd: '/workspace/project',
      isActive: true,
      startedAt: 200,
      identity: {
        providerId: 'codex',
        providerName: 'Codex',
        sessionId: 'old-session'
      }
    }
  ]);
  await flushUpdates();
  assert.equal(state.sessions()[0]?.name, 'Renamed Agent');

  restore.syncCurrent([]);
  await flushUpdates();
  assert.deepEqual(state.sessions(), []);
  restore.dispose();
});

test('sessions without provider resume identity are never persisted', async () => {
  const state = new FakeWorkspaceState();
  const restore = new WorkspaceSessionRestore(
    state,
    ['/workspace/project'],
    new SessionHistoryRegistry([]),
    { onIdentity() {}, onPendingChanged() {} }
  );
  restore.syncCurrent([
    {
      id: 'custom-1',
      name: 'cc-switch',
      cwd: '/workspace/project',
      isActive: true,
      startedAt: 100
    }
  ]);
  await flushUpdates();
  assert.deepEqual(state.sessions(), []);
  restore.dispose();
});

test('launch provider detection covers direct Codex and Claude commands only', () => {
  assert.equal(detectLaunchProvider('codex --profile work'), 'codex');
  assert.equal(detectLaunchProvider('env PROFILE=work /usr/local/bin/claude --model opus'), 'claude');
  assert.equal(detectLaunchProvider('npx codex'), 'codex');
  assert.equal(detectLaunchProvider('cc-switch-cli'), undefined);
  assert.equal(detectLaunchProvider('bash -lc codex'), undefined);
});

test('tracked launches match unclaimed provider sessions by cwd, provider and start time', () => {
  const sessions: HistoricalSession[] = [
    historical('codex', 'already-claimed', '/workspace/project', 900),
    historical('claude', 'claude-new', '/workspace/project', 1_100),
    historical('codex', 'codex-new', '/workspace/project', 1_050),
    historical('codex', 'wrong-cwd', '/workspace/other', 1_010)
  ];
  const matches = matchTrackedSessions(
    [
      {
        id: 'launch-1',
        cwd: '/workspace/project',
        startedAt: 1_000,
        expectedProviderId: 'codex'
      },
      {
        id: 'launch-2',
        cwd: '/workspace/project',
        startedAt: 1_060,
        expectedProviderId: 'claude'
      }
    ],
    sessions,
    new Set(['codex:already-claimed'])
  );
  assert.deepEqual(
    matches.map((match) => [match.tracked.id, match.session.sessionId]),
    [
      ['launch-1', 'codex-new'],
      ['launch-2', 'claude-new']
    ]
  );
});

test('default-session tracking resolves a new provider identity in the background', async (t) => {
  let resolved: { id: string; sessionId: string } | undefined;
  const provider: AgentSessionProvider = {
    id: 'codex',
    name: 'Codex',
    async discover() {
      return [historical('codex', 'new-session', '/workspace/project', Date.now())];
    },
    buildLaunchCommand(session) {
      return `codex resume ${session.sessionId}`;
    }
  };
  const restore = new WorkspaceSessionRestore(
    new FakeWorkspaceState(),
    ['/workspace/project'],
    new SessionHistoryRegistry([provider]),
    {
      onIdentity(id, identity) {
        resolved = { id, sessionId: identity.sessionId };
      },
      onPendingChanged() {}
    }
  );
  t.after(() => restore.dispose());
  restore.trackDefaultSession(
    {
      id: 'launch-1',
      name: 'Agent 1',
      cwd: '/workspace/project',
      isActive: true,
      startedAt: Date.now()
    },
    'codex'
  );
  await waitFor(() => resolved !== undefined);
  assert.deepEqual(resolved, { id: 'launch-1', sessionId: 'new-session' });
});

function entry(
  providerId: string,
  sessionId: string,
  name: string,
  order: number,
  isActive: boolean
): Record<string, unknown> {
  return {
    providerId,
    providerName: providerId === 'codex' ? 'Codex' : 'Claude Code',
    sessionId,
    name,
    cwd: '/workspace/project',
    updatedAt: 100,
    order,
    isActive
  };
}

function historical(
  providerId: string,
  sessionId: string,
  cwd: string,
  updatedAt: number
): HistoricalSession {
  return {
    providerId,
    providerName: providerId,
    sessionId,
    cwd,
    title: sessionId,
    updatedAt,
    supportsFork: true
  };
}

class FakeWorkspaceState implements WorkspaceState {
  private value: unknown;

  constructor(initial?: unknown) {
    this.value = initial;
  }

  get<T>(): T | undefined {
    return this.value as T | undefined;
  }

  async update(_key: string, value: unknown): Promise<void> {
    this.value = value;
  }

  sessions(): Array<Record<string, unknown>> {
    const value = this.value as { sessions?: unknown[] } | undefined;
    return (value?.sessions ?? []).filter(
      (session): session is Record<string, unknown> =>
        Boolean(session && typeof session === 'object' && !Array.isArray(session))
    );
  }
}

async function flushUpdates(): Promise<void> {
  await Promise.resolve();
  await Promise.resolve();
  await new Promise<void>((resolve) => setImmediate(resolve));
}

async function waitFor(predicate: () => boolean): Promise<void> {
  const deadline = Date.now() + 2_000;
  while (!predicate()) {
    if (Date.now() > deadline) throw new Error('Timed out waiting for session identity');
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
}
