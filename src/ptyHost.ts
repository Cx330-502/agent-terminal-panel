import * as vscode from 'vscode';
import type { IPty } from 'node-pty';
import * as nodePty from 'node-pty';
import type { AgentProcessConfig } from './config';
import { resolveLaunchCommand } from './launchCommand';
import { buildTerminalEnvironment } from './terminalEnvironment';

export interface PtySize {
  cols: number;
  rows: number;
}

export interface PtyCallbacks {
  onData(id: string, data: string): void;
  onExit(id: string, exitCode: number): void;
  onError(id: string, error: Error): void;
}

export class PtyHost {
  private readonly processes = new Map<string, IPty>();

  constructor(private readonly callbacks: PtyCallbacks) {}

  spawn(id: string, cwd: string, size: PtySize, config: AgentProcessConfig): void {
    this.kill(id);
    try {
      const environment = buildTerminalEnvironment(process.env, config.environment, {
        imagesEnabled: config.terminalImagesEnabled,
        vscodeVersion: vscode.version
      });
      const launch = resolveLaunchCommand(config.launchCommand, process.platform, environment);
      const ptyProcess = nodePty.spawn(launch.command, launch.args, {
        name: config.terminalImagesEnabled ? 'xterm-sixel' : 'xterm-256color',
        cols: clampDimension(size.cols, 80),
        rows: clampDimension(size.rows, 24),
        cwd,
        env: environment
      });
      this.processes.set(id, ptyProcess);
      ptyProcess.onData((data) => this.callbacks.onData(id, data));
      ptyProcess.onExit(({ exitCode }) => {
        if (this.processes.get(id) !== ptyProcess) return;
        this.processes.delete(id);
        this.callbacks.onExit(id, exitCode);
      });
    } catch (error) {
      this.callbacks.onError(id, error instanceof Error ? error : new Error(String(error)));
    }
  }

  write(id: string, data: string): void {
    this.processes.get(id)?.write(data);
  }

  resize(id: string, size: PtySize): void {
    const process = this.processes.get(id);
    if (!process) return;
    try {
      process.resize(clampDimension(size.cols, 80), clampDimension(size.rows, 24));
    } catch {
      // A process can exit between the lookup and resize call.
    }
  }

  kill(id: string): void {
    const process = this.processes.get(id);
    if (!process) return;
    this.processes.delete(id);
    try {
      process.kill();
    } catch {
      // The PTY may already be gone.
    }
  }

  dispose(): void {
    for (const id of [...this.processes.keys()]) this.kill(id);
  }
}

function clampDimension(value: number, fallback: number): number {
  return Number.isFinite(value) ? Math.max(2, Math.floor(value)) : fallback;
}
