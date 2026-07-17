import assert from 'node:assert/strict';
import test from 'node:test';
import { CodexMetricsAccumulator } from '../src/communication/codexSessionTracker';

test('Codex JSONL metrics expose exact TTFT and per-turn token deltas', () => {
  const metrics = new CodexMetricsAccumulator();
  metrics.applyLine(line('2026-07-17T10:00:00.000Z', 'event_msg', {
    type: 'token_count',
    info: usage(100, 20, 120, 200_000)
  }));
  metrics.applyLine(line('2026-07-17T10:00:01.000Z', 'event_msg', {
    type: 'task_started'
  }));

  const waiting = metrics.snapshot(Date.parse('2026-07-17T10:00:03.000Z'));
  assert.equal(waiting?.waitingForFirstEventMs, 2000);
  assert.equal(waiting?.phase, 'waiting');

  metrics.applyLine(line('2026-07-17T10:00:04.500Z', 'response_item', {
    type: 'reasoning'
  }));
  metrics.applyLine(line('2026-07-17T10:00:05.000Z', 'response_item', {
    type: 'custom_tool_call'
  }));
  metrics.applyLine(line('2026-07-17T10:00:06.000Z', 'event_msg', {
    type: 'token_count',
    info: usage(150, 35, 185, 200_000)
  }));

  const active = metrics.snapshot(Date.parse('2026-07-17T10:00:07.000Z'));
  assert.equal(active?.firstEventMs, 3500);
  assert.equal(active?.phase, 'tool');
  assert.equal(active?.turnInputTokens, 50);
  assert.equal(active?.turnOutputTokens, 15);

  metrics.applyLine(line('2026-07-17T10:00:08.000Z', 'event_msg', {
    type: 'task_complete',
    duration_ms: 7000,
    time_to_first_token_ms: 2400
  }));
  const completed = metrics.snapshot(Date.parse('2026-07-17T10:00:08.000Z'));
  assert.equal(completed?.turnActive, false);
  assert.equal(completed?.lastTtftMs, 2400);
  assert.equal(completed?.lastTurnDurationMs, 7000);
});

test('first Codex turn counts tokens from zero when no earlier usage record exists', () => {
  const metrics = new CodexMetricsAccumulator();
  metrics.applyLine(line('2026-07-17T10:00:01.000Z', 'event_msg', {
    type: 'task_started'
  }));
  metrics.applyLine(line('2026-07-17T10:00:02.000Z', 'event_msg', {
    type: 'token_count',
    info: usage(42, 7, 49, 200_000)
  }));

  const snapshot = metrics.snapshot(Date.parse('2026-07-17T10:00:03.000Z'));
  assert.equal(snapshot?.turnInputTokens, 42);
  assert.equal(snapshot?.turnOutputTokens, 7);
});

function line(timestamp: string, type: string, payload: Record<string, unknown>): string {
  return JSON.stringify({ timestamp, type, payload });
}

function usage(input: number, output: number, total: number, contextWindow: number) {
  return {
    total_token_usage: {
      input_tokens: input,
      cached_input_tokens: 0,
      output_tokens: output,
      reasoning_output_tokens: 0,
      total_tokens: total
    },
    last_token_usage: {
      input_tokens: input,
      cached_input_tokens: 0,
      output_tokens: output,
      reasoning_output_tokens: 0,
      total_tokens: total
    },
    model_context_window: contextWindow
  };
}
