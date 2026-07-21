const ESC = '\x1b';
const INCOMPLETE = Symbol('incomplete');
const MAX_PARAMETER_DIGITS = 5;
const MAX_REGION_ROWS = 10_000;

type Incomplete = typeof INCOMPLETE;

interface SequenceMatch {
  end: number;
  bottom: number;
  count: number;
}

interface ParsedNumber {
  next: number;
  value: number;
}

/**
 * Work around xtermjs/xterm.js#6010 for the exact scroll frame emitted by
 * Codex's ratatui renderer. Remove this once a stable xterm.js includes #6011.
 */
export class ScrollRegionScrollbackCompat {
  private pending = '';

  transform(data: string): string {
    if (!data) return '';
    const input = this.pending + data;
    this.pending = '';
    let cursor = 0;
    let output = '';

    while (cursor < input.length) {
      const escape = input.indexOf(ESC, cursor);
      if (escape < 0) {
        output += input.slice(cursor);
        break;
      }
      output += input.slice(cursor, escape);
      const match = parseSequence(input, escape);
      if (match === INCOMPLETE) {
        this.pending = input.slice(escape);
        break;
      }
      if (match) {
        output +=
          `${ESC}[1;${match.bottom}r${ESC}[${match.bottom};1H` +
          '\n'.repeat(match.count) +
          `${ESC}[r`;
        cursor = match.end;
        continue;
      }
      output += ESC;
      cursor = escape + 1;
    }

    return output;
  }

  reset(): void {
    this.pending = '';
  }
}

function parseSequence(input: string, start: number): SequenceMatch | Incomplete | undefined {
  let cursor = consumeLiteral(input, start, `${ESC}[1;`);
  if (typeof cursor !== 'number') return cursor;

  const bottom = consumeNumber(input, cursor, 'r');
  if (bottom === INCOMPLETE || !bottom) return bottom;
  cursor = consumeLiteral(input, bottom.next, `${ESC}[`);
  if (typeof cursor !== 'number') return cursor;

  const count = consumeNumber(input, cursor, 'S');
  if (count === INCOMPLETE || !count) return count;
  cursor = consumeLiteral(input, count.next, `${ESC}[r`);
  if (typeof cursor !== 'number') return cursor;
  if (count.value > bottom.value) return undefined;

  return { end: cursor, bottom: bottom.value, count: count.value };
}

function consumeLiteral(
  input: string,
  start: number,
  literal: string
): number | Incomplete | undefined {
  const available = input.length - start;
  const compared = Math.min(available, literal.length);
  if (input.slice(start, start + compared) !== literal.slice(0, compared)) return undefined;
  return available < literal.length ? INCOMPLETE : start + literal.length;
}

function consumeNumber(
  input: string,
  start: number,
  final: string
): ParsedNumber | Incomplete | undefined {
  let cursor = start;
  while (cursor < input.length && isDigit(input.charCodeAt(cursor))) cursor++;
  const digitCount = cursor - start;
  if (digitCount > MAX_PARAMETER_DIGITS) return undefined;
  if (cursor === input.length) return INCOMPLETE;
  if (digitCount === 0 || input[cursor] !== final) return undefined;
  const value = Number(input.slice(start, cursor));
  if (value < 1 || value > MAX_REGION_ROWS) return undefined;
  return { next: cursor + 1, value };
}

function isDigit(value: number): boolean {
  return value >= 48 && value <= 57;
}
