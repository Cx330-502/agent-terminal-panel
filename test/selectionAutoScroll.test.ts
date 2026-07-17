import assert from 'node:assert/strict';
import test from 'node:test';
import { scrollLinesForPointer } from '../media/selectionAutoScroll';

const rect = {
  top: 100,
  bottom: 500,
  height: 400
} as DOMRect;

test('selection edge scrolling is directional and proportional', () => {
  assert.equal(scrollLinesForPointer(300, rect), 0);
  assert.equal(scrollLinesForPointer(120, rect), -2);
  assert.equal(scrollLinesForPointer(100, rect), -3);
  assert.equal(scrollLinesForPointer(480, rect), 2);
  assert.equal(scrollLinesForPointer(500, rect), 3);
});
