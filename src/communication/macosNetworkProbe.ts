import { errorMessage, runCommand } from './command';
import { collectProcessTree } from './processTree';
import type { NetworkProbe, RawNetworkSample } from './types';

export interface NettopCounter {
  pid: number;
  receivedBytes: number;
  sentBytes: number;
  name: string;
}

export class MacosNetworkProbe implements NetworkProbe {
  readonly cadenceMs = 5000;

  async sample(roots: ReadonlyMap<string, number>): Promise<Map<string, RawNetworkSample>> {
    const trees = new Map<string, Set<number>>();
    await Promise.all(
      [...roots].map(async ([id, pid]) => trees.set(id, await collectProcessTree(pid, 'darwin')))
    );
    try {
      const output = await runCommand(
        'nettop',
        ['-P', '-L', '1', '-x', '-J', 'bytes_in,bytes_out'],
        4000,
        8 * 1024 * 1024
      );
      const counters = parseNettopCsv(output);
      return new Map(
        [...trees].map(([id, processIds]) => {
          const matches = counters.filter((counter) => processIds.has(counter.pid));
          return [id, sampleForCounters(processIds, matches)];
        })
      );
    } catch (error) {
      return new Map(
        [...trees].map(([id, processIds]) => [
          id,
          unavailableSample(processIds, errorMessage(error))
        ])
      );
    }
  }
}

export function parseNettopCsv(output: string): NettopCounter[] {
  const lines = output.split(/\r?\n/u).filter(Boolean);
  if (lines.length < 2) return [];
  const header = parseCsvLine(lines[0]!).map((value) => value.trim().toLowerCase());
  const receivedIndex = header.findIndex((value) => value === 'bytes_in');
  const sentIndex = header.findIndex((value) => value === 'bytes_out');
  if (receivedIndex < 0 || sentIndex < 0) return [];

  const counters = new Map<number, NettopCounter>();
  for (const line of lines.slice(1)) {
    const values = parseCsvLine(line);
    const identity = values[0]?.trim() ?? '';
    const pidMatch = /(?:^|\.)(\d+)$/u.exec(identity);
    const receivedBytes = Number(values[receivedIndex]);
    const sentBytes = Number(values[sentIndex]);
    if (!pidMatch || !Number.isFinite(receivedBytes) || !Number.isFinite(sentBytes)) continue;
    const pid = Number(pidMatch[1]);
    const previous = counters.get(pid);
    counters.set(pid, {
      pid,
      name: identity,
      receivedBytes: (previous?.receivedBytes ?? 0) + receivedBytes,
      sentBytes: (previous?.sentBytes ?? 0) + sentBytes
    });
  }
  return [...counters.values()];
}

function sampleForCounters(processIds: Set<number>, counters: NettopCounter[]): RawNetworkSample {
  return {
    source: 'macos-nettop',
    available: true,
    processIds: [...processIds],
    sockets: counters.map((counter) => ({
      key: String(counter.pid),
      ownerPid: counter.pid,
      processName: counter.name,
      loopback: false,
      receivedBytes: counter.receivedBytes,
      sentBytes: counter.sentBytes
    })),
    connectionCount: counters.length,
    loopback: false
  };
}

function unavailableSample(processIds: Set<number>, error: string): RawNetworkSample {
  return {
    source: 'macos-nettop',
    available: false,
    processIds: [...processIds],
    sockets: [],
    connectionCount: 0,
    loopback: false,
    error
  };
}

function parseCsvLine(line: string): string[] {
  const values: string[] = [];
  let current = '';
  let quoted = false;
  for (let index = 0; index < line.length; index++) {
    const character = line[index]!;
    if (character === '"') {
      if (quoted && line[index + 1] === '"') {
        current += '"';
        index++;
      } else quoted = !quoted;
    } else if (character === ',' && !quoted) {
      values.push(current);
      current = '';
    } else current += character;
  }
  values.push(current);
  return values;
}
