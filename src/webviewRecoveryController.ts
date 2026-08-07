export type WebviewReloadReason = 'heartbeatTimeout' | 'postMessageFailed' | 'manual';

export interface WebviewRecoveryClock {
  now(): number;
  repeat(callback: () => void, intervalMs: number): { dispose(): void };
}

interface WebviewRecoveryOptions {
  heartbeatTimeoutMs?: number;
  reloadCooldownMs?: number;
  checkIntervalMs?: number;
  clock?: WebviewRecoveryClock;
}

export const WEBVIEW_HEARTBEAT_TIMEOUT_MS = 20_000;
export const WEBVIEW_RELOAD_COOLDOWN_MS = 30_000;
const WEBVIEW_HEARTBEAT_CHECK_INTERVAL_MS = 5_000;

export class WebviewRecoveryController {
  private readonly clock: WebviewRecoveryClock;
  private readonly heartbeatTimeoutMs: number;
  private readonly reloadCooldownMs: number;
  private readonly monitor: { dispose(): void };
  private attached = false;
  private visible = false;
  private pendingPostFailure = false;
  private lastSignalAt = 0;
  private lastReloadAt: number | undefined;

  constructor(
    private readonly reload: (reason: WebviewReloadReason) => void,
    options: WebviewRecoveryOptions = {}
  ) {
    this.clock = options.clock ?? systemClock;
    this.heartbeatTimeoutMs = options.heartbeatTimeoutMs ?? WEBVIEW_HEARTBEAT_TIMEOUT_MS;
    this.reloadCooldownMs = options.reloadCooldownMs ?? WEBVIEW_RELOAD_COOLDOWN_MS;
    this.monitor = this.clock.repeat(
      () => this.checkHeartbeat(),
      options.checkIntervalMs ?? WEBVIEW_HEARTBEAT_CHECK_INTERVAL_MS
    );
  }

  attach(visible: boolean): void {
    this.attached = true;
    this.visible = visible;
    this.pendingPostFailure = false;
    this.lastSignalAt = this.clock.now();
  }

  detach(): void {
    this.attached = false;
    this.visible = false;
    this.pendingPostFailure = false;
  }

  signal(): void {
    if (this.attached) this.lastSignalAt = this.clock.now();
  }

  setVisible(visible: boolean): void {
    if (!this.attached) return;
    this.visible = visible;
    if (!visible) return;
    if (this.pendingPostFailure) {
      this.pendingPostFailure = false;
      this.requestReload('postMessageFailed');
      return;
    }
    // Hidden Webviews can have throttled timers. Give a newly visible document a full grace period.
    this.lastSignalAt = this.clock.now();
  }

  postMessageFailed(): void {
    if (!this.attached) return;
    if (!this.visible) {
      this.pendingPostFailure = true;
      return;
    }
    this.requestReload('postMessageFailed');
  }

  reloadManually(): void {
    this.requestReload('manual', true);
  }

  dispose(): void {
    this.detach();
    this.monitor.dispose();
  }

  private checkHeartbeat(): void {
    if (
      this.attached &&
      this.visible &&
      this.clock.now() - this.lastSignalAt >= this.heartbeatTimeoutMs
    ) {
      this.requestReload('heartbeatTimeout');
    }
  }

  private requestReload(reason: WebviewReloadReason, bypassCooldown = false): void {
    if (!this.attached) return;
    const now = this.clock.now();
    if (
      !bypassCooldown &&
      this.lastReloadAt !== undefined &&
      now - this.lastReloadAt < this.reloadCooldownMs
    ) {
      return;
    }
    this.lastReloadAt = now;
    this.lastSignalAt = now;
    this.pendingPostFailure = false;
    this.reload(reason);
  }
}

const systemClock: WebviewRecoveryClock = {
  now: Date.now,
  repeat(callback, intervalMs) {
    const timer = setInterval(callback, intervalMs);
    return { dispose: () => clearInterval(timer) };
  }
};
