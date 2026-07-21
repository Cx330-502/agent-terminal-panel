import type {
  CommunicationSnapshot,
  NetworkProbeSource,
  SessionSnapshot
} from '../src/shared';
import { formatWebviewString, type WebviewStrings } from '../src/webviewStrings';

export class CommunicationIndicator {
  constructor(
    private readonly element: HTMLElement,
    private readonly dot: HTMLElement,
    private readonly fullLabel: HTMLElement,
    private readonly compactLabel: HTMLElement,
    private readonly traffic: HTMLElement,
    private readonly latency: HTMLElement,
    private readonly strings: WebviewStrings
  ) {}

  render(session: SessionSnapshot | undefined): void {
    const communication = session?.communication;
    this.element.hidden = !communication;
    if (!communication) return;

    this.element.className = `communication-summary communication-${communication.health}`;
    this.dot.className = `communication-dot communication-${communication.health}`;
    const labels = healthLabels(communication, this.strings);
    this.fullLabel.textContent = labels.full;
    this.compactLabel.textContent = labels.compact;
    this.traffic.textContent = trafficLabel(communication, this.strings);
    const latency = latencyLabel(communication, this.strings);
    this.latency.textContent = latency;
    this.latency.hidden = !latency;
    this.element.title = communicationDetails(communication, this.strings);
  }
}

export function communicationStatusLabel(
  session: SessionSnapshot,
  strings: WebviewStrings
): string | undefined {
  const communication = session.communication;
  if (!communication) return undefined;
  const labels = healthLabels(communication, strings);
  return `${labels.full} · ${trafficLabel(communication, strings)}`;
}

function healthLabels(
  communication: CommunicationSnapshot,
  strings: WebviewStrings
): { full: string; compact: string } {
  const duration = formatDuration(communication.silentForMs);
  if (communication.health === 'quiet') {
    return { full: formatWebviewString(strings.communicationQuiet, duration), compact: duration };
  }
  if (communication.health === 'stalled') {
    return { full: formatWebviewString(strings.communicationStalled, duration), compact: duration };
  }
  if (communication.health === 'idle') {
    return { full: strings.communicationIdle, compact: strings.communicationIdleCompact };
  }
  if (communication.health === 'unavailable') {
    return {
      full: strings.communicationUnavailable,
      compact: strings.communicationUnavailableCompact
    };
  }
  const waiting = communication.provider?.waitingForFirstEventMs;
  return waiting === undefined
    ? { full: strings.communicationActive, compact: strings.communicationActiveCompact }
    : {
        full: formatWebviewString(strings.waitingFirstResponse, formatDuration(waiting)),
        compact: formatDuration(waiting)
      };
}

function trafficLabel(communication: CommunicationSnapshot, strings: WebviewStrings): string {
  const network = communication.network;
  if (network?.available && network.hasByteCounters && network.connectionCount > 0) {
    if (network.loopback && network.proxy) {
      return `${network.proxy.processName}* ↓${formatRate(network.proxy.receiveRate)} ↑${formatRate(network.proxy.sendRate)}`;
    }
    return `Socket ↓${formatRate(network.receiveRate)} ↑${formatRate(network.sendRate)}`;
  }
  if (network?.available && network.connectionCount > 0) {
    return connectionCountLabel(network.connectionCount, strings);
  }
  return `PTY ↓${formatRate(communication.pty.receiveRate)} ↑${formatRate(communication.pty.sendRate)}`;
}

function latencyLabel(communication: CommunicationSnapshot, strings: WebviewStrings): string {
  const provider = communication.provider;
  if (!provider) return '';
  if (provider.turnActive && provider.waitingForFirstEventMs !== undefined) {
    return formatWebviewString(strings.firstResponse, formatDuration(provider.waitingForFirstEventMs));
  }
  if (provider.turnActive && provider.firstEventMs !== undefined) {
    return formatWebviewString(strings.firstEvent, formatDuration(provider.firstEventMs));
  }
  return provider.lastTtftMs === undefined ? '' : `TTFT ${formatDuration(provider.lastTtftMs)}`;
}

function communicationDetails(
  communication: CommunicationSnapshot,
  strings: WebviewStrings
): string {
  const lines = [
    formatWebviewString(strings.healthStatus, healthLabels(communication, strings).full),
    formatWebviewString(strings.healthBasis, basisLabel(communication, strings)),
    formatWebviewString(
      strings.ptyRates,
      formatRate(communication.pty.receiveRate),
      formatRate(communication.pty.sendRate)
    )
  ];
  const network = communication.network;
  if (network) {
    lines.push(
      `${networkSourceLabel(network.source, strings)}: ${connectionCountLabel(network.connectionCount, strings)}` +
        (!network.available
          ? ` · ${strings.probeUnavailable}`
          : network.hasByteCounters
          ? ` · ↓ ${formatRate(network.receiveRate)} · ↑ ${formatRate(network.sendRate)}`
          : ` · ${strings.processBytesUnavailable}`)
    );
    if (network.loopback) lines.push(strings.agentUsesLoopback);
    if (network.proxy) {
      lines.push(
        formatWebviewString(
          strings.proxyUpstream,
          network.proxy.processName,
          formatRate(network.proxy.receiveRate),
          formatRate(network.proxy.sendRate)
        )
      );
    }
    if (!network.available && network.error) {
      lines.push(formatWebviewString(strings.networkProbeError, network.error));
    }
  }
  const provider = communication.provider;
  if (provider) {
    if (provider.lastTtftMs !== undefined) {
      lines.push(formatWebviewString(strings.codexTtft, formatDuration(provider.lastTtftMs)));
    }
    if (provider.turnOutputTokens !== undefined) {
      lines.push(formatWebviewString(strings.turnOutputTokens, formatInteger(provider.turnOutputTokens)));
    }
    if (provider.totalTokens !== undefined) {
      lines.push(formatWebviewString(strings.codexTotalTokens, formatInteger(provider.totalTokens)));
    }
    if (provider.firstEventMs !== undefined && provider.turnActive) {
      lines.push(strings.firstEventDisclaimer);
    }
  }
  return lines.join('\n');
}

function basisLabel(communication: CommunicationSnapshot, strings: WebviewStrings): string {
  if (communication.healthBasis === 'network') return strings.basisNetwork;
  if (communication.healthBasis === 'provider') return strings.basisProvider;
  if (communication.healthBasis === 'pty') return strings.basisPty;
  return strings.basisUnavailable;
}

function networkSourceLabel(source: NetworkProbeSource, strings: WebviewStrings): string {
  if (source === 'linux-ss') return 'Linux ss socket';
  if (source === 'macos-nettop') return 'macOS nettop';
  return strings.windowsTcpConnections;
}

function connectionCountLabel(count: number, strings: WebviewStrings): string {
  return formatWebviewString(
    count === 1 ? strings.connectionCountOne : strings.connectionCount,
    count
  );
}

function formatRate(bytesPerSecond: number): string {
  if (bytesPerSecond < 1) return '0 B/s';
  if (bytesPerSecond < 1024) return `${Math.round(bytesPerSecond)} B/s`;
  if (bytesPerSecond < 1024 * 1024) return `${(bytesPerSecond / 1024).toFixed(1)} KB/s`;
  return `${(bytesPerSecond / 1024 / 1024).toFixed(1)} MB/s`;
}

function formatDuration(milliseconds: number): string {
  if (milliseconds < 1000) return `${Math.round(milliseconds)}ms`;
  if (milliseconds < 60_000) return `${(milliseconds / 1000).toFixed(milliseconds < 10_000 ? 1 : 0)}s`;
  return `${Math.floor(milliseconds / 60_000)}m${Math.round((milliseconds % 60_000) / 1000)}s`;
}

function formatInteger(value: number): string {
  return new Intl.NumberFormat().format(value);
}
