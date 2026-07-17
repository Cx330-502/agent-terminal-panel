import { open, readdir, readlink, stat } from 'node:fs/promises';
import type { ProviderCommunicationSnapshot } from '../shared';
import { runCommand } from './command';

const MAX_TAIL_BYTES = 2 * 1024 * 1024;
const DISCOVERY_INTERVAL_MS = 5000;

interface TokenUsage {
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
}

export class CodexSessionTracker {
  private readonly accumulator = new CodexMetricsAccumulator();
  private filePath: string | undefined;
  private offset = 0;
  private remainder = '';
  private nextDiscoveryAt = 0;

  constructor(private readonly platform: NodeJS.Platform = process.platform) {}

  reset(): void {
    this.accumulator.reset();
    this.filePath = undefined;
    this.offset = 0;
    this.remainder = '';
    this.nextDiscoveryAt = 0;
  }

  async sample(processIds: number[], now = Date.now()): Promise<void> {
    if (!this.filePath && now >= this.nextDiscoveryAt) {
      this.nextDiscoveryAt = now + DISCOVERY_INTERVAL_MS;
      this.filePath = await findOpenCodexSession(processIds, this.platform);
      if (this.filePath) await this.readInitialTail();
      return;
    }
    if (this.filePath) await this.readIncremental();
  }

  snapshot(now = Date.now()): ProviderCommunicationSnapshot | undefined {
    return this.filePath ? this.accumulator.snapshot(now) : undefined;
  }

  private async readInitialTail(): Promise<void> {
    const filePath = this.filePath;
    if (!filePath) return;
    try {
      const info = await stat(filePath);
      const start = Math.max(0, info.size - MAX_TAIL_BYTES);
      const text = await readRange(filePath, start, info.size - start);
      this.offset = info.size;
      this.consume(start > 0 ? text.slice(Math.max(0, text.indexOf('\n') + 1)) : text);
    } catch {
      this.filePath = undefined;
      this.offset = 0;
    }
  }

  private async readIncremental(): Promise<void> {
    const filePath = this.filePath;
    if (!filePath) return;
    try {
      const info = await stat(filePath);
      if (info.size === this.offset) return;
      if (info.size < this.offset) {
        this.offset = 0;
        this.remainder = '';
      }
      const start = Math.max(this.offset, info.size - MAX_TAIL_BYTES);
      const truncated = start > this.offset;
      const text = await readRange(filePath, start, info.size - start);
      this.offset = info.size;
      this.consume(truncated ? text.slice(Math.max(0, text.indexOf('\n') + 1)) : text);
    } catch {
      this.filePath = undefined;
      this.offset = 0;
      this.remainder = '';
    }
  }

  private consume(chunk: string): void {
    const lines = `${this.remainder}${chunk}`.split(/\r?\n/u);
    this.remainder = lines.pop() ?? '';
    for (const line of lines) this.accumulator.applyLine(line);
  }
}

export class CodexMetricsAccumulator {
  private seen = false;
  private turnActive = false;
  private phase: ProviderCommunicationSnapshot['phase'] = 'unknown';
  private turnStartedAt: number | undefined;
  private firstEventAt: number | undefined;
  private currentUsage: TokenUsage | undefined;
  private baselineUsage: TokenUsage | undefined;
  private turnInputTokens: number | undefined;
  private turnOutputTokens: number | undefined;
  private totalTokens: number | undefined;
  private contextWindow: number | undefined;
  private lastTtftMs: number | undefined;
  private lastTurnDurationMs: number | undefined;

  reset(): void {
    this.seen = false;
    this.turnActive = false;
    this.phase = 'unknown';
    this.turnStartedAt = undefined;
    this.firstEventAt = undefined;
    this.currentUsage = undefined;
    this.baselineUsage = undefined;
    this.turnInputTokens = undefined;
    this.turnOutputTokens = undefined;
    this.totalTokens = undefined;
    this.contextWindow = undefined;
    this.lastTtftMs = undefined;
    this.lastTurnDurationMs = undefined;
  }

  applyLine(line: string): void {
    if (!line.trim()) return;
    try {
      this.applyRecord(JSON.parse(line) as unknown);
    } catch {
      // Large tool outputs can leave a partial line at the start of a bounded tail.
    }
  }

  snapshot(now = Date.now()): ProviderCommunicationSnapshot | undefined {
    if (!this.seen) return undefined;
    const waitingForFirstEventMs =
      this.turnActive && this.turnStartedAt !== undefined && this.firstEventAt === undefined
        ? Math.max(0, now - this.turnStartedAt)
        : undefined;
    const firstEventMs =
      this.turnActive && this.turnStartedAt !== undefined && this.firstEventAt !== undefined
        ? Math.max(0, this.firstEventAt - this.turnStartedAt)
        : undefined;
    return {
      provider: 'codex',
      source: 'codex-jsonl',
      turnActive: this.turnActive,
      phase: this.phase,
      ...(waitingForFirstEventMs === undefined ? {} : { waitingForFirstEventMs }),
      ...(firstEventMs === undefined ? {} : { firstEventMs }),
      ...(this.lastTtftMs === undefined ? {} : { lastTtftMs: this.lastTtftMs }),
      ...(this.lastTurnDurationMs === undefined
        ? {}
        : { lastTurnDurationMs: this.lastTurnDurationMs }),
      ...(this.turnInputTokens === undefined ? {} : { turnInputTokens: this.turnInputTokens }),
      ...(this.turnOutputTokens === undefined ? {} : { turnOutputTokens: this.turnOutputTokens }),
      ...(this.totalTokens === undefined ? {} : { totalTokens: this.totalTokens }),
      ...(this.contextWindow === undefined ? {} : { contextWindow: this.contextWindow })
    };
  }

  private applyRecord(value: unknown): void {
    if (!isRecord(value)) return;
    const timestamp = parseTimestamp(value.timestamp);
    const type = value.type;
    const payload = isRecord(value.payload) ? value.payload : undefined;
    if (!payload) return;

    if (type === 'event_msg' && payload.type === 'task_started') {
      this.seen = true;
      this.turnActive = true;
      this.phase = 'waiting';
      this.turnStartedAt = timestamp;
      this.firstEventAt = undefined;
      this.baselineUsage = this.currentUsage ? { ...this.currentUsage } : undefined;
      this.turnInputTokens = 0;
      this.turnOutputTokens = 0;
      return;
    }

    if (type === 'event_msg' && payload.type === 'token_count') {
      this.seen = true;
      const info = isRecord(payload.info) ? payload.info : undefined;
      const totalUsage = parseTokenUsage(info?.total_token_usage);
      if (totalUsage) {
        this.currentUsage = totalUsage;
        this.totalTokens = totalUsage.totalTokens;
        if (this.turnActive) {
          const baseline = this.baselineUsage ?? { inputTokens: 0, outputTokens: 0 };
          this.turnInputTokens = Math.max(
            0,
            totalUsage.inputTokens - baseline.inputTokens
          );
          this.turnOutputTokens = Math.max(
            0,
            totalUsage.outputTokens - baseline.outputTokens
          );
        }
      }
      const contextWindow = numberValue(info?.model_context_window);
      if (contextWindow !== undefined) this.contextWindow = contextWindow;
      return;
    }

    if (type === 'event_msg' && payload.type === 'task_complete') {
      this.seen = true;
      this.turnActive = false;
      this.phase = 'complete';
      const ttft = numberValue(payload.time_to_first_token_ms);
      const duration = numberValue(payload.duration_ms);
      if (ttft !== undefined) this.lastTtftMs = ttft;
      if (duration !== undefined) this.lastTurnDurationMs = duration;
      return;
    }

    if (type !== 'response_item' || !this.turnActive) return;
    const itemType = payload.type;
    const assistantMessage = itemType === 'message' && payload.role !== 'user';
    const modelEvent =
      itemType === 'reasoning' ||
      assistantMessage ||
      itemType === 'function_call' ||
      itemType === 'custom_tool_call';
    if (modelEvent && this.firstEventAt === undefined) this.firstEventAt = timestamp;
    if (itemType === 'function_call' || itemType === 'custom_tool_call') this.phase = 'tool';
    else if (itemType === 'function_call_output' || itemType === 'custom_tool_call_output') {
      this.phase = 'waiting';
    } else if (modelEvent) this.phase = 'model';
  }
}

async function findOpenCodexSession(
  processIds: number[],
  platform: NodeJS.Platform
): Promise<string | undefined> {
  const paths =
    platform === 'linux'
      ? await findLinuxOpenFiles(processIds)
      : platform === 'darwin'
        ? await findMacosOpenFiles(processIds)
        : [];
  const candidates = await Promise.all(
    [...new Set(paths.filter(isCodexSessionPath))].map(async (filePath) => {
      try {
        return { filePath, modifiedAt: (await stat(filePath)).mtimeMs };
      } catch {
        return undefined;
      }
    })
  );
  return candidates
    .filter((candidate): candidate is { filePath: string; modifiedAt: number } => Boolean(candidate))
    .sort((left, right) => right.modifiedAt - left.modifiedAt)[0]?.filePath;
}

async function findLinuxOpenFiles(processIds: number[]): Promise<string[]> {
  const paths: string[] = [];
  await Promise.all(
    processIds.map(async (pid) => {
      try {
        const descriptors = await readdir(`/proc/${pid}/fd`);
        await Promise.all(
          descriptors.map(async (descriptor) => {
            try {
              paths.push(await readlink(`/proc/${pid}/fd/${descriptor}`));
            } catch {
              // Descriptors can close while being inspected.
            }
          })
        );
      } catch {
        // Processes can exit while being inspected.
      }
    })
  );
  return paths;
}

async function findMacosOpenFiles(processIds: number[]): Promise<string[]> {
  if (processIds.length === 0) return [];
  try {
    const output = await runCommand('lsof', ['-a', '-p', processIds.join(','), '-Fn'], 2500);
    return output
      .split(/\r?\n/u)
      .filter((line) => line.startsWith('n'))
      .map((line) => line.slice(1));
  } catch {
    return [];
  }
}

async function readRange(filePath: string, position: number, length: number): Promise<string> {
  if (length <= 0) return '';
  const handle = await open(filePath, 'r');
  try {
    const buffer = Buffer.alloc(length);
    const result = await handle.read(buffer, 0, length, position);
    return buffer.subarray(0, result.bytesRead).toString('utf8');
  } finally {
    await handle.close();
  }
}

function isCodexSessionPath(value: string): boolean {
  return /(?:^|[\\/])sessions[\\/].*[\\/]rollout-[^\\/]+\.jsonl$/iu.test(value);
}

function parseTokenUsage(value: unknown): TokenUsage | undefined {
  if (!isRecord(value)) return undefined;
  const inputTokens = numberValue(value.input_tokens);
  const outputTokens = numberValue(value.output_tokens);
  const totalTokens = numberValue(value.total_tokens);
  return inputTokens === undefined || outputTokens === undefined || totalTokens === undefined
    ? undefined
    : { inputTokens, outputTokens, totalTokens };
}

function parseTimestamp(value: unknown): number {
  if (typeof value !== 'string') return Date.now();
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : Date.now();
}

function numberValue(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value));
}
