import type { SessionSnapshot } from '../src/shared';

export class StartupIndicator {
  private session: SessionSnapshot | undefined;
  private receivedAt = 0;
  private timer: number | undefined;

  constructor(
    private readonly element: HTMLElement,
    private readonly title: HTMLElement,
    private readonly detail: HTMLElement
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
    if (session.spawnDurationMs === undefined) {
      this.title.textContent = '正在创建终端';
      this.detail.textContent = `正在 workspace host 启动进程 · ${formatDuration(elapsed)}`;
      return;
    }
    if (elapsed < 4000) {
      this.title.textContent = '进程已启动，等待首个输出';
      this.detail.textContent = `PTY 创建 ${formatDuration(session.spawnDurationMs)} · 已等待 ${formatDuration(elapsed)}`;
      return;
    }
    this.title.textContent = '仍在等待 Agent 输出';
    this.detail.textContent = `PTY 已创建，等待 ${formatDuration(elapsed)}；可在“输出 > Agent Terminal Panel”查看耗时`;
  }

  private isWaiting(): boolean {
    return Boolean(
      this.session &&
        this.session.startupElapsedMs !== undefined &&
        this.session.startupDurationMs === undefined
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
