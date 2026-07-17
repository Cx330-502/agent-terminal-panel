import assert from 'node:assert/strict';
import test from 'node:test';
import {
  deriveLinuxNetworkSample,
  parseLinuxSocketTable
} from '../src/communication/linuxNetworkProbe';

const SS_FIXTURE = `ESTAB 0 0 127.0.0.1:50000 127.0.0.1:8080 users:(("codex",pid=100,fd=4))
 cubic bytes_sent:1000 bytes_acked:901 bytes_received:500
ESTAB 0 0 127.0.0.1:8080 127.0.0.1:50000 users:(("cc-switch",pid=200,fd=14))
 cubic bytes_sent:520 bytes_acked:501 bytes_received:1010
ESTAB 0 0 10.0.0.2:41000 203.0.113.10:443 users:(("cc-switch",pid=200,fd=15))
 cubic bytes_sent:1200 bytes_acked:1100 bytes_received:700
`;

test('Linux ss parser retains cumulative TCP byte counters', () => {
  const parsed = parseLinuxSocketTable(SS_FIXTURE);
  assert.equal(parsed.length, 3);
  assert.deepEqual(parsed[0]?.owners[0], { name: 'codex', pid: 100, fd: 4 });
  assert.equal(parsed[0]?.sentBytes, 901);
  assert.equal(parsed[0]?.receivedBytes, 500);
});

test('Linux probe correlates an Agent loopback socket with shared proxy upstream traffic', () => {
  const sample = deriveLinuxNetworkSample(parseLinuxSocketTable(SS_FIXTURE), new Set([100]));
  assert.equal(sample.available, true);
  assert.equal(sample.loopback, true);
  assert.equal(sample.sockets.length, 1);
  assert.equal(sample.sockets[0]?.processName, 'codex');
  assert.equal(sample.proxy?.processName, 'cc-switch');
  assert.equal(sample.proxy?.shared, true);
  assert.equal(sample.proxy?.sockets[0]?.sentBytes, 1100);
  assert.equal(sample.proxy?.sockets[0]?.receivedBytes, 700);
});
