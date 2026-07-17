import assert from 'node:assert/strict';
import test from 'node:test';
import { classifyCommunicationHealth } from '../src/communication/monitor';
import { TrafficMeter } from '../src/communication/trafficMeter';

test('traffic meter tracks socket deltas without losing cumulative bytes', () => {
  const meter = new TrafficMeter(1000);
  const first = meter.update(
    [socket('one', 1200, 300)],
    2000
  );
  assert.equal(first.receivedBytes, 1200);
  assert.equal(first.sentBytes, 300);
  assert.equal(first.receiveRate, 1200);

  const second = meter.update(
    [socket('one', 1700, 500), socket('two', 100, 50)],
    3000
  );
  assert.equal(second.receivedDelta, 600);
  assert.equal(second.sentDelta, 250);
  assert.equal(second.receivedBytes, 1800);
  assert.equal(second.sentBytes, 550);
});

test('shared proxy meter baselines every newly observed socket', () => {
  const meter = new TrafficMeter(1000, false);
  const first = meter.update([socket('one', 1200, 300)], 2000);
  assert.equal(first.receivedDelta, 0);
  assert.equal(first.sentDelta, 0);

  const second = meter.update(
    [socket('one', 1400, 350), socket('two', 9000, 2000)],
    3000
  );
  assert.equal(second.receivedDelta, 200);
  assert.equal(second.sentDelta, 50);
});

test('communication health prefers network silence and exempts active tool execution', () => {
  const base = {
    status: 'running' as const,
    basis: 'network' as const,
    now: 60_000,
    lastActivityAt: 10_000,
    quietThresholdMs: 15_000,
    stalledThresholdMs: 45_000
  };
  assert.equal(classifyCommunicationHealth(base).health, 'stalled');
  assert.deepEqual(classifyCommunicationHealth({ ...base, providerPhase: 'tool' }), {
    health: 'active',
    basis: 'provider',
    silentForMs: 50_000
  });
  assert.equal(
    classifyCommunicationHealth({ ...base, status: 'waiting' }).health,
    'idle'
  );
});

function socket(key: string, receivedBytes: number, sentBytes: number) {
  return {
    key,
    ownerPid: 1,
    processName: 'agent',
    loopback: false,
    receivedBytes,
    sentBytes
  };
}
