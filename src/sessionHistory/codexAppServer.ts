import { spawn } from 'node:child_process';
import { resolveLaunchCommand } from '../launchCommand';

interface CodexAppServerOptions {
  clientVersion?: string;
  environment?: Record<string, string>;
  timeoutMs?: number;
}

interface RpcResponse {
  id?: unknown;
  error?: unknown;
}

const DEFAULT_TIMEOUT_MS = 10_000;
const MAX_STDERR_LENGTH = 2_000;

export async function renameCodexThread(
  commandPrefix: string,
  threadId: string,
  name: string,
  options: CodexAppServerOptions = {}
): Promise<void> {
  const prefix = commandPrefix.trim();
  const trimmedName = name.trim();
  if (!prefix) throw new Error('Codex command is not configured');
  if (!threadId.trim()) throw new Error('Codex session id is empty');
  if (!trimmedName) throw new Error('Codex session name is empty');

  const environment = { ...process.env, ...options.environment };
  const launch = resolveLaunchCommand(`${prefix} app-server`, process.platform, environment);
  const child = spawn(launch.command, launch.args, {
    env: environment,
    stdio: ['pipe', 'pipe', 'pipe'],
    windowsHide: true
  });

  await new Promise<void>((resolve, reject) => {
    let stdout = '';
    let stderr = '';
    let settled = false;
    let renameSent = false;
    const timeout = setTimeout(
      () => finish(new Error('Timed out waiting for Codex app-server rename response')),
      options.timeoutMs ?? DEFAULT_TIMEOUT_MS
    );

    const send = (message: unknown): void => {
      if (settled || !child.stdin.writable) return;
      child.stdin.write(`${JSON.stringify(message)}\n`);
    };

    const finish = (error?: Error): void => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      child.stdin.end();
      const killTimer = setTimeout(() => child.kill(), 250);
      killTimer.unref();
      if (error) reject(withStderr(error, stderr));
      else resolve();
    };

    const handleLine = (line: string): void => {
      let response: RpcResponse;
      try {
        response = JSON.parse(line) as RpcResponse;
      } catch {
        return;
      }
      if (response.id === 1) {
        if (response.error !== undefined) {
          finish(new Error(`Codex app-server initialization failed: ${rpcError(response.error)}`));
          return;
        }
        if (renameSent) return;
        renameSent = true;
        send({ method: 'initialized', params: {} });
        send({
          method: 'thread/name/set',
          id: 2,
          params: { threadId, name: trimmedName }
        });
        return;
      }
      if (response.id === 2) {
        if (response.error !== undefined) {
          finish(new Error(`Codex session rename failed: ${rpcError(response.error)}`));
        } else {
          finish();
        }
      }
    };

    child.stdout.setEncoding('utf8');
    child.stdout.on('data', (chunk: string) => {
      stdout += chunk;
      let newline = stdout.indexOf('\n');
      while (newline >= 0) {
        handleLine(stdout.slice(0, newline).trim());
        stdout = stdout.slice(newline + 1);
        newline = stdout.indexOf('\n');
      }
      if (stdout.length > 1024 * 1024) stdout = stdout.slice(-64 * 1024);
    });
    child.stderr.setEncoding('utf8');
    child.stderr.on('data', (chunk: string) => {
      stderr = `${stderr}${chunk}`.slice(-MAX_STDERR_LENGTH);
    });
    child.stdin.on('error', (error) => finish(error));
    child.on('error', (error) => finish(error));
    child.on('exit', (code, signal) => {
      if (!settled) {
        finish(
          new Error(
            `Codex app-server exited before renaming the session (${signal ?? `code ${code ?? 'unknown'}`})`
          )
        );
      }
    });

    send({
      method: 'initialize',
      id: 1,
      params: {
        clientInfo: {
          name: 'agent_terminal_panel',
          title: 'Agent Terminal Panel',
          version: options.clientVersion ?? 'unknown'
        }
      }
    });
  });
}

function rpcError(value: unknown): string {
  if (typeof value === 'string') return value;
  if (value && typeof value === 'object') {
    const message = (value as { message?: unknown }).message;
    if (typeof message === 'string') return message;
  }
  return JSON.stringify(value);
}

function withStderr(error: Error, stderr: string): Error {
  const detail = stderr.trim();
  return detail ? new Error(`${error.message}: ${detail}`) : error;
}
