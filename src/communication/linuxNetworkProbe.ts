import { errorMessage, runCommand } from './command';
import { collectLinuxProcessTree } from './processTree';
import type { NetworkProbe, RawNetworkSample, RawSocketCounter } from './types';

interface LinuxSocketOwner {
  pid: number;
  fd: number;
  name: string;
}

export interface ParsedLinuxConnection {
  local: string;
  remote: string;
  owners: LinuxSocketOwner[];
  receivedBytes?: number;
  sentBytes?: number;
}

interface OwnedSocket extends RawSocketCounter {
  local: string;
  remote: string;
}

export class LinuxNetworkProbe implements NetworkProbe {
  readonly cadenceMs = 1000;

  async sample(roots: ReadonlyMap<string, number>): Promise<Map<string, RawNetworkSample>> {
    const processTrees = new Map<string, Set<number>>();
    await Promise.all(
      [...roots].map(async ([id, pid]) => {
        processTrees.set(id, await collectLinuxProcessTree(pid));
      })
    );
    try {
      const output = await runCommand('ss', ['-Htinp'], 2000);
      const connections = parseLinuxSocketTable(output);
      return new Map(
        [...processTrees].map(([id, processIds]) => [
          id,
          deriveLinuxNetworkSample(connections, processIds)
        ])
      );
    } catch (error) {
      const message = errorMessage(error);
      return new Map(
        [...processTrees].map(([id, processIds]) => [
          id,
          unavailableSample(processIds, message)
        ])
      );
    }
  }
}

export function parseLinuxSocketTable(output: string): ParsedLinuxConnection[] {
  const blocks: Array<{ header: string; details: string }> = [];
  let current: { header: string; details: string } | undefined;
  for (const line of output.split(/\r?\n/u)) {
    if (!line.trim()) continue;
    if (/^\S/u.test(line)) {
      if (current) blocks.push(current);
      current = { header: line.trim(), details: '' };
    } else if (current) {
      current.details += ` ${line.trim()}`;
    }
  }
  if (current) blocks.push(current);

  return blocks.flatMap(({ header, details }) => {
    const columns = header.split(/\s+/u);
    const local = columns[3];
    const remote = columns[4];
    if (!local || !remote) return [];
    const owners: LinuxSocketOwner[] = [];
    const ownerPattern = /\("([^"]+)",pid=(\d+),fd=(\d+)\)/gu;
    for (const match of header.matchAll(ownerPattern)) {
      owners.push({ name: match[1]!, pid: Number(match[2]), fd: Number(match[3]) });
    }
    const receivedBytes = numberField(details, 'bytes_received');
    const sentBytes = numberField(details, 'bytes_acked') ?? numberField(details, 'bytes_sent');
    return [{ local, remote, owners, receivedBytes, sentBytes }];
  });
}

export function deriveLinuxNetworkSample(
  connections: ParsedLinuxConnection[],
  processIds: Set<number>
): RawNetworkSample {
  const direct = ownedSockets(connections, processIds);
  const nonLoopback = direct.filter((socket) => !socket.loopback);
  const selected = nonLoopback.length > 0 ? nonLoopback : dedupeLoopbackSockets(direct);
  const proxyOwners = new Map<number, string>();

  if (nonLoopback.length === 0) {
    for (const socket of direct.filter((candidate) => candidate.loopback)) {
      const reverse = connections.find(
        (candidate) => candidate.local === socket.remote && candidate.remote === socket.local
      );
      for (const owner of reverse?.owners ?? []) {
        if (!processIds.has(owner.pid)) proxyOwners.set(owner.pid, owner.name);
      }
    }
  }

  const proxySockets = [...proxyOwners].flatMap(([pid]) =>
    ownedSockets(connections, new Set([pid])).filter((socket) => !socket.loopback)
  );
  const firstProxy = proxyOwners.entries().next().value as [number, string] | undefined;

  return {
    source: 'linux-ss',
    available: true,
    processIds: [...processIds],
    sockets: selected.map(stripEndpoints),
    connectionCount: selected.length,
    loopback: selected.length > 0 && selected.every((socket) => socket.loopback),
    ...(firstProxy && proxySockets.length > 0
      ? {
          proxy: {
            processName: firstProxy[1],
            processIds: [...proxyOwners.keys()],
            sockets: proxySockets.map(stripEndpoints),
            shared: true as const
          }
        }
      : {})
  };
}

function ownedSockets(
  connections: ParsedLinuxConnection[],
  processIds: Set<number>
): OwnedSocket[] {
  return connections.flatMap((connection) =>
    connection.owners.flatMap((owner) =>
      processIds.has(owner.pid)
        ? [
            {
              key: `${owner.pid}:${owner.fd}:${connection.local}->${connection.remote}`,
              ownerPid: owner.pid,
              processName: owner.name,
              loopback: isLoopbackEndpoint(connection.remote),
              local: connection.local,
              remote: connection.remote,
              ...(connection.receivedBytes === undefined
                ? {}
                : { receivedBytes: connection.receivedBytes }),
              ...(connection.sentBytes === undefined ? {} : { sentBytes: connection.sentBytes })
            }
          ]
        : []
    )
  );
}

function dedupeLoopbackSockets(sockets: OwnedSocket[]): OwnedSocket[] {
  const unique = new Map<string, OwnedSocket>();
  for (const socket of sockets) {
    const canonical = [socket.local, socket.remote].sort().join('|');
    if (!unique.has(canonical)) unique.set(canonical, socket);
  }
  return [...unique.values()];
}

function stripEndpoints(socket: OwnedSocket): RawSocketCounter {
  const { local: _local, remote: _remote, ...raw } = socket;
  return raw;
}

function numberField(value: string, name: string): number | undefined {
  const match = new RegExp(`(?:^|\\s)${name}:(\\d+)`, 'u').exec(value);
  return match ? Number(match[1]) : undefined;
}

function isLoopbackEndpoint(endpoint: string): boolean {
  return /^(?:127\.|\[?::1\]?:|\[?::ffff:127\.)/iu.test(endpoint);
}

function unavailableSample(processIds: Set<number>, error: string): RawNetworkSample {
  return {
    source: 'linux-ss',
    available: false,
    processIds: [...processIds],
    sockets: [],
    connectionCount: 0,
    loopback: false,
    error
  };
}
