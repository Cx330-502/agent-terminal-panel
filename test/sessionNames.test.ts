import assert from 'node:assert/strict';
import test from 'node:test';
import { allocateAutomaticSessionName } from '../src/sessionNames';

test('automatic Agent names fill the lowest available positive index', () => {
  assert.equal(allocateAutomaticSessionName(['Agent 1', 'Agent 3']), 'Agent 2');
  assert.equal(allocateAutomaticSessionName(['Claude', 'Agent 2']), 'Agent 1');
});

test('renamed or closed automatic names become reusable', () => {
  assert.equal(allocateAutomaticSessionName(['Agent 1', 'Review']), 'Agent 2');
  assert.equal(allocateAutomaticSessionName(['Agent 1']), 'Agent 2');
});

test('reopened automatic sessions keep a free old name and avoid occupied names', () => {
  assert.equal(allocateAutomaticSessionName(['Agent 1'], 'Agent 2'), 'Agent 2');
  assert.equal(allocateAutomaticSessionName(['Agent 1', 'Agent 2'], 'Agent 2'), 'Agent 3');
});

test('only canonical Agent names reserve automatic indexes', () => {
  assert.equal(
    allocateAutomaticSessionName(['Agent 01', 'Agent 0', 'agent 1', 'Agent 2']),
    'Agent 1'
  );
});
