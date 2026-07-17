import * as path from 'node:path';
import { errorMessage, runCommand } from './command';
import { descendantsFromRows, type ProcessRow } from './processTree';
import type { NetworkProbe, RawNetworkSample } from './types';

interface WindowsConnection {
  OwningProcess: number;
  LocalAddress: string;
  LocalPort: number;
  RemoteAddress: string;
  RemotePort: number;
}

interface WindowsProbePayload {
  processes?: Array<{ ProcessId: number; ParentProcessId: number; Name?: string }>;
  connections?: WindowsConnection[];
}

export class WindowsNetworkProbe implements NetworkProbe {
  readonly cadenceMs = 6000;

  async sample(roots: ReadonlyMap<string, number>): Promise<Map<string, RawNetworkSample>> {
    try {
      const output = await runCommand(powershellPath(), ['-NoProfile', '-NonInteractive', '-Command', SCRIPT], 5000);
      const payload = JSON.parse(output) as WindowsProbePayload;
      const processRows: ProcessRow[] = (payload.processes ?? []).map((process) => ({
        pid: Number(process.ProcessId),
        parentPid: Number(process.ParentProcessId),
        name: process.Name
      }));
      const connections = payload.connections ?? [];
      return new Map(
        [...roots].map(([id, rootPid]) => {
          const processIds = descendantsFromRows(rootPid, processRows);
          const matched = connections.filter((connection) =>
            processIds.has(Number(connection.OwningProcess))
          );
          return [id, sampleForConnections(processIds, matched, processRows)];
        })
      );
    } catch (error) {
      return new Map(
        [...roots].map(([id, pid]) => [id, unavailableSample(pid, errorMessage(error))])
      );
    }
  }
}

const SCRIPT = [
  "$ErrorActionPreference='SilentlyContinue'",
  '$processes=@(Get-CimInstance Win32_Process | Select-Object ProcessId,ParentProcessId,Name)',
  '$connections=@(Get-NetTCPConnection -State Established | Select-Object OwningProcess,LocalAddress,LocalPort,RemoteAddress,RemotePort)',
  "[pscustomobject]@{processes=$processes;connections=$connections}|ConvertTo-Json -Depth 4 -Compress"
].join(';');

function sampleForConnections(
  processIds: Set<number>,
  connections: WindowsConnection[],
  processes: ProcessRow[]
): RawNetworkSample {
  const names = new Map(processes.map((process) => [process.pid, process.name ?? 'process']));
  return {
    source: 'windows-connections',
    available: true,
    processIds: [...processIds],
    sockets: connections.map((connection) => ({
      key: `${connection.OwningProcess}:${connection.LocalAddress}:${connection.LocalPort}->${connection.RemoteAddress}:${connection.RemotePort}`,
      ownerPid: Number(connection.OwningProcess),
      processName: names.get(Number(connection.OwningProcess)) ?? 'process',
      loopback: isLoopback(connection.RemoteAddress)
    })),
    connectionCount: connections.length,
    loopback: connections.length > 0 && connections.every((connection) => isLoopback(connection.RemoteAddress))
  };
}

function powershellPath(): string {
  const systemRoot = process.env.SystemRoot || process.env.SYSTEMROOT;
  return systemRoot
    ? path.join(systemRoot, 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe')
    : 'powershell.exe';
}

function isLoopback(address: string): boolean {
  return /^(?:127\.|::1$|::ffff:127\.)/iu.test(address);
}

function unavailableSample(pid: number, error: string): RawNetworkSample {
  return {
    source: 'windows-connections',
    available: false,
    processIds: [pid],
    sockets: [],
    connectionCount: 0,
    loopback: false,
    error
  };
}
