import assert from 'node:assert/strict';
import test from 'node:test';
import { StatusDetector, classifyScreen, type StatusUpdate } from '../media/statusDetector';

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
