import assert from 'node:assert/strict';
import test from 'node:test';
import { Terminal } from '@xterm/xterm';
import { ScrollRegionScrollbackCompat } from '../media/scrollbackCompat';

const ESC = '\x1b';

function regionScroll(bottom: number, count: number): string {
  return `${ESC}[1;${bottom}r${ESC}[${count}S${ESC}[r`;
}

function compatibleRegionScroll(bottom: number, count: number): string {
  return `${ESC}[1;${bottom}r${ESC}[${bottom};1H${'\n'.repeat(count)}${ESC}[r`;
}

test('rewrites only the complete top-anchored region scroll sequence', () => {
  const compat = new ScrollRegionScrollbackCompat();
  const input = `before${regionScroll(20, 3)}after`;

  assert.equal(
    compat.transform(input),
    `before${compatibleRegionScroll(20, 3)}after`
  );
});

test('preserves the rewrite across every two-chunk split and character-sized chunks', () => {
  const input = `prefix${regionScroll(18, 4)}suffix`;
  const expected = `prefix${compatibleRegionScroll(18, 4)}suffix`;

  for (let split = 0; split <= input.length; split++) {
    const compat = new ScrollRegionScrollbackCompat();
    const output = compat.transform(input.slice(0, split)) + compat.transform(input.slice(split));
    assert.equal(output, expected, `split at ${split}`);
  }

  const compat = new ScrollRegionScrollbackCompat();
  assert.equal(
    Array.from(input, (character) => compat.transform(character)).join(''),
    expected
  );
});

test('keeps state from replay output until live output completes the sequence', () => {
  const sequence = regionScroll(12, 2);
  const split = sequence.indexOf(`${ESC}[2S`) + 3;
  const compat = new ScrollRegionScrollbackCompat();

  const replay = compat.transform(`history${sequence.slice(0, split)}`);
  const live = compat.transform(`${sequence.slice(split)}next`);

  assert.equal(replay + live, `history${compatibleRegionScroll(12, 2)}next`);
});

test('passes unrelated and invalid scroll sequences through unchanged', () => {
  const values = [
    `${ESC}[2;20r${ESC}[3S${ESC}[r`,
    `${ESC}[1;20r${ESC}[S${ESC}[r`,
    `${ESC}[1;5r${ESC}[6S${ESC}[r`,
    `${ESC}[1;20r${ESC}[3T${ESC}[r`,
    `${ESC}[1;20r${ESC}[3S${ESC}[?25h`
  ];

  for (const value of values) {
    const compat = new ScrollRegionScrollbackCompat();
    assert.equal(compat.transform(`${value}!`), `${value}!`);
  }
});

test('reset discards an incomplete compatibility candidate', () => {
  const compat = new ScrollRegionScrollbackCompat();
  assert.equal(compat.transform(`${ESC}[1;20r${ESC}[3S`), '');
  compat.reset();
  assert.equal(compat.transform('plain output'), 'plain output');
});

test('preserves xterm viewport and cursor while retaining the lines CSI S deletes', async () => {
  const markers = Array.from(
    { length: 120 },
    (_, index) => `REGION-${String(index + 1).padStart(3, '0')}\r\n`
  ).join('');
  const sequence = regionScroll(5, 5);
  const compat = new ScrollRegionScrollbackCompat();

  const original = await render(markers + sequence);
  const rewritten = await render(compat.transform(markers + sequence));

  assert.deepEqual(original.missing, [112, 113, 114, 115, 116]);
  assert.deepEqual(rewritten.missing, []);
  assert.deepEqual(rewritten.visible, original.visible);
  assert.deepEqual(rewritten.cursor, original.cursor);
});

async function render(data: string): Promise<{
  missing: number[];
  visible: string[];
  cursor: { x: number; y: number };
}> {
  const terminal = new Terminal({ cols: 80, rows: 10, scrollback: 1000 });
  await new Promise<void>((resolve) => terminal.write(data, resolve));
  const buffer = terminal.buffer.active;
  const seen = new Set<number>();
  for (let index = 0; index < buffer.length; index++) {
    const match = buffer.getLine(index)?.translateToString(true).match(/REGION-(\d{3})/u);
    if (match) seen.add(Number(match[1]));
  }
  const missing = Array.from({ length: 120 }, (_, index) => index + 1).filter(
    (value) => !seen.has(value)
  );
  const visible = Array.from({ length: terminal.rows }, (_, index) =>
    buffer.getLine(buffer.viewportY + index)?.translateToString(true) ?? ''
  );
  const cursor = { x: buffer.cursorX, y: buffer.cursorY };
  terminal.dispose();
  return { missing, visible, cursor };
}
