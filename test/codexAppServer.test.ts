import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import * as path from 'node:path';
import test from 'node:test';
import { renameCodexThread } from '../src/sessionHistory/codexAppServer';

test('Codex rename performs initialize handshake and thread/name/set request', async (t) => {
  const root = await mkdtemp(path.join(tmpdir(), 'agent-panel-codex-rpc-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const server = path.join(root, 'fake-app-server.cjs');
  const log = path.join(root, 'requests.jsonl');
  await writeFile(server, fakeServerSource, 'utf8');

  await renameCodexThread(
    `node ${quoteCommandArgument(server)}`,
    '019f91ef-e88a-79e2-aaa3-bcdf9906e4e7',
    '通信健康检查',
    {
      clientVersion: '1.2.0-test',
      environment: { ATP_RPC_LOG: log },
      timeoutMs: 5_000
    }
  );

  const requests = (await readFile(log, 'utf8'))
    .trim()
    .split('\n')
    .map((line) => JSON.parse(line));
  assert.equal(requests[0]?.method, 'initialize');
  assert.equal(requests[0]?.params?.clientInfo?.version, '1.2.0-test');
  assert.equal(requests[1]?.method, 'initialized');
  assert.deepEqual(requests[2], {
    method: 'thread/name/set',
    id: 2,
    params: {
      threadId: '019f91ef-e88a-79e2-aaa3-bcdf9906e4e7',
      name: '通信健康检查'
    }
  });
});

test('Codex rename surfaces app-server protocol errors', async (t) => {
  const root = await mkdtemp(path.join(tmpdir(), 'agent-panel-codex-rpc-error-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const server = path.join(root, 'fake-app-server.cjs');
  await writeFile(server, fakeServerSource, 'utf8');

  await assert.rejects(
    renameCodexThread(
      `node ${quoteCommandArgument(server)}`,
      '019f91ef-e88a-79e2-aaa3-bcdf9906e4e7',
      'Name',
      {
        environment: { ATP_RPC_ERROR: '1' },
        timeoutMs: 5_000
      }
    ),
    /rename rejected/u
  );
});

const fakeServerSource = String.raw`
const fs = require('node:fs');
let buffer = '';
process.stdin.setEncoding('utf8');
process.stdin.on('data', (chunk) => {
  buffer += chunk;
  let newline = buffer.indexOf('\n');
  while (newline >= 0) {
    const line = buffer.slice(0, newline).trim();
    buffer = buffer.slice(newline + 1);
    newline = buffer.indexOf('\n');
    if (!line) continue;
    const request = JSON.parse(line);
    if (process.env.ATP_RPC_LOG) fs.appendFileSync(process.env.ATP_RPC_LOG, line + '\n');
    if (request.id === 1) {
      process.stdout.write(JSON.stringify({ id: 1, result: {} }) + '\n');
    } else if (request.id === 2) {
      process.stdout.write(JSON.stringify(process.env.ATP_RPC_ERROR
        ? { id: 2, error: { message: 'rename rejected' } }
        : { id: 2, result: {} }) + '\n');
    }
  }
});
`;

function quoteCommandArgument(value: string): string {
  return `"${value.replaceAll('"', '\\"')}"`;
}
