import assert from 'node:assert/strict';
import test from 'node:test';
import {
  isSessionVisible,
  shouldPlayCompletionSound,
  shouldShowToast
} from '../src/notificationPolicy';

test('a session is visible only when the view, window and active session all match', () => {
  assert.equal(
    isSessionVisible({ viewVisible: true, windowFocused: true, isActiveSession: true }),
    true
  );
  assert.equal(
    isSessionVisible({ viewVisible: true, windowFocused: false, isActiveSession: true }),
    false
  );
  assert.equal(
    isSessionVisible({ viewVisible: true, windowFocused: true, isActiveSession: false }),
    false
  );
});

test('toast and completion sound policies match hidden-focus behavior', () => {
  assert.equal(shouldShowToast(true, true), false);
  assert.equal(shouldShowToast(true, false), true);
  assert.equal(shouldShowToast(false, false), false);
  assert.equal(shouldPlayCompletionSound('never', false), false);
  assert.equal(shouldPlayCompletionSound('whenHidden', true), false);
  assert.equal(shouldPlayCompletionSound('whenHidden', false), true);
  assert.equal(shouldPlayCompletionSound('always', true), true);
});
