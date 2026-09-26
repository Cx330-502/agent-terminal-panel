import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import test from 'node:test';
import { build } from 'esbuild';
import type * as vscode from 'vscode';
import type * as Fake from './fixtures/webviewVscode';
import type { WebviewDocumentHost } from '../src/webviewDocumentHost';
import type { StartupLogger } from '../src/startupLogger';

test('editor transfers preserve one message owner, replay and sidebar return; reload replaces only the panel', async (t) => {
  const root = await mkdtemp(join(tmpdir(), 'agent-webview-test-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const outfile = join(root, 'host.cjs');
  await build({
    stdin: {
      contents: `export * from './src/webviewDocumentHost';
        export * from './src/startupLogger'; export * from './test/fixtures/webviewVscode';`,
      resolveDir: process.cwd()
    },
    alias: { vscode: resolve('test/fixtures/webviewVscode.ts') },
    outfile, bundle: true, platform: 'node', format: 'cjs', logLevel: 'silent'
  });
  const fake = createRequire(import.meta.url)(outfile) as typeof Fake & {
    WebviewDocumentHost: typeof WebviewDocumentHost;
    StartupLogger: typeof StartupLogger;
  };
  const received: string[] = [];
  const host = new fake.WebviewDocumentHost(
    new fake.Uri('file:///extension') as unknown as vscode.Uri,
    'agentTerminalPanel.terminalView.focus', new fake.StartupLogger(), {
      receiveMessage(message) {
        received.push(message.type);
        if (message.type === 'ready') host.markReady();
      },
      visibilityChanged() {}
    }
  );
  t.after(() => host.dispose());
  const sidebar = new fake.FakeView();
  host.resolve(sidebar as unknown as vscode.WebviewView);
  sidebar.webview.incoming.fire({ type: 'ready' });
  assert.equal(host.ready, true);
  host.openInEditor();
  const panel = fake.panels[0]!;
  assert.equal(host.ready, false);
  assert.match(sidebar.webview.html, /Move sessions back to sidebar/);
  sidebar.webview.incoming.fire({ type: 'input' });
  assert.deepEqual(received, ['ready']);
  panel.webview.incoming.fire({ type: 'ready' });
  host.post({ type: 'output', id: 'existing-pty', data: 'replay sentinel' });
  assert.deepEqual(panel.webview.messages, [
    { type: 'output', id: 'existing-pty', data: 'replay sentinel' }
  ]);
  assert.deepEqual(sidebar.webview.messages, []);
  host.openInEditor();
  assert.equal(fake.panels.length, 1);
  await host.reloadManually();
  assert.equal(panel.isDisposed, true);
  assert.equal(fake.panels.length, 2);
  const replacement = fake.panels[1]!;
  assert.equal(replacement.viewColumn, 2);
  assert.equal(host.inEditor, true);
  assert.equal(host.ready, false);
  replacement.webview.incoming.fire({ type: 'ready' });
  replacement.dispose();
  assert.equal(host.inEditor, false);
  assert.match(sidebar.webview.html, /id="terminal-stack"/);
  sidebar.webview.incoming.fire({ type: 'ready' });
  assert.equal(host.ready, true);
  host.openInEditor();
  await host.moveToSidebar();
  assert.equal(host.inEditor, false);
  assert.equal(fake.commandCalls.at(-1), 'agentTerminalPanel.terminalView.focus');
  host.openInEditor();
  sidebar.dispose();
  assert.equal(host.view, undefined);
  assert.equal(host.inEditor, true);
  host.dispose();
  assert.equal(fake.panels.at(-1)?.isDisposed, true);
});
