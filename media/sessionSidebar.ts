import type { VSCodeApi } from '../src/shared';
import { readWebviewState, updateWebviewState } from './webviewState';

const DEFAULT_WIDTH = 156;
const MIN_WIDTH = 104;
const MAX_WIDTH = 360;

export class SessionSidebar {
  private width: number;
  private collapsed: boolean;
  private position: 'left' | 'right' = 'left';

  constructor(
    private readonly root: HTMLElement,
    private readonly splitter: HTMLElement,
    private readonly collapseButton: HTMLButtonElement,
    private readonly expandButton: HTMLButtonElement,
    private readonly vscode: VSCodeApi
  ) {
    const state = readWebviewState(vscode.getState());
    this.width = clamp(state.sidebarWidth ?? DEFAULT_WIDTH, MIN_WIDTH, MAX_WIDTH);
    this.collapsed = state.sessionSidebarCollapsed ?? false;
    this.apply();
    this.splitter.addEventListener('pointerdown', (event) => this.startDrag(event));
    this.splitter.addEventListener('keydown', (event) => this.handleKey(event));
    this.collapseButton.addEventListener('click', () => this.setCollapsedFromUser(true));
    this.expandButton.addEventListener('click', () => this.setCollapsedFromUser(false));
  }

  setPosition(position: 'left' | 'right'): void {
    this.position = position;
    this.apply();
  }

  setCollapsed(collapsed: boolean): void {
    this.collapsed = collapsed;
    updateWebviewState(this.vscode, { sessionSidebarCollapsed: collapsed });
    this.apply();
  }

  private setCollapsedFromUser(collapsed: boolean): void {
    if (this.collapsed === collapsed) return;
    this.setCollapsed(collapsed);
    this.vscode.postMessage({ type: 'setSessionSidebarCollapsed', collapsed });
    (collapsed ? this.expandButton : this.collapseButton).focus();
  }

  private startDrag(event: PointerEvent): void {
    event.preventDefault();
    const startX = event.clientX;
    const startWidth = this.width;
    this.splitter.setPointerCapture(event.pointerId);
    this.root.classList.add('resizing');

    const move = (moveEvent: PointerEvent): void => {
      const maxForView = Math.max(MIN_WIDTH, this.root.clientWidth * 0.58);
      const direction = this.position === 'left' ? 1 : -1;
      this.width = clamp(
        startWidth + (moveEvent.clientX - startX) * direction,
        MIN_WIDTH,
        maxForView
      );
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
    const physicalDirection = event.key === 'ArrowRight' ? 1 : -1;
    const widthDirection = this.position === 'left' ? physicalDirection : -physicalDirection;
    this.width = clamp(this.width + widthDirection * 12, MIN_WIDTH, MAX_WIDTH);
    this.apply();
    this.persist();
  }

  private apply(): void {
    this.root.classList.toggle('session-sidebar-collapsed', this.collapsed);
    this.root.style.setProperty('--session-list-width', `${Math.round(this.width)}px`);
    this.splitter.setAttribute('aria-valuenow', String(Math.round(this.width)));
    this.splitter.tabIndex = this.collapsed ? -1 : 0;
    this.expandButton.hidden = !this.collapsed;
  }

  private persist(): void {
    updateWebviewState(this.vscode, { sidebarWidth: Math.round(this.width) });
  }
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(Math.max(value, minimum), maximum);
}
