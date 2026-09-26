import assert from 'node:assert/strict';
import test from 'node:test';
import { SessionManager, type SessionAttention } from '../src/sessionManager';
import type { AgentSessionIdentity } from '../src/sessionHistory/types';

const identity: AgentSessionIdentity = {
  providerId: 'codex',
  providerName: 'Codex',
  sessionId: '019f91ef-e88a-79e2-aaa3-bcdf9906e4e7'
};

test('session lifecycle separates Provider continue from launch-command rerun', (t) => {
  const manager = createManager();
  t.after(() => manager.dispose());

  const forkId = manager.create(process.cwd(), { cols: 80, rows: 24 }, {
    launchCommand: idleCommand('fork'),
    launchSource: 'historyFork'
  });
  assert.deepEqual(capabilities(manager, forkId), {
    canContinue: false,
    canRerun: false,
    canRestart: false
  });

  manager.setResumeIdentity(forkId, identity);
  assert.deepEqual(capabilities(manager, forkId), {
    canContinue: true,
    canRerun: false,
    canRestart: true
  });
  const closedFork = manager.close(forkId);
  assert.equal(closedFork?.options.canRerun, false);
  assert.deepEqual(closedFork?.options.resumeIdentity, identity);

  const originalCommand = idleCommand('original');
  const customId = manager.create(process.cwd(), { cols: 80, rows: 24 }, {
    launchCommand: originalCommand,
    launchSource: 'custom'
  });
  manager.setResumeIdentity(customId, identity);
  manager.restart(customId, idleCommand('temporary-resume'));
  assert.equal(manager.savedLaunchCommand(customId), originalCommand);
  assert.equal(manager.get(customId)?.canContinue, true);

  manager.clearResumeIdentity(customId);
  assert.deepEqual(capabilities(manager, customId), {
    canContinue: false,
    canRerun: true,
    canRestart: true
  });
});

test('a panel rename waits for Provider identity and clears only after sync', (t) => {
  const manager = createManager();
  t.after(() => manager.dispose());
  const id = manager.create(process.cwd(), { cols: 80, rows: 24 }, {
    launchCommand: idleCommand('rename'),
    launchSource: 'profile'
  });

  assert.equal(manager.rename(id, '  新名称  '), true);
  assert.equal(manager.get(id)?.name, '新名称');
  assert.equal(manager.providerRenameRequest(id), undefined);

  manager.setResumeIdentity(id, identity);
  assert.deepEqual(manager.providerRenameRequest(id), {
    identity,
    cwd: process.cwd(),
    name: '新名称'
  });
  manager.completeProviderRename(id, '旧名称');
  assert.equal(manager.providerRenameRequest(id)?.name, '新名称');
  manager.completeProviderRename(id, '新名称');
  assert.equal(manager.providerRenameRequest(id), undefined);
});

test('attention is deduplicated per submitted turn, not screen transitions', (t) => {
  const events: SessionAttention[] = [];
  const manager = createManager((event) => events.push(event));
  t.after(() => manager.dispose());
  const id = manager.create(process.cwd(), { cols: 80, rows: 24 });
  manager.write(id, '\r');
  manager.setDetectedStatus(id, 'completed', true);
  manager.setDetectedStatus(id, 'running', false);
  manager.setDetectedStatus(id, 'waiting', true);
  manager.setDetectedStatus(id, 'completed', true);
  assert.equal(events.filter((event) => event.session.status === 'completed').length, 1);
  manager.setDetectedStatus(id, 'running', false);
  manager.write(id, '\r');
  manager.setDetectedStatus(id, 'completed', true);
  assert.equal(events.filter((event) => event.session.status === 'completed').length, 2);
  assert.notEqual(events[0]?.key, events.at(-1)?.key);
  manager.setDetectedStatus(id, 'approval', true);
  manager.write(id, 'y');
  manager.setDetectedStatus(id, 'completed', true);
  assert.equal(events.filter((event) => event.session.status === 'completed').length, 2);
  manager.restart(id);
  manager.setDetectedStatus(id, 'completed', true);
  assert.equal(events.filter((event) => event.session.status === 'completed').length, 3);
});

function createManager(onAttention: (event: SessionAttention) => void = () => {}): SessionManager {
  return new SessionManager(
    () => ({
      launchCommand: idleCommand('default'),
      shell: { path: '', args: [] },
      environment: {},
      terminalImagesEnabled: false,
      vscodeVersion: 'test'
    }),
    () => ({
      enabled: false,
      sampleIntervalMs: 2_000,
      quietThresholdMs: 15_000,
      stalledThresholdMs: 45_000,
      processNetworkEnabled: false,
      codexSessionMetricsEnabled: false
    }),
    {
      onOutput() {},
      onClear() {},
      onStateChanged() {},
      onAttention,
      onStartupTiming() {}
    }
  );
}

function capabilities(manager: SessionManager, id: string): Record<string, boolean> {
  const session = manager.get(id);
  return {
    canContinue: session?.canContinue === true,
    canRerun: session?.canRerun === true,
    canRestart: session?.canRestart === true
  };
}

function idleCommand(label: string): string {
  const script = `setTimeout(() => {}, 10000); // ${label}`;
  return `${quoteCommandArgument(process.execPath)} -e ${quoteCommandArgument(script)}`;
}

function quoteCommandArgument(value: string): string {
  return `"${value.replaceAll('"', '\\"')}"`;
}
