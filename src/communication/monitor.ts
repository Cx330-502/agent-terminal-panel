import { Buffer } from 'node:buffer';
import type { CommunicationHealthConfig } from '../config';
import type {
  CommunicationHealthBasis,
  CommunicationHealthState,
  CommunicationSnapshot,
  NetworkCommunicationSnapshot,
  ProxyCommunicationSnapshot,
  SessionStatus,
  TrafficSnapshot
} from '../shared';
import { CodexSessionTracker } from './codexSessionTracker';
import { createNetworkProbe } from './networkProbe';
import { collectProcessTree } from './processTree';
import { TrafficMeter } from './trafficMeter';
import type { NetworkProbe, RawNetworkSample } from './types';

interface PtyState extends TrafficSnapshot {
  previousReceivedBytes: number;
  previousSentBytes: number;
  lastSampleAt: number;
  lastReceivedAt: number;
}

interface MonitoredSession {
  id: string;
  createdAt: number;
  rootPid?: number;
  processIds: number[];
  pty: PtyState;
  networkMeter: TrafficMeter;
  proxyMeter: TrafficMeter;
  network?: NetworkCommunicationSnapshot;
  lastNetworkActivityAt?: number;
  provider: CodexSessionTracker;
}

export interface HealthClassification {
  health: CommunicationHealthState;
  basis: CommunicationHealthBasis;
  silentForMs: number;
}

export class CommunicationMonitor {
  private readonly sessions = new Map<string, MonitoredSession>();
  private readonly networkProbe: NetworkProbe;
  private config: CommunicationHealthConfig;
  private timer: NodeJS.Timeout | undefined;
  private sampling = false;
  private nextNetworkSampleAt = 0;
  private sampledAt = Date.now();

  constructor(
    private readonly getConfig: () => CommunicationHealthConfig,
    private readonly onUpdate: () => void,
    private readonly platform: NodeJS.Platform = process.platform
  ) {
    this.config = getConfig();
    this.networkProbe = createNetworkProbe(platform);
    this.restartTimer();
  }

  create(id: string): void {
    this.sessions.set(id, createSession(id, this.platform));
    if (this.config.enabled) this.scheduleImmediateSample();
  }

  restart(id: string): void {
    if (!this.sessions.has(id)) return;
    this.sessions.set(id, createSession(id, this.platform));
    if (this.config.enabled) this.scheduleImmediateSample();
  }

  remove(id: string): void {
    this.sessions.delete(id);
  }

  setPid(id: string, pid: number): void {
    const session = this.sessions.get(id);
    if (!session) return;
    session.rootPid = pid;
    session.processIds = [pid];
    session.provider.reset();
    this.nextNetworkSampleAt = 0;
    this.scheduleImmediateSample();
  }

  recordPtyInput(id: string, data: string): void {
    const session = this.sessions.get(id);
    if (session) session.pty.sentBytes += Buffer.byteLength(data);
  }

  recordPtyOutput(id: string, data: string): void {
    const session = this.sessions.get(id);
    if (!session) return;
    session.pty.receivedBytes += Buffer.byteLength(data);
    session.pty.lastReceivedAt = Date.now();
  }

  refreshConfig(): void {
    const previous = this.config;
    this.config = this.getConfig();
    if (!this.config.codexSessionMetricsEnabled || !previous.enabled) {
      for (const session of this.sessions.values()) session.provider.reset();
    }
    if (!this.config.processNetworkEnabled || !previous.enabled) {
      const now = Date.now();
      for (const session of this.sessions.values()) resetNetworkState(session, now);
    }
    this.nextNetworkSampleAt = 0;
    this.restartTimer();
    this.onUpdate();
    if (this.config.enabled) this.scheduleImmediateSample();
  }

  snapshot(id: string, status: SessionStatus, now = Date.now()): CommunicationSnapshot | undefined {
    if (!this.config.enabled) return undefined;
    const session = this.sessions.get(id);
    if (!session) return undefined;
    const provider = this.config.codexSessionMetricsEnabled
      ? session.provider.snapshot(now)
      : undefined;
    const networkHasTraffic = Boolean(
      session.network?.available &&
        session.network.hasByteCounters &&
        session.network.connectionCount > 0
    );
    const basis: CommunicationHealthBasis = networkHasTraffic
      ? 'network'
      : session.rootPid
        ? 'pty'
        : 'none';
    const lastActivityAt = networkHasTraffic
      ? session.lastNetworkActivityAt ?? session.createdAt
      : session.pty.lastReceivedAt;
    const classification = classifyCommunicationHealth({
      status,
      basis,
      now,
      lastActivityAt,
      quietThresholdMs: this.config.quietThresholdMs,
      stalledThresholdMs: this.config.stalledThresholdMs,
      providerPhase: provider?.phase
    });
    return {
      health: classification.health,
      healthBasis: classification.basis,
      silentForMs: classification.silentForMs,
      sampledAt: this.sampledAt,
      pty: toTrafficSnapshot(session.pty),
      ...(session.network ? { network: session.network } : {}),
      ...(provider ? { provider } : {})
    };
  }

  dispose(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = undefined;
    this.sessions.clear();
  }

  private restartTimer(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = undefined;
    if (!this.config.enabled) return;
    this.timer = setInterval(() => void this.sample(), this.config.sampleIntervalMs);
  }

  private scheduleImmediateSample(): void {
    queueMicrotask(() => void this.sample());
  }

  private async sample(): Promise<void> {
    if (!this.config.enabled || this.sampling || this.sessions.size === 0) return;
    this.sampling = true;
    const now = Date.now();
    try {
      for (const session of this.sessions.values()) samplePty(session.pty, now);
      const roots = new Map(
        [...this.sessions].flatMap(([id, session]) =>
          session.rootPid === undefined ? [] : [[id, session.rootPid] as const]
        )
      );

      if (
        this.config.processNetworkEnabled &&
        roots.size > 0 &&
        now >= this.nextNetworkSampleAt
      ) {
        const samples = await this.networkProbe.sample(roots);
        for (const [id, raw] of samples) this.applyNetworkSample(id, raw, now);
        this.nextNetworkSampleAt =
          now + Math.max(this.config.sampleIntervalMs, this.networkProbe.cadenceMs);
      }

      if (this.config.codexSessionMetricsEnabled) {
        await Promise.all(
          [...this.sessions.values()].map(async (session) => {
            if (session.rootPid === undefined) return;
            if (!this.config.processNetworkEnabled) {
              session.processIds = [...(await collectProcessTree(session.rootPid, this.platform))];
            }
            await session.provider.sample(session.processIds, now);
          })
        );
      }
      this.sampledAt = now;
      this.onUpdate();
    } finally {
      this.sampling = false;
    }
  }

  private applyNetworkSample(id: string, raw: RawNetworkSample, now: number): void {
    const session = this.sessions.get(id);
    if (!session) return;
    session.processIds = raw.processIds;
    if (!raw.available) {
      session.network = {
        source: raw.source,
        available: false,
        hasByteCounters: false,
        connectionCount: raw.connectionCount,
        loopback: raw.loopback,
        receivedBytes: session.network?.receivedBytes ?? 0,
        sentBytes: session.network?.sentBytes ?? 0,
        receiveRate: 0,
        sendRate: 0,
        ...(raw.error ? { error: raw.error.slice(0, 240) } : {})
      };
      return;
    }
    const traffic = session.networkMeter.update(raw.sockets, now);
    if (traffic.receivedDelta > 0 || traffic.sentDelta > 0) {
      session.lastNetworkActivityAt = now;
    }
    const proxy = raw.proxy
      ? proxySnapshot(
          raw.proxy.processName,
          raw.proxy.sockets.length,
          session.proxyMeter.update(raw.proxy.sockets, now)
        )
      : undefined;
    session.network = {
      source: raw.source,
      available: raw.available,
      hasByteCounters: traffic.hasByteCounters,
      connectionCount: raw.connectionCount,
      loopback: raw.loopback,
      receivedBytes: traffic.receivedBytes,
      sentBytes: traffic.sentBytes,
      receiveRate: traffic.receiveRate,
      sendRate: traffic.sendRate,
      ...(proxy ? { proxy } : {}),
      ...(raw.error ? { error: raw.error.slice(0, 240) } : {})
    };
  }
}

export function classifyCommunicationHealth(input: {
  status: SessionStatus;
  basis: CommunicationHealthBasis;
  now: number;
  lastActivityAt: number;
  quietThresholdMs: number;
  stalledThresholdMs: number;
  providerPhase?: 'waiting' | 'model' | 'tool' | 'complete' | 'unknown';
}): HealthClassification {
  const silentForMs = Math.max(0, input.now - input.lastActivityAt);
  if (input.status !== 'running') return { health: 'idle', basis: input.basis, silentForMs };
  if (input.basis === 'none') return { health: 'unavailable', basis: 'none', silentForMs };
  if (input.providerPhase === 'tool') {
    return { health: 'active', basis: 'provider', silentForMs };
  }
  if (silentForMs >= input.stalledThresholdMs) {
    return { health: 'stalled', basis: input.basis, silentForMs };
  }
  if (silentForMs >= input.quietThresholdMs) {
    return { health: 'quiet', basis: input.basis, silentForMs };
  }
  return { health: 'active', basis: input.basis, silentForMs };
}

function createSession(id: string, platform: NodeJS.Platform): MonitoredSession {
  const now = Date.now();
  return {
    id,
    createdAt: now,
    processIds: [],
    pty: {
      receivedBytes: 0,
      sentBytes: 0,
      receiveRate: 0,
      sendRate: 0,
      previousReceivedBytes: 0,
      previousSentBytes: 0,
      lastSampleAt: now,
      lastReceivedAt: now
    },
    networkMeter: new TrafficMeter(now),
    proxyMeter: new TrafficMeter(now, false),
    provider: new CodexSessionTracker(platform)
  };
}

function samplePty(pty: PtyState, now: number): void {
  const elapsedSeconds = Math.max(0.001, (now - pty.lastSampleAt) / 1000);
  pty.receiveRate = Math.max(0, pty.receivedBytes - pty.previousReceivedBytes) / elapsedSeconds;
  pty.sendRate = Math.max(0, pty.sentBytes - pty.previousSentBytes) / elapsedSeconds;
  pty.previousReceivedBytes = pty.receivedBytes;
  pty.previousSentBytes = pty.sentBytes;
  pty.lastSampleAt = now;
}

function toTrafficSnapshot(pty: PtyState): TrafficSnapshot {
  return {
    receivedBytes: pty.receivedBytes,
    sentBytes: pty.sentBytes,
    receiveRate: pty.receiveRate,
    sendRate: pty.sendRate
  };
}

function proxySnapshot(
  processName: string,
  connectionCount: number,
  traffic: TrafficSnapshot
): ProxyCommunicationSnapshot {
  return { processName, connectionCount, shared: true, ...traffic };
}

function resetNetworkState(session: MonitoredSession, now: number): void {
  session.network = undefined;
  session.lastNetworkActivityAt = undefined;
  session.networkMeter = new TrafficMeter(now);
  session.proxyMeter = new TrafficMeter(now, false);
}
