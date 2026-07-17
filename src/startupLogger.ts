import * as vscode from 'vscode';
import type { SessionStartupTiming } from './sessionManager';

export class StartupLogger implements vscode.Disposable {
  private readonly channel = vscode.window.createOutputChannel('Agent Terminal Panel', {
    log: true
  });
  private webviewStartedAt: bigint | undefined;

  beginWebviewResolve(): void {
    this.webviewStartedAt = process.hrtime.bigint();
    this.channel.debug('Webview resolve started');
  }

  webviewReady(): void {
    if (this.webviewStartedAt === undefined) return;
    this.channel.info(`Webview ready in ${elapsedMilliseconds(this.webviewStartedAt)} ms`);
    this.webviewStartedAt = undefined;
  }

  webviewReadyTimeout(timeoutMs: number): void {
    this.channel.warn(`Webview did not report ready within ${timeoutMs} ms; continuing startup`);
  }

  sessionTiming(event: SessionStartupTiming): void {
    const identity = `Session "${event.name}" (${event.id})`;
    const pid = event.pid === undefined ? '' : `, pid ${event.pid}`;
    if (event.phase === 'spawned') {
      this.channel.info(`${identity}: PTY spawned in ${event.durationMs} ms${pid}`);
    } else if (event.phase === 'firstOutput') {
      this.channel.info(`${identity}: first PTY output after ${event.durationMs} ms${pid}`);
    } else if (event.phase === 'exitedBeforeOutput') {
      this.channel.warn(
        `${identity}: exited before PTY output after ${event.durationMs} ms${pid}${formatDetail(event.detail)}`
      );
    } else {
      this.channel.error(
        `${identity}: startup failed after ${event.durationMs} ms${pid}${formatDetail(event.detail)}`
      );
    }
  }

  dispose(): void {
    this.channel.dispose();
  }
}

function elapsedMilliseconds(startedAt: bigint): number {
  return Math.round(Number(process.hrtime.bigint() - startedAt) / 1_000_000);
}

function formatDetail(detail: string | undefined): string {
  return detail ? `, ${detail}` : '';
}
