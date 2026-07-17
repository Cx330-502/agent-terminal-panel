import { readFile } from 'node:fs/promises';
import { runCommand } from './command';

export interface ProcessRow {
  pid: number;
  parentPid: number;
  name?: string;
}

export async function collectProcessTree(
  rootPid: number,
  platform: NodeJS.Platform = process.platform
): Promise<Set<number>> {
  if (platform === 'linux') return collectLinuxProcessTree(rootPid);
  if (platform === 'darwin') {
    const output = await runCommand('ps', ['-axo', 'pid=,ppid=,comm=']);
    return descendantsFromRows(rootPid, parseProcessRows(output));
  }
  return new Set([rootPid]);
}

export async function collectLinuxProcessTree(rootPid: number): Promise<Set<number>> {
  const seen = new Set<number>();
  const pending = [rootPid];
  while (pending.length > 0) {
    const pid = pending.shift();
    if (pid === undefined || seen.has(pid)) continue;
    seen.add(pid);
    try {
      const raw = await readFile(`/proc/${pid}/task/${pid}/children`, 'utf8');
      for (const value of raw.trim().split(/\s+/u)) {
        const child = Number(value);
        if (Number.isInteger(child) && child > 0 && !seen.has(child)) pending.push(child);
      }
    } catch {
      // Processes may exit while the tree is sampled.
    }
  }
  return seen;
}

export function parseProcessRows(output: string): ProcessRow[] {
  return output.split(/\r?\n/u).flatMap((line) => {
    const match = /^\s*(\d+)\s+(\d+)(?:\s+(.+?))?\s*$/u.exec(line);
    if (!match) return [];
    return [{ pid: Number(match[1]), parentPid: Number(match[2]), name: match[3] }];
  });
}

export function descendantsFromRows(rootPid: number, rows: ProcessRow[]): Set<number> {
  const children = new Map<number, number[]>();
  for (const row of rows) {
    const values = children.get(row.parentPid) ?? [];
    values.push(row.pid);
    children.set(row.parentPid, values);
  }
  const seen = new Set<number>();
  const pending = [rootPid];
  while (pending.length > 0) {
    const pid = pending.shift();
    if (pid === undefined || seen.has(pid)) continue;
    seen.add(pid);
    pending.push(...(children.get(pid) ?? []));
  }
  return seen;
}
