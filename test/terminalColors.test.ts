import assert from 'node:assert/strict';
import test from 'node:test';
import { isTerminalColors, TerminalColorResponder } from '../src/terminalColors';

const colors = { 10: '#cccccc', 11: '#1e1e1e', 12: '#ffffff' };

test('OSC 10/11/12 probes are answered once and excluded from replay at every chunk boundary', () => {
  const input = '中文\x1b]10;?\x07\x1b]11;?\x1b\\\x1b]12;?\x07\x1b[48;2;58;58;58m输入区';
  for (let split = 0; split <= input.length; split++) {
    const responder = new TerminalColorResponder(colors);
    const first = responder.transform(input.slice(0, split));
    const second = responder.transform(input.slice(split));
    assert.equal(first.output + second.output, '中文\x1b[48;2;58;58;58m输入区');
    assert.deepEqual([...first.replies, ...second.replies], [
      '\x1b]10;rgb:cccc/cccc/cccc\x1b\\',
      '\x1b]11;rgb:1e1e/1e1e/1e1e\x1b\\',
      '\x1b]12;rgb:ffff/ffff/ffff\x1b\\'
    ]);
  }
});

test('color setters delegate queries to xterm until reset or theme change', () => {
  const responder = new TerminalColorResponder(colors);
  const setter = '\x1b]11;#333333\x07';
  const query = '\x1b]11;?\x07';
  assert.equal(responder.transform(setter + query).output, setter + query);
  responder.setColors(colors);
  assert.equal(responder.transform(query).output, query);
  responder.transform('\x1b]111\x07');
  assert.equal(responder.transform(query).replies.length, 1);
  responder.transform(setter);
  responder.setColors({ ...colors, 11: '#fafafa' });
  assert.deepEqual(responder.transform(query).replies, ['\x1b]11;rgb:fafa/fafa/fafa\x1b\\']);
});

test('unknown palette, chained queries, Sixel, titles and cancellation pass through intact', () => {
  const query = '\x1b]11;?\x07';
  assert.equal(new TerminalColorResponder().transform(query).output, query);
  for (const data of [
    '\x1b]10;?;?\x07',
    '\x1bPq"1;1;48;48#1;2;100;20;80!48~\x1b\\',
    '\x1bPpayload\x1b]11;?\x07\x1b\\',
    '\x1b]0;' + 'a'.repeat(5000) + '\x1b]11;?\x07',
    '\x1b]11;?\x18'
  ]) {
    const responder = new TerminalColorResponder(colors);
    let output = '';
    for (const char of data) {
      const result = responder.transform(char);
      assert.equal(result.replies.length, 0);
      output += result.output;
    }
    assert.equal(output, data);
    assert.equal(responder.transform(query).replies.length, 1);
  }
  const responder = new TerminalColorResponder(colors);
  responder.transform('\x1b]11;');
  assert.equal(responder.flush(), '\x1b]11;');
});

test('Webview palette boundary accepts only three complete RGB colors', () => {
  assert.equal(isTerminalColors(colors), true);
  for (const invalid of [undefined, {}, { ...colors, 11: '\x1b]11;?\x07' }, { ...colors, 12: '#fff' }]) {
    assert.equal(isTerminalColors(invalid), false);
  }
});
