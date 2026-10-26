import assert from 'node:assert/strict';
import test from 'node:test';
import { prepareProviderLaunch } from '../src/providerLaunch';

const id = '22222222-2222-4222-8222-222222222222';
const prepare = (command: string) => prepareProviderLaunch(command, () => id);

test('fresh Claude launches receive an exact session ID', () => {
  assert.deepEqual(prepare('claude --model opus'), {
    command: `claude --model opus --session-id ${id}`,
    providerId: 'claude',
    providerSessionId: id
  });
  assert.equal(prepare('ANTHROPIC_MODEL=x claude "fix the tests"').providerSessionId, id);
  assert.equal(prepare('npx -y @anthropic-ai/claude-code').providerSessionId, id);
});

test('resume, print, subcommands, shell syntax and other providers are left unchanged', () => {
  for (const command of [
    `claude --resume ${id}`,
    `claude -r${id}`,
    'claude -rc',
    `claude --resume ${id} --fork-session`,
    'claude -c',
    'claude --continue',
    'claude -p "summarize"',
    'claude -psummarize',
    `claude --session-id=${id}`,
    'claude mcp list',
    'claude doctor',
    'claude --model opus mcp list',
    'claude --model sonnet plugin list',
    'claude --model opus && echo done',
    'claude $CLAUDE_ARGS',
    'claude # comment',
    'claude \\',
    'bash -lc claude'
  ]) {
    const prepared = prepare(command);
    assert.equal(prepared.command, command, command);
    assert.equal(prepared.providerSessionId, undefined, command);
  }
  assert.deepEqual(prepare('codex --profile work'), {
    command: 'codex --profile work',
    providerId: 'codex'
  });
  assert.deepEqual(prepare(''), { command: '' });
});
