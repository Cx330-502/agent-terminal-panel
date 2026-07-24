import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, rm, utimes, writeFile } from 'node:fs/promises';
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
  const sessionIndex = path.join(root, 'session_index.jsonl');
  await writeJsonl(sessionIndex, [
    { id: 'codex-session-1', thread_name: '命名后的 Codex 会话' }
  ]);

  let renameRequest: { threadId: string; name: string } | undefined;
  const provider = new CodexSessionProvider('codex --profile work', {
    sessionsRoot: path.join(root, 'sessions'),
    sessionIndexPath: sessionIndex,
    renameThread: async (_command, threadId, name) => {
      renameRequest = { threadId, name };
    }
  });
  const discovered = await provider.discover([workspace], 20);
  assert.equal(discovered.length, 1);
  assert.equal(discovered[0]?.title, '命名后的 Codex 会话');
  assert.equal(discovered[0]?.cwd, path.join(workspace, 'nested'));
  assert.equal(provider.buildLaunchCommand(discovered[0]!, 'resume'), 'codex --profile work resume codex-session-1');
  assert.equal(provider.buildLaunchCommand(discovered[0]!, 'fork'), 'codex --profile work fork codex-session-1');
  await provider.renameSession(discovered[0]!, workspace, '新的 Codex 名称');
  assert.deepEqual(renameRequest, {
    threadId: 'codex-session-1',
    name: '新的 Codex 名称'
  });
});

test('Claude provider ignores subagents and supports resume plus fork', async (t) => {
  const root = await mkdtemp(path.join(tmpdir(), 'agent-panel-claude-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const workspace = path.join(root, 'workspace');
  const project = path.join(root, 'projects', '-workspace');
  await mkdir(path.join(project, 'subagents'), { recursive: true });
  await mkdir(workspace, { recursive: true });
  const sessionId = '11111111-1111-4111-8111-111111111111';
  const mainFile = path.join(project, `${sessionId}.jsonl`);
  await writeJsonl(mainFile, [
    { type: 'mode', mode: 'default', sessionId },
    {
      type: 'user',
      cwd: workspace,
      sessionId,
      message: { role: 'user', content: [{ type: 'text', text: '最初的问题' }] }
    },
    { type: 'last-prompt', lastPrompt: '最新 Claude 任务', sessionId }
  ]);
  await writeJsonl(path.join(project, 'subagents', 'agent-child.jsonl'), [
    {
      type: 'user',
      cwd: workspace,
      sessionId,
      message: { role: 'user', content: [{ type: 'text', text: '子代理不应显示' }] }
    }
  ]);

  const provider = new ClaudeSessionProvider('claude --model sonnet', path.join(root, 'projects'));
  const discovered = await provider.discover([workspace], 20);
  assert.equal(discovered.length, 1);
  assert.equal(discovered[0]?.title, '最新 Claude 任务');
  assert.equal(provider.buildLaunchCommand(discovered[0]!, 'resume'), `claude --model sonnet --resume ${sessionId}`);
  assert.equal(provider.buildLaunchCommand(discovered[0]!, 'fork'), `claude --model sonnet --resume ${sessionId} --fork-session`);
  await provider.renameSession(discovered[0]!, workspace, 'Claude 自定义名称');
  const records = (await readFile(mainFile, 'utf8')).trim().split('\n').map((line) => JSON.parse(line));
  assert.deepEqual(records.at(-1), {
    type: 'custom-title',
    customTitle: 'Claude 自定义名称',
    sessionId,
    uuid: records.at(-1)?.uuid,
    timestamp: records.at(-1)?.timestamp
  });
  assert.match(records.at(-1)?.uuid, /^[0-9a-f-]{36}$/u);

  const renamed = await provider.discover([workspace], 20);
  assert.equal(renamed[0]?.title, 'Claude 自定义名称');
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
