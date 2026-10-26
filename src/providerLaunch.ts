import { randomUUID } from 'node:crypto';
import * as path from 'node:path';

export interface PreparedLaunch {
  command: string;
  providerId?: string;
  /** Provider session ID the launched process was told to use, when the extension assigned one. */
  providerSessionId?: string;
}

interface ParsedLaunch {
  providerId: string;
  args: string[];
}

// Arguments that resume, fork, print or otherwise do not start a new interactive Claude session.
const CLAUDE_NON_FRESH_FLAGS = new Set([
  '-r', '--resume', '-c', '--continue', '--session-id', '--fork-session', '--from-pr',
  '-p', '--print', '-h', '--help', '-v', '--version', '--'
]);
const CLAUDE_SUBCOMMANDS = new Set([
  'mcp', 'config', 'update', 'upgrade', 'doctor', 'install', 'migrate-installer',
  'setup-token', 'plugin', 'plugins', 'agents'
]);
const SHELL_SYNTAX = /[;&|<>`$(){}#\r\n]|\\\s*$/u;

export function detectLaunchProvider(command: string): string | undefined {
  return parseLaunch(command)?.providerId;
}

/**
 * Claude Code writes its transcript only after the first prompt, so a fresh launch cannot be
 * correlated by file timestamps alone. Assigning `--session-id` up front makes the identity exact.
 * Only plain direct invocations are changed; anything with shell syntax is left untouched.
 */
export function prepareProviderLaunch(
  command: string,
  createId: () => string = randomUUID
): PreparedLaunch {
  const parsed = parseLaunch(command);
  if (!parsed) return { command };
  const unchanged = { command, providerId: parsed.providerId };
  if (parsed.providerId !== 'claude' || SHELL_SYNTAX.test(command)) return unchanged;
  const startsFreshSession = parsed.args.every((arg) => {
    const flag = arg.split('=', 1)[0] ?? arg;
    // Short options can carry their value without a space, e.g. -r<id> and -p<prompt>.
    return !CLAUDE_NON_FRESH_FLAGS.has(flag) && !/^-[rcphv]/u.test(arg);
  });
  // Global options and their values may precede a subcommand.
  if (!startsFreshSession || parsed.args.some((arg) => CLAUDE_SUBCOMMANDS.has(arg))) {
    return unchanged;
  }
  const providerSessionId = createId();
  return {
    ...unchanged,
    command: `${command.trimEnd()} --session-id ${providerSessionId}`,
    providerSessionId
  };
}

function parseLaunch(command: string): ParsedLaunch | undefined {
  const tokens = command.match(/(?:[^\s"']+|"[^"]*"|'[^']*')+/gu)?.map(unquote) ?? [];
  while (tokens[0] === 'env' || tokens[0] === 'command' || tokens[0] === 'exec') tokens.shift();
  while (tokens[0]?.includes('=') && !tokens[0].startsWith('-')) tokens.shift();
  if (tokens[0] === 'npx' || tokens[0] === 'bunx') {
    tokens.shift();
    while (tokens[0]?.startsWith('-')) tokens.shift();
  }
  if (tokens[0] === 'pnpm' && tokens[1] === 'dlx') tokens.splice(0, 2);
  const executable = tokens[0]
    ? path.basename(tokens[0]).toLowerCase().replace(/(?<=.)@[^/]*$/u, '')
    : '';
  const providerId = PROVIDER_EXECUTABLES.get(executable.replace(/\.(?:exe|cmd)$/u, ''));
  return providerId ? { providerId, args: tokens.slice(1) } : undefined;
}

const PROVIDER_EXECUTABLES = new Map([
  ['codex', 'codex'],
  ['claude', 'claude'],
  ['claude-code', 'claude']
]);

function unquote(value: string): string {
  return value.length >= 2 && (value[0] === '"' || value[0] === "'")
    ? value.slice(1, -1)
    : value;
}
