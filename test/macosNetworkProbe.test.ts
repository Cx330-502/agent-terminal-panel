import assert from 'node:assert/strict';
import test from 'node:test';
import { parseNettopCsv } from '../src/communication/macosNetworkProbe';

const NETTOP_FIXTURE = `,bytes_in,bytes_out,
codex.501,1024,256,
"proxy, helper.777",2048,512,
codex.501,128,64,
invalid-row,not-a-number,1,
`;

test('macOS nettop parser reads raw counters and aggregates duplicate PID rows', () => {
  const counters = parseNettopCsv(NETTOP_FIXTURE);
  assert.deepEqual(counters, [
    {
      pid: 501,
      name: 'codex.501',
      receivedBytes: 1152,
      sentBytes: 320
    },
    {
      pid: 777,
      name: 'proxy, helper.777',
      receivedBytes: 2048,
      sentBytes: 512
    }
  ]);
});

test('macOS nettop parser degrades to no counters when required columns are absent', () => {
  assert.deepEqual(parseNettopCsv(',interface,bytes_in,\ncodex.501,en0,100,'), []);
});
