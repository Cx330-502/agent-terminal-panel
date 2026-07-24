import assert from 'node:assert/strict';
import test from 'node:test';
import {
  mergeLaunchProfiles,
  normalizeLaunchCommands,
  normalizeLaunchProfiles
} from '../src/launchProfiles';

test('launch commands normalize key-value settings without array JSON', () => {
  assert.deepEqual(
    normalizeLaunchCommands({
      ' Claude ': ' claude ',
      'Codex Full Auto': 'codex --full-auto',
      Empty: '  ',
      Invalid: 42
    }),
    [
      { id: 'command:Claude', name: 'Claude', command: 'claude' },
      {
        id: 'command:Codex Full Auto',
        name: 'Codex Full Auto',
        command: 'codex --full-auto'
      }
    ]
  );
  assert.deepEqual(normalizeLaunchCommands([]), []);
});

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

test('key-value launch commands take precedence over same-named legacy profiles', () => {
  assert.deepEqual(
    mergeLaunchProfiles(
      normalizeLaunchCommands({ Claude: 'claude --model opus' }),
      normalizeLaunchProfiles([
        { name: 'Claude', command: 'claude' },
        { name: 'Gemini', command: 'gemini' }
      ])
    ),
    [
      { id: 'command:Claude', name: 'Claude', command: 'claude --model opus' },
      { id: 'profile-1', name: 'Gemini', command: 'gemini' }
    ]
  );
});
