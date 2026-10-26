import assert from 'node:assert/strict';
import test from 'node:test';
import { isApprovalDecisionInput, isSubmissionInput, META_ENTER } from '../src/input';

test('ordinary enter submits while multiline bracketed paste does not', () => {
  assert.equal(isSubmissionInput('hello\r'), true);
  assert.equal(isSubmissionInput('\u001b[200~第一行\r第二行\u001b[201~'), false);
  assert.equal(isSubmissionInput('\u001b[200~内容\u001b[201~\r'), true);
});

test('Meta+Enter inserts a Claude composer newline without starting a turn', () => {
  assert.equal(isSubmissionInput(META_ENTER), false);
  assert.equal(isSubmissionInput(`first${META_ENTER}second\r`), true);
});

test('approval decisions ignore bracketed paste content', () => {
  assert.equal(isApprovalDecisionInput('y'), true);
  assert.equal(isApprovalDecisionInput('\u001b[200~yes\u001b[201~'), false);
});
