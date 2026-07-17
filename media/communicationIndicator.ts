import type {
  CommunicationSnapshot,
  NetworkProbeSource,
  SessionSnapshot
} from '../src/shared';

export class CommunicationIndicator {
  constructor(
    private readonly element: HTMLElement,
    private readonly dot: HTMLElement,
    private readonly fullLabel: HTMLElement,
    private readonly compactLabel: HTMLElement,
    private readonly traffic: HTMLElement,
    private readonly latency: HTMLElement
  ) {}

  render(session: SessionSnapshot | undefined): void {
    const communication = session?.communication;
    this.element.hidden = !communication;
    if (!communication) return;

    this.element.className = `communication-summary communication-${communication.health}`;
    this.dot.className = `communication-dot communication-${communication.health}`;
    const labels = healthLabels(communication);
    this.fullLabel.textContent = labels.full;
    this.compactLabel.textContent = labels.compact;
    this.traffic.textContent = trafficLabel(communication);
    const latency = latencyLabel(communication);
    this.latency.textContent = latency;
    this.latency.hidden = !latency;
    this.element.title = communicationDetails(communication);
  }
}

export function communicationStatusLabel(session: SessionSnapshot): string | undefined {
  const communication = session.communication;
  if (!communication) return undefined;
  const labels = healthLabels(communication);
  return `${labels.full} · ${trafficLabel(communication)}`;
}

function healthLabels(communication: CommunicationSnapshot): { full: string; compact: string } {
  const duration = formatDuration(communication.silentForMs);
  if (communication.health === 'quiet') return { full: `通信静默 ${duration}`, compact: duration };
  if (communication.health === 'stalled') {
    return { full: `疑似停滞 ${duration}`, compact: duration };
  }
  if (communication.health === 'idle') return { full: '通信空闲', compact: '空闲' };
  if (communication.health === 'unavailable') return { full: '监测待就绪', compact: '待就绪' };
  const waiting = communication.provider?.waitingForFirstEventMs;
  return waiting === undefined
    ? { full: '通信活跃', compact: '活跃' }
    : { full: `等待首响应 ${formatDuration(waiting)}`, compact: formatDuration(waiting) };
}

function trafficLabel(communication: CommunicationSnapshot): string {
  const network = communication.network;
  if (network?.available && network.hasByteCounters && network.connectionCount > 0) {
    if (network.loopback && network.proxy) {
      return `${network.proxy.processName}* ↓${formatRate(network.proxy.receiveRate)} ↑${formatRate(network.proxy.sendRate)}`;
    }
    return `Socket ↓${formatRate(network.receiveRate)} ↑${formatRate(network.sendRate)}`;
  }
  if (network?.available && network.connectionCount > 0) {
    return `${network.connectionCount} 个连接`;
  }
  return `PTY ↓${formatRate(communication.pty.receiveRate)} ↑${formatRate(communication.pty.sendRate)}`;
}

function latencyLabel(communication: CommunicationSnapshot): string {
  const provider = communication.provider;
  if (!provider) return '';
  if (provider.turnActive && provider.waitingForFirstEventMs !== undefined) {
    return `首响应 ${formatDuration(provider.waitingForFirstEventMs)}…`;
  }
  if (provider.turnActive && provider.firstEventMs !== undefined) {
    return `首事件 ${formatDuration(provider.firstEventMs)}*`;
  }
  return provider.lastTtftMs === undefined ? '' : `TTFT ${formatDuration(provider.lastTtftMs)}`;
}

function communicationDetails(communication: CommunicationSnapshot): string {
  const lines = [
    `健康状态：${healthLabels(communication).full}`,
    `判断依据：${basisLabel(communication)}`,
    `PTY：↓ ${formatRate(communication.pty.receiveRate)} · ↑ ${formatRate(communication.pty.sendRate)}`
  ];
  const network = communication.network;
  if (network) {
    lines.push(
      `${networkSourceLabel(network.source)}：${network.connectionCount} 个连接` +
        (!network.available
          ? ' · 探针当前不可用'
          : network.hasByteCounters
          ? ` · ↓ ${formatRate(network.receiveRate)} · ↑ ${formatRate(network.sendRate)}`
          : ' · 当前平台不提供逐进程字节')
    );
    if (network.loopback) lines.push('Agent 连接目标是本地 loopback 代理。');
    if (network.proxy) {
      lines.push(
        `${network.proxy.processName} 上游（进程共享估计）：↓ ${formatRate(network.proxy.receiveRate)} · ↑ ${formatRate(network.proxy.sendRate)}`
      );
    }
    if (!network.available && network.error) lines.push(`网络探针不可用：${network.error}`);
  }
  const provider = communication.provider;
  if (provider) {
    if (provider.lastTtftMs !== undefined) {
      lines.push(`Codex TTFT：${formatDuration(provider.lastTtftMs)}（JSONL task_complete 精确值）`);
    }
    if (provider.turnOutputTokens !== undefined) {
      lines.push(`当前/最近回合输出 tokens：${formatInteger(provider.turnOutputTokens)}`);
    }
    if (provider.totalTokens !== undefined) {
      lines.push(`Codex 会话累计 tokens：${formatInteger(provider.totalTokens)}`);
    }
    if (provider.firstEventMs !== undefined && provider.turnActive) {
      lines.push('“首事件”来自 JSONL 首个模型事件，不等同于精确 TTFT。');
    }
  }
  return lines.join('\n');
}

function basisLabel(communication: CommunicationSnapshot): string {
  if (communication.healthBasis === 'network') return 'Agent 进程 TCP socket';
  if (communication.healthBasis === 'provider') return 'Provider 正在执行本地工具';
  if (communication.healthBasis === 'pty') return 'PTY 输出活动（非网络流量）';
  return '暂无可用来源';
}

function networkSourceLabel(source: NetworkProbeSource): string {
  if (source === 'linux-ss') return 'Linux ss socket';
  if (source === 'macos-nettop') return 'macOS nettop';
  return 'Windows TCP 连接';
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
