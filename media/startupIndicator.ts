import type { SessionSnapshot } from '../src/shared';
import { formatWebviewString, type WebviewStrings } from '../src/webviewStrings';

export class StartupIndicator {
  private session: SessionSnapshot | undefined;
  private receivedAt = 0;
  private timer: number | undefined;

  constructor(
    private readonly element: HTMLElement,
    private readonly title: HTMLElement,
    private readonly detail: HTMLElement,
    private readonly strings: WebviewStrings
  ) {}

  render(session: SessionSnapshot | undefined): void {
    this.session = session;
    this.receivedAt = performance.now();
    this.update();
    if (this.isWaiting()) this.startTimer();
    else this.stopTimer();
  }

  dispose(): void {
    this.stopTimer();
  }

  private update(): void {
    if (!this.isWaiting()) {
      this.element.hidden = true;
      return;
    }

    const session = this.session!;
    const elapsed = Math.max(
      0,
      (session.startupElapsedMs ?? 0) + performance.now() - this.receivedAt
    );
    this.element.hidden = false;
    this.title.textContent = this.strings.creatingTerminal;
    this.detail.textContent = formatWebviewString(
      this.strings.startingWorkspaceProcess,
      formatDuration(elapsed)
    );
  }

  private isWaiting(): boolean {
    return Boolean(
      this.session &&
        this.session.startupElapsedMs !== undefined &&
        this.session.spawnDurationMs === undefined
    );
  }

  private startTimer(): void {
    if (this.timer !== undefined) return;
    this.timer = window.setInterval(() => this.update(), 250);
  }

  private stopTimer(): void {
    if (this.timer === undefined) return;
    window.clearInterval(this.timer);
    this.timer = undefined;
  }
}

function formatDuration(value: number): string {
  if (value < 1000) return `${Math.round(value)} ms`;
  return `${(value / 1000).toFixed(value < 10_000 ? 1 : 0)} s`;
}
