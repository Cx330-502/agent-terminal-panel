import type { NetworkProbeSource } from '../shared';

export interface RawSocketCounter {
  key: string;
  ownerPid: number;
  processName: string;
  loopback: boolean;
  receivedBytes?: number;
  sentBytes?: number;
}

export interface RawProxyNetworkSample {
  processName: string;
  processIds: number[];
  sockets: RawSocketCounter[];
  shared: true;
}

export interface RawNetworkSample {
  source: NetworkProbeSource;
  available: boolean;
  processIds: number[];
  sockets: RawSocketCounter[];
  connectionCount: number;
  loopback: boolean;
  proxy?: RawProxyNetworkSample;
  error?: string;
}

export interface NetworkProbe {
  readonly cadenceMs: number;
  sample(roots: ReadonlyMap<string, number>): Promise<Map<string, RawNetworkSample>>;
}
