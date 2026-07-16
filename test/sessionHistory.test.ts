import assert from 'node:assert/strict';
import { mkdtemp, mkdir, rm, utimes, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import * as path from 'node:path';
import test from 'node:test';
import { ClaudeSessionProvider } from '../src/sessionHistory/claudeProvider';
import { CodexSessionProvider } from '../src/sessionHistory/codexProvider';
import { compactTitle, isInsideWorkspace } from '../src/sessionHistory/fileUtils';
import { SessionHistoryRegistry } from '../src/sessionHistory/registry';
import type { AgentSessionProvider, HistoricalSession } from '../src/sessionHistory/types';

test('workspace matching rejects sibling paths and accepts nested cwd values', () => {
  assert.equal(isInsideWorkspace('/workspace/project', ['/workspace/project']), true);
  assert.equal(isInsideWorkspace('/workspace/project/packages/app', ['/workspace/project']), true);
  assert.equal(isInsideWorkspace('/workspace/project-copy', ['/workspace/project']), false);
  assert.equal(isInsideWorkspace('/workspace', ['/workspace/project']), false);
});

test('session titles are compacted without losing Unicode', () => {
  assert.equal(compactTitle('  你好\n  Agent   ', 'fallback'), '你好 Agent');
  assert.equal(compactTitle('   ', 'fallback'), 'fallback');
  assert.equal(compactTitle('中'.repeat(120), 'fallback').length, 94);
});

test('Codex provider discovers only current-workspace sessions and builds commands', async (t) => {
  const root = await mkdtemp(path.join(tmpdir(), 'agent-panel-codex-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const workspace = path.join(root, 'workspace');
  const sessions = path.join(root, 'sessions', '2026', '07', '17');
  await mkdir(path.join(workspace, 'nested'), { recursive: true });
  await mkdir(sessions, { recursive: true });
  await writeJsonl(path.join(sessions, 'inside.jsonl'), [
    { type: 'session_meta', payload: { id: 'codex-session-1', cwd: path.join(workspace, 'nested') } },
    { type: 'event_msg', payload: { type: 'user_message', message: '旧问题' } },
    { type: 'event_msg', payload: { type: 'user_message', message: '继续实现终端历史' } }
  ]);
  await writeJsonl(path.join(sessions, 'outside.jsonl'), [
    { type: 'session_meta', payload: { id: 'codex-session-2', cwd: `${workspace}-other` } },
    { type: 'event_msg', payload: { type: 'user_message', message: '不应显示' } }
  ]);

  const provider = new CodexSessionProvider('codex --profile work', path.join(root, 'sessions'));
  const discovered = await provider.discover([workspace], 20);
  assert.equal(discovered.length, 1);
  assert.equal(discovered[0]?.title, '继续实现终端历史');
  assert.equal(discovered[0]?.cwd, path.join(workspace, 'nested'));
  assert.equal(provider.buildLaunchCommand(discovered[0]!, 'resume'), 'codex --profile work resume codex-session-1');
  assert.equal(provider.buildLaunchCommand(discovered[0]!, 'fork'), 'codex --profile work fork codex-session-1');
});

test('Claude provider ignores subagents and supports resume plus fork', async (t) => {
  const root = await mkdtemp(path.join(tmpdir(), 'agent-panel-claude-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const workspace = path.join(root, 'workspace');
  const project = path.join(root, 'projects', '-workspace');
  await mkdir(path.join(project, 'subagents'), { recursive: true });
  await mkdir(workspace, { recursive: true });
  const mainFile = path.join(project, 'claude-session-1.jsonl');
  await writeJsonl(mainFile, [
    { type: 'mode', mode: 'default', sessionId: 'claude-session-1' },
    {
      type: 'user',
      cwd: workspace,
      sessionId: 'claude-session-1',
      message: { role: 'user', content: [{ type: 'text', text: '最初的问题' }] }
    },
    { type: 'last-prompt', lastPrompt: '最新 Claude 任务', sessionId: 'claude-session-1' }
  ]);
  await writeJsonl(path.join(project, 'subagents', 'agent-child.jsonl'), [
    {
      type: 'user',
      cwd: workspace,
      sessionId: 'claude-session-1',
      message: { role: 'user', content: [{ type: 'text', text: '子代理不应显示' }] }
    }
  ]);

  const provider = new ClaudeSessionProvider('claude --model sonnet', path.join(root, 'projects'));
  const discovered = await provider.discover([workspace], 20);
  assert.equal(discovered.length, 1);
  assert.equal(discovered[0]?.title, '最新 Claude 任务');
  assert.equal(provider.buildLaunchCommand(discovered[0]!, 'resume'), 'claude --model sonnet --resume claude-session-1');
  assert.equal(provider.buildLaunchCommand(discovered[0]!, 'fork'), 'claude --model sonnet --resume claude-session-1 --fork-session');
});

test('history registry sorts, deduplicates and isolates provider failures', async () => {
  const older = historical('one', 10);
  const newer = historical('two', 20);
  const providers: AgentSessionProvider[] = [
    fakeProvider('ok', [older, newer, older]),
    {
      ...fakeProvider('broken', []),
      async discover() {
        throw new Error('broken store');
      }
    }
  ];
  const registry = new SessionHistoryRegistry(providers);
  const result = await registry.discover(['/workspace'], 10);
  assert.deepEqual(result.sessions.map((session) => session.sessionId), ['two', 'one']);
  assert.deepEqual(result.failedProviders, ['broken']);
});

async function writeJsonl(file: string, records: unknown[]): Promise<void> {
  await writeFile(file, `${records.map((record) => JSON.stringify(record)).join('\n')}\n`);
  const now = new Date();
  await utimes(file, now, now);
}

function historical(sessionId: string, updatedAt: number): HistoricalSession {
  return {
    providerId: 'ok',
    providerName: 'ok',
    sessionId,
    cwd: '/workspace',
    title: sessionId,
    updatedAt,
    supportsFork: true
  };
}

function fakeProvider(id: string, sessions: HistoricalSession[]): AgentSessionProvider {
  return {
    id,
    name: id,
    async discover() {
      return sessions;
    },
    buildLaunchCommand(session, mode) {
      return `${id} ${mode} ${session.sessionId}`;
    }
  };
}
