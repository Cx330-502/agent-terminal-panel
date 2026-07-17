import { LinuxNetworkProbe } from './linuxNetworkProbe';
import { MacosNetworkProbe } from './macosNetworkProbe';
import type { NetworkProbe, RawNetworkSample } from './types';
import { WindowsNetworkProbe } from './windowsNetworkProbe';

export function createNetworkProbe(platform: NodeJS.Platform = process.platform): NetworkProbe {
  if (platform === 'linux') return new LinuxNetworkProbe();
  if (platform === 'darwin') return new MacosNetworkProbe();
  if (platform === 'win32') return new WindowsNetworkProbe();
  return new UnsupportedNetworkProbe();
}

class UnsupportedNetworkProbe implements NetworkProbe {
  readonly cadenceMs = 10_000;

  async sample(roots: ReadonlyMap<string, number>): Promise<Map<string, RawNetworkSample>> {
    return new Map(
      [...roots].map(([id, pid]) => [
        id,
        {
          source: 'windows-connections' as const,
          available: false,
          processIds: [pid],
          sockets: [],
          connectionCount: 0,
          loopback: false,
          error: `Unsupported platform: ${process.platform}`
        }
      ])
    );
  }
}
