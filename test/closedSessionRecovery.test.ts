import assert from 'node:assert/strict';
import test from 'node:test';
import { ClosedSessionStore } from '../src/closedSessionStore';

test('closed session recovery keeps the newest bounded entries', () => {
  let now = 1_000;
  const store = new ClosedSessionStore(60_000, 2, () => now);
  store.add(session('One'));
  now++;
  store.add(session('Two'));
  now++;
  store.add(session('Three'));

  assert.deepEqual(store.summary(), { count: 2, name: 'Three' });
  assert.equal(store.take()?.name, 'Three');
  assert.equal(store.take()?.name, 'Two');
});

test('closed session recovery expires entries and can restore a cancelled reopen', () => {
  let now = 5_000;
  const store = new ClosedSessionStore(1_000, 10, () => now);
  const entry = store.add(session('Recoverable'));
  assert.equal(store.take(entry.id)?.name, 'Recoverable');
  store.restore(entry);
  assert.deepEqual(store.summary(), { count: 1, name: 'Recoverable' });

  now += 1_001;
  assert.deepEqual(store.summary(), { count: 0 });
});

function session(name: string) {
  return {
    name,
    cwd: '/workspace/project',
    options: { name, launchCommand: 'codex' }
  };
}
