import assert from 'node:assert/strict';
import test from 'node:test';
import { StatusDetector, classifyScreen, type StatusUpdate } from '../media/statusDetector';
import { readVisibleScreen } from '../media/terminalScreen';
import type { Terminal } from '@xterm/xterm';

test('status reads live rows while the user scrolls through old prompts', () => {
  const lines = ['› old prompt', 'old output', '• Working (esc to interrupt)', '› composer'];
  const terminal = { rows: 2, buffer: { active: {
    baseY: 2, viewportY: 0, length: lines.length,
    getLine: (index: number) => ({ translateToString: () => lines[index] })
  } } } as unknown as Terminal;
  assert.equal(classifyScreen(readVisibleScreen(terminal)), 'running');
});

test('signals during work and unknown frames do not announce completion', () => {
  const updates: StatusUpdate[] = [];
  const detector = new StatusDetector((update) => updates.push(update));
  detector.onInput('\r');
  detector.onScreen('• Working (esc to interrupt)', false);
  detector.onSignal('• Working (esc to interrupt)', 'BEL');
  detector.onSignal('tool output', 'OSC 9');
  assert.equal(updates.filter((update) => update.attention).length, 0);
  detector.onScreen('› Type a message', true);
  detector.onScreen('• Working (esc to interrupt)', false);
  detector.onScreen('› Type a message', true);
  assert.equal(updates.filter((update) => update.status === 'completed').length, 1);
  detector.onInput('next\r');
  detector.onScreen('• Working (esc to interrupt)', false);
  detector.onScreen('› Type a message', true);
  assert.equal(updates.filter((update) => update.status === 'completed').length, 2);
});

test('stale composer after Enter and reset cannot complete a turn', () => {
  const updates: StatusUpdate[] = [];
  const detector = new StatusDetector((update) => updates.push(update));
  detector.onInput('\r');
  detector.onScreen('› Type a message', true);
  detector.onScreen('• Working (esc to interrupt)', false);
  detector.reset();
  detector.onScreen('› Type a message', true);
  assert.equal(updates.filter((update) => update.status === 'completed').length, 0);
});

test('host echoes of approval and waiting preserve an observed running turn', () => {
  const updates: StatusUpdate[] = [];
  const detector = new StatusDetector((update) => updates.push(update));
  detector.onScreen('• Working (esc to interrupt)', false);
  detector.onScreen('Would you like to run this?', false);
  detector.adoptStatus('approval');
  detector.onInput('y');
  detector.onScreen('Waiting for your response', false);
  detector.adoptStatus('waiting');
  detector.onInput('answer\r');
  detector.onScreen('› Type a message', true);
  assert.equal(updates.filter((update) => update.status === 'completed').length, 1);
});

test('classifies common Agent running, approval, input and idle screens', () => {
  assert.equal(classifyScreen('• Working (2s • esc to interrupt)\n› Ask Codex to do anything'), 'running');
  assert.equal(
    classifyScreen(
      'Would you like to run the following command?\n› 1. Yes, proceed (y)\nPress enter to confirm or esc to cancel'
    ),
    'approval'
  );
  assert.equal(
    classifyScreen('Question 1/1 (1 unanswered)\n› Type your answer (optional)\nenter to submit answer'),
    'waiting'
  );
  assert.equal(classifyScreen('› Ask Codex to do anything\n? for shortcuts 100% context left'), 'idle');
  assert.equal(
    classifyScreen('› Write tests for @filename\ngpt-5.6 · Ready · Context 100% left'),
    'idle'
  );
  assert.equal(classifyScreen('Waiting for your response'), 'waiting');
  assert.equal(classifyScreen('› Type a message to continue'), 'idle');
  assert.equal(
    classifyScreen('Do you trust the contents of this directory?\n› 1. Yes, continue\nPress enter to continue'),
    'approval'
  );
});

test('classifies Claude Code spinner, permission, question and composer screens', () => {
  const composer = '────────\n> \n────────\n  ? for shortcuts';
  assert.equal(classifyScreen(`✻ Thinking… (12s · ↓ 1.2k tokens)\n${composer}`), 'running');
  assert.equal(classifyScreen(`· Cogitating…\n${composer}`), 'running');
  assert.equal(classifyScreen(`✻ Worked for 1m 3s\n${composer}`), 'idle');
  assert.equal(classifyScreen('> Try "refactor <filepath>"\n  ⏵⏵ accept edits on (shift+tab to cycle)'), 'idle');
  assert.equal(
    classifyScreen(
      'Do you want to make this edit to app.ts?\n❯ 1. Yes\n  2. Yes, allow all edits during this session (shift+tab)\n  3. No, and tell Claude what to do differently (esc)'
    ),
    'approval'
  );
  assert.equal(classifyScreen('Bash command\nDo you want to proceed?\n❯ 1. Yes\n  2. No'), 'approval');
  assert.equal(classifyScreen('Do you trust the files in this folder?\n❯ 1. Yes, proceed'), 'approval');
  assert.equal(
    classifyScreen('Which database?\n❯ 1. Postgres\n  2. SQLite\nEnter to select · ↑/↓ to navigate · Esc to cancel'),
    'waiting'
  );
  // A question in Claude's prose is not a permission dialog.
  assert.equal(classifyScreen(`Do you want to create a migration as well?\n${composer}`), 'idle');
  assert.equal(classifyScreen('❯ 1. Opus\n  2. Sonnet'), 'unknown');
});

test('a Claude turn completes when the spinner gives way to the composer', () => {
  const updates: StatusUpdate[] = [];
  const detector = new StatusDetector((update) => updates.push(update));
  detector.onScreen('> \n  ? for shortcuts', true);
  detector.onInput('fix the tests\r');
  detector.onScreen('✶ Pondering… (esc to interrupt)\n> \n', false);
  detector.onScreen('✻ Brewed for 4s\n> \n  ? for shortcuts', true);
  assert.deepEqual(
    updates.map(({ status, attention }) => ({ status, attention })),
    [
      { status: 'waiting', attention: false },
      { status: 'running', attention: false },
      { status: 'completed', attention: true }
    ]
  );
});

test('initial idle becomes waiting without a completion notification', () => {
  const updates: StatusUpdate[] = [];
  const detector = new StatusDetector((update) => updates.push(update));
  detector.onScreen('› Type a message', true);
  assert.deepEqual(updates, [{ status: 'waiting', attention: false, detail: undefined }]);
});

test('submitted turn completes once when an Agent returns to the composer', () => {
  const updates: StatusUpdate[] = [];
  const detector = new StatusDetector((update) => updates.push(update));
  detector.onScreen('› Type a message', true);
  detector.onInput('fix the tests\r');
  detector.onScreen('• Working (1s • esc to interrupt)', false);
  detector.onScreen('› Type a message', true);
  detector.onScreen('› Type a message', true);
  assert.deepEqual(
    updates.map(({ status, attention }) => ({ status, attention })),
    [
      { status: 'waiting', attention: false },
      { status: 'running', attention: false },
      { status: 'completed', attention: true }
    ]
  );
});

test('approval and request-user-input states request attention once', () => {
  const updates: StatusUpdate[] = [];
  const detector = new StatusDetector((update) => updates.push(update));
  const approval =
    'Would you like to grant these permissions?\n› 1. Yes, grant these permissions for this turn\nPress enter to confirm or esc to cancel';
  detector.onScreen(approval, false);
  detector.onSignal(approval, 'BEL');
  detector.onInput('y');
  detector.onScreen('Question 1/1 (1 unanswered)\nenter to submit answer', false);
  assert.deepEqual(
    updates.map(({ status, attention }) => ({ status, attention })),
    [
      { status: 'approval', attention: true },
      { status: 'running', attention: false },
      { status: 'waiting', attention: true }
    ]
  );
});

test('startup trust approval returns to waiting instead of reporting a completed turn', () => {
  const updates: StatusUpdate[] = [];
  const detector = new StatusDetector((update) => updates.push(update));
  detector.onScreen(
    'Do you trust the contents of this directory?\n› 1. Yes, continue\nPress enter to continue',
    false
  );
  detector.onInput('\r');
  detector.onScreen('› Write tests for @filename\nReady · Context 100% left', true);
  assert.deepEqual(
    updates.map(({ status, attention }) => ({ status, attention })),
    [
      { status: 'approval', attention: true },
      { status: 'running', attention: false },
      { status: 'waiting', attention: false }
    ]
  );
});
