import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import test from 'node:test';
import { build } from 'esbuild';
import type * as vscode from 'vscode';
import type * as Fake from './fixtures/webviewVscode';
import type { getWebviewHtml } from '../src/webviewHtml';

test('rebuilt Webview documents embed extension CSS instead of refetching stylesheets', async (t) => {
  const root = await mkdtemp(join(tmpdir(), 'agent-webview-html-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const outfile = join(root, 'html.cjs');
  await build({
    stdin: {
      contents: `export * from './src/webviewHtml'; export * from './test/fixtures/webviewVscode';`,
      resolveDir: process.cwd()
    },
    alias: { vscode: resolve('test/fixtures/webviewVscode.ts') },
    outfile, bundle: true, platform: 'node', format: 'cjs', logLevel: 'silent'
  });
  const fake = createRequire(import.meta.url)(outfile) as typeof Fake & {
    getWebviewHtml: typeof getWebviewHtml;
  };
  const webview = new fake.FakeWebview() as unknown as vscode.Webview;
  const extensionUri = Object.assign(new fake.Uri('file:///extension'), {
    scheme: 'file',
    fsPath: process.cwd()
  }) as unknown as vscode.Uri;

  const html = fake.getWebviewHtml(webview, extensionUri, 'en', 3);
  assert.doesNotMatch(html, /<link rel="stylesheet"/u);
  for (const name of ['xterm.css', 'styles.css', 'sessionControls.css', 'search.css']) {
    assert.match(html, new RegExp(`<style data-stylesheet="${name.replace('.', '\\.')}">`, 'u'));
  }
  assert.match(html, /\.icon-button[,:\s{]/u);
  assert.match(html, /style-src https:\/\/test\.invalid 'unsafe-inline'/u);
  assert.match(html, /src="file:\/\/\/extension\/media\/main\.js\?generation=3"/u);

  const unreadable = new fake.Uri('file:///missing') as unknown as vscode.Uri;
  assert.match(fake.getWebviewHtml(webview, unreadable, 'en', 1), /<link rel="stylesheet" href="file:\/\/\/missing\/media\/styles\.css\?generation=1">/u);
});
