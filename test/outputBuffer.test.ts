import assert from 'node:assert/strict';
import test from 'node:test';
import { OutputBuffer } from '../src/outputBuffer';

test('output buffer retains recent complete chunks within its cap', () => {
  const buffer = new OutputBuffer(8);
  buffer.append('1234');
  buffer.append('中文');
  buffer.append('xy');
  assert.equal(buffer.toString(), '中文xy');
  buffer.clear();
  assert.equal(buffer.toString(), '');
});
