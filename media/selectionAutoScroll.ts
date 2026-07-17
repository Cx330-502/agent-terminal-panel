import type { Terminal } from '@xterm/xterm';

const EDGE_ZONE_PX = 42;
const TICK_MS = 70;
const MAX_LINES_PER_TICK = 3;

export class SelectionAutoScroll {
  private dragging = false;
  private pointerY = 0;
  private timer: number | undefined;

  constructor(
    private readonly element: HTMLElement,
    private readonly terminal: Terminal
  ) {
    element.addEventListener('mousedown', this.handleMouseDown, true);
    window.addEventListener('mousemove', this.handleMouseMove, true);
    window.addEventListener('mouseup', this.stop, true);
    window.addEventListener('blur', this.stop);
  }

  dispose(): void {
    this.element.removeEventListener('mousedown', this.handleMouseDown, true);
    window.removeEventListener('mousemove', this.handleMouseMove, true);
    window.removeEventListener('mouseup', this.stop, true);
    window.removeEventListener('blur', this.stop);
    this.stop();
  }

  private readonly handleMouseDown = (event: MouseEvent): void => {
    if (event.button !== 0) return;
    this.dragging = true;
    this.pointerY = event.clientY;
    this.schedule();
  };

  private readonly handleMouseMove = (event: MouseEvent): void => {
    if (!this.dragging) return;
    if ((event.buttons & 1) === 0) {
      this.stop();
      return;
    }
    this.pointerY = event.clientY;
    this.schedule();
  };

  private readonly stop = (): void => {
    this.dragging = false;
    if (this.timer !== undefined) window.clearTimeout(this.timer);
    this.timer = undefined;
  };

  private schedule(): void {
    if (this.timer !== undefined) return;
    this.timer = window.setTimeout(() => {
      this.timer = undefined;
      this.tick();
    }, TICK_MS);
  }

  private tick(): void {
    if (!this.dragging) return;
    const lines = scrollLinesForPointer(this.pointerY, this.element.getBoundingClientRect());
    if (lines !== 0 && this.terminal.hasSelection()) this.terminal.scrollLines(lines);
    this.schedule();
  }
}

export function scrollLinesForPointer(pointerY: number, rect: DOMRect): number {
  const zone = Math.min(EDGE_ZONE_PX, Math.max(16, rect.height / 5));
  if (pointerY < rect.top + zone) {
    return -scrollSpeed(rect.top + zone - pointerY, zone);
  }
  if (pointerY > rect.bottom - zone) {
    return scrollSpeed(pointerY - (rect.bottom - zone), zone);
  }
  return 0;
}

function scrollSpeed(distance: number, zone: number): number {
  const ratio = Math.min(1, Math.max(0, distance / zone));
  return Math.max(1, Math.ceil(ratio * MAX_LINES_PER_TICK));
}
