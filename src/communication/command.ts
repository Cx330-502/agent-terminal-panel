import { execFile } from 'node:child_process';

export function runCommand(
  command: string,
  args: string[],
  timeoutMs = 2500,
  maxBuffer = 4 * 1024 * 1024
): Promise<string> {
  return new Promise((resolve, reject) => {
    execFile(command, args, { timeout: timeoutMs, maxBuffer, encoding: 'utf8' }, (error, stdout) => {
      if (error) reject(error);
      else resolve(stdout);
    });
  });
}

export function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
