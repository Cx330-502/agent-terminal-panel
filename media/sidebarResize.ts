import type { VSCodeApi } from '../src/shared';

interface PersistedState {
  sidebarWidth?: number;
}

const DEFAULT_WIDTH = 172;
const MIN_WIDTH = 104;
const MAX_WIDTH = 360;

export class SidebarResize {
  private width: number;

  constructor(
    private readonly root: HTMLElement,
    private readonly splitter: HTMLElement,
    private readonly vscode: VSCodeApi
  ) {
    const state = vscode.getState() as PersistedState | undefined;
    this.width = clamp(state?.sidebarWidth ?? DEFAULT_WIDTH, MIN_WIDTH, MAX_WIDTH);
    this.apply();
    this.splitter.addEventListener('pointerdown', (event) => this.startDrag(event));
    this.splitter.addEventListener('keydown', (event) => this.handleKey(event));
  }

  private startDrag(event: PointerEvent): void {
    event.preventDefault();
    const startX = event.clientX;
    const startWidth = this.width;
    this.splitter.setPointerCapture(event.pointerId);
    this.root.classList.add('resizing');

    const move = (moveEvent: PointerEvent): void => {
      const maxForView = Math.max(MIN_WIDTH, this.root.clientWidth * 0.58);
      this.width = clamp(startWidth + moveEvent.clientX - startX, MIN_WIDTH, maxForView);
      this.apply();
    };
    const finish = (): void => {
      this.root.classList.remove('resizing');
      this.splitter.removeEventListener('pointermove', move);
      this.splitter.removeEventListener('pointerup', finish);
      this.splitter.removeEventListener('pointercancel', finish);
      this.persist();
    };
    this.splitter.addEventListener('pointermove', move);
    this.splitter.addEventListener('pointerup', finish);
    this.splitter.addEventListener('pointercancel', finish);
  }

  private handleKey(event: KeyboardEvent): void {
    if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;
    event.preventDefault();
    this.width = clamp(this.width + (event.key === 'ArrowRight' ? 12 : -12), MIN_WIDTH, MAX_WIDTH);
    this.apply();
    this.persist();
  }

  private apply(): void {
    this.root.style.setProperty('--session-list-width', `${Math.round(this.width)}px`);
    this.splitter.setAttribute('aria-valuenow', String(Math.round(this.width)));
  }

  private persist(): void {
    const previous = (this.vscode.getState() as PersistedState | undefined) ?? {};
    this.vscode.setState({ ...previous, sidebarWidth: Math.round(this.width) });
  }
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(Math.max(value, minimum), maximum);
}
