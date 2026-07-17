import type { TrafficSnapshot } from '../shared';
import type { RawSocketCounter } from './types';

interface CounterPair {
  receivedBytes: number;
  sentBytes: number;
}

export interface TrafficUpdate extends TrafficSnapshot {
  receivedDelta: number;
  sentDelta: number;
  hasByteCounters: boolean;
}

export class TrafficMeter {
  private previous = new Map<string, CounterPair>();
  private receivedBytes = 0;
  private sentBytes = 0;
  private lastSampleAt: number;

  constructor(startedAt = Date.now(), private readonly includeInitialCounters = true) {
    this.lastSampleAt = startedAt;
  }

  update(sockets: RawSocketCounter[], sampledAt: number): TrafficUpdate {
    const next = new Map<string, CounterPair>();
    let receivedDelta = 0;
    let sentDelta = 0;
    let hasByteCounters = false;
    for (const socket of sockets) {
      if (socket.receivedBytes === undefined || socket.sentBytes === undefined) continue;
      hasByteCounters = true;
      const current = {
        receivedBytes: socket.receivedBytes,
        sentBytes: socket.sentBytes
      };
      const previous = this.previous.get(socket.key);
      receivedDelta += previous
        ? Math.max(0, current.receivedBytes - previous.receivedBytes)
        : this.includeInitialCounters
          ? current.receivedBytes
          : 0;
      sentDelta += previous
        ? Math.max(0, current.sentBytes - previous.sentBytes)
        : this.includeInitialCounters
          ? current.sentBytes
          : 0;
      next.set(socket.key, current);
    }
    const elapsedSeconds = Math.max(0.001, (sampledAt - this.lastSampleAt) / 1000);
    this.receivedBytes += receivedDelta;
    this.sentBytes += sentDelta;
    this.previous = next;
    this.lastSampleAt = sampledAt;
    return {
      receivedBytes: this.receivedBytes,
      sentBytes: this.sentBytes,
      receiveRate: receivedDelta / elapsedSeconds,
      sendRate: sentDelta / elapsedSeconds,
      receivedDelta,
      sentDelta,
      hasByteCounters
    };
  }
}
