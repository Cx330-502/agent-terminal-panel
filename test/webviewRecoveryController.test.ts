import assert from 'node:assert/strict';
import test from 'node:test';
import {
  WebviewRecoveryController,
  type WebviewRecoveryClock,
  type WebviewReloadReason
} from '../src/webviewRecoveryController';

test('a visible Webview reloads after heartbeat loss and respects the cooldown', () => {
  const clock = new FakeClock();
  const reloads: WebviewReloadReason[] = [];
  const controller = createController(clock, reloads);
  controller.attach(true);

  clock.advance(19_999);
  assert.deepEqual(reloads, []);
  clock.advance(1);
  assert.deepEqual(reloads, ['heartbeatTimeout']);
  clock.advance(20_000);
  assert.deepEqual(reloads, ['heartbeatTimeout']);
  clock.advance(10_000);
  assert.deepEqual(reloads, ['heartbeatTimeout', 'heartbeatTimeout']);

  controller.dispose();
});

test('hidden timer throttling gets a fresh grace period when the view becomes visible', () => {
  const clock = new FakeClock();
  const reloads: WebviewReloadReason[] = [];
  const controller = createController(clock, reloads);
  controller.attach(false);

  clock.advance(60_000);
  controller.setVisible(true);
  clock.advance(19_999);
  assert.deepEqual(reloads, []);
  controller.signal();
  clock.advance(19_999);
  assert.deepEqual(reloads, []);
  clock.advance(1);
  assert.deepEqual(reloads, ['heartbeatTimeout']);

  controller.dispose();
});

test('a failed post is deferred while hidden and reloads once when revealed', () => {
  const clock = new FakeClock();
  const reloads: WebviewReloadReason[] = [];
  const controller = createController(clock, reloads);
  controller.attach(false);

  controller.postMessageFailed();
  controller.postMessageFailed();
  assert.deepEqual(reloads, []);
  controller.setVisible(true);
  assert.deepEqual(reloads, ['postMessageFailed']);
  controller.postMessageFailed();
  assert.deepEqual(reloads, ['postMessageFailed']);

  clock.elapse(30_000);
  controller.postMessageFailed();
  assert.deepEqual(reloads, ['postMessageFailed', 'postMessageFailed']);
  controller.dispose();
});

test('manual reload bypasses automatic recovery cooldown without reviving a detached view', () => {
  const clock = new FakeClock();
  const reloads: WebviewReloadReason[] = [];
  const controller = createController(clock, reloads);
  controller.attach(true);

  controller.postMessageFailed();
  controller.reloadManually();
  assert.deepEqual(reloads, ['postMessageFailed', 'manual']);
  controller.detach();
  controller.reloadManually();
  assert.deepEqual(reloads, ['postMessageFailed', 'manual']);
  controller.dispose();
});

function createController(
  clock: FakeClock,
  reloads: WebviewReloadReason[]
): WebviewRecoveryController {
  return new WebviewRecoveryController((reason) => reloads.push(reason), {
    clock,
    heartbeatTimeoutMs: 20_000,
    reloadCooldownMs: 30_000,
    checkIntervalMs: 1_000
  });
}

class FakeClock implements WebviewRecoveryClock {
  private current = 0;
  private callback: (() => void) | undefined;

  now(): number {
    return this.current;
  }

  repeat(callback: () => void): { dispose(): void } {
    this.callback = callback;
    return {
      dispose: () => {
        this.callback = undefined;
      }
    };
  }

  advance(milliseconds: number): void {
    this.current += milliseconds;
    this.callback?.();
  }

  elapse(milliseconds: number): void {
    this.current += milliseconds;
  }
}
