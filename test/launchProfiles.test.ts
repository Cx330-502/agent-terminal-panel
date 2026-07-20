import assert from 'node:assert/strict';
import test from 'node:test';
import { normalizeLaunchProfiles } from '../src/launchProfiles';

test('launch profiles preserve order and trim display names plus commands', () => {
  assert.deepEqual(
    normalizeLaunchProfiles([
      { name: ' Claude ', command: ' claude ' },
      { name: 'Codex Full Auto', command: 'codex --full-auto' }
    ]),
    [
      { id: 'profile-0', name: 'Claude', command: 'claude' },
      { id: 'profile-1', name: 'Codex Full Auto', command: 'codex --full-auto' }
    ]
  );
});

test('launch profiles ignore malformed or empty entries without reindexing valid items', () => {
  assert.deepEqual(
    normalizeLaunchProfiles([
      null,
      { name: 'Missing command' },
      { name: '  ', command: 'ignored' },
      { name: 'Gemini', command: ' gemini --model pro ', extra: true }
    ]),
    [{ id: 'profile-3', name: 'Gemini', command: 'gemini --model pro' }]
  );
  assert.deepEqual(normalizeLaunchProfiles({ name: 'Claude', command: 'claude' }), []);
});
