import type { Terminal } from '@xterm/xterm';

/** Read the live grid, regardless of where the user has scrolled in history. */
export function readVisibleScreen(terminal: Terminal): string {
  const buffer = terminal.buffer.active;
  const start = Math.max(0, buffer.baseY);
  const end = Math.min(buffer.length, start + terminal.rows);
  const lines: string[] = [];
  for (let index = start; index < end; index++) {
    lines.push(buffer.getLine(index)?.translateToString(true) ?? '');
  }
  return lines.join('\n');
}
