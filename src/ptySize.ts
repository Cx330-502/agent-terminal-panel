import type { PtySize } from './ptyHost';

export function normalizePtySize(cols: number, rows: number): PtySize {
  return {
    cols: Number.isFinite(cols) ? Math.max(2, Math.floor(cols)) : 80,
    rows: Number.isFinite(rows) ? Math.max(2, Math.floor(rows)) : 24
  };
}
