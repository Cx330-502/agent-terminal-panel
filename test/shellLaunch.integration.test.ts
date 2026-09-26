import assert from 'node:assert/strict';
import { mkdtemp, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import type { AgentProcessConfig } from '../src/config';
import { PtyHost } from '../src/ptyHost';
import { SessionManager } from '../src/sessionManager';

test('PTY uses the selected Bash path and rc arguments instead of the inherited shell', {
  timeout: 10_000
}, async (t) => {
  if (process.platform === 'win32') return t.skip('Unix Bash fixture');
  const fixtureRoot = await mkdtemp(join(tmpdir(), 'agent shell '));
  t.after(() => rm(fixtureRoot, { recursive: true, force: true }));
  const shellPath = join(fixtureRoot, 'bash');
  const rcPath = join(fixtureRoot, 'agent rc');
  await symlink('/bin/bash', shellPath);
  await writeFile(rcPath, 'export ATP_SHELL_MARKER="from-selected-bash"\n');

  let output = '';
  let host!: PtyHost;
  const exited = new Promise<number>((resolve, reject) => {
    host = new PtyHost({
      onData: (_id, data) => { output += data; },
      onExit: (_id, code) => resolve(code),
      onError: (_id, error) => reject(error)
    });
  });
  t.after(() => host.dispose());
  host.spawn('shell-test', fixtureRoot, { cols: 100, rows: 24 }, {
    launchCommand: `printf 'RESULT<%s|%s>\\n' "$ATP_SHELL_MARKER" '中文 参数'`,
    shell: { path: shellPath, args: ['--rcfile', rcPath, '-ic'] },
    environment: { SHELL: '/missing-inherited-shell', ATP_SHELL_MARKER: '' },
    terminalImagesEnabled: false,
    vscodeVersion: 'test'
  });
  assert.equal(await exited, 0);
  assert.match(output, /RESULT<from-selected-bash\|中文 参数>/u);
});

test('saved and resumed sessions pick up shell configuration changes on restart', {
  timeout: 10_000
}, async (t) => {
  if (process.platform === 'win32') return t.skip('Unix Bash fixture');
  const fixtureRoot = await mkdtemp(join(tmpdir(), 'agent-shell-restart-'));
  t.after(() => rm(fixtureRoot, { recursive: true, force: true }));
  const firstRc = join(fixtureRoot, 'first.rc');
  const nextRc = join(fixtureRoot, 'next.rc');
  await writeFile(firstRc, 'export ATP_SHELL_MARKER=first\n');
  await writeFile(nextRc, 'export ATP_SHELL_MARKER=next\n');
  let config: AgentProcessConfig = {
    launchCommand: 'exit 99',
    shell: { path: '/bin/bash', args: ['--rcfile', firstRc, '-ic'] },
    environment: { SHELL: '/missing-inherited-shell' },
    terminalImagesEnabled: false,
    vscodeVersion: 'test'
  };
  let output = '';
  let expected = '';
  let complete = () => {};
  const manager = new SessionManager(() => config, () => ({
    enabled: false, sampleIntervalMs: 2000, quietThresholdMs: 15000,
    stalledThresholdMs: 45000, processNetworkEnabled: false, codexSessionMetricsEnabled: false
  }), {
    onOutput: (_id, data) => {
      output += data;
      if (output.includes(expected)) complete();
    },
    onClear() {}, onStateChanged() {}, onAttention() {}, onStartupTiming() {}
  });
  t.after(() => manager.dispose());
  const waitForOutput = (marker: string) => {
    output = '';
    expected = marker;
    return new Promise<void>((resolve) => { complete = resolve; });
  };
  const first = waitForOutput('SAVED<first>');
  const id = manager.create(fixtureRoot, { cols: 100, rows: 24 }, {
    launchSource: 'profile',
    launchCommand: `printf 'SAVED<%s>\\n' "$ATP_SHELL_MARKER"`
  });
  await first;
  config = { ...config, shell: { path: '/bin/bash', args: ['--rcfile', nextRc, '-ic'] } };
  const rerun = waitForOutput('SAVED<next>');
  manager.restart(id);
  await rerun;
  const resume = waitForOutput('RESUME<next>');
  manager.restart(id, `printf 'RESUME<%s>\\n' "$ATP_SHELL_MARKER"`);
  await resume;
});

test('Windows PTY executes a command through the selected PowerShell', {
  timeout: 15_000
}, async (t) => {
  if (process.platform !== 'win32') return t.skip('Windows PowerShell fixture');
  let output = '';
  let host!: PtyHost;
  const exited = new Promise<number>((resolve, reject) => {
    host = new PtyHost({
      onData: (_id, data) => { output += data; },
      onExit: (_id, code) => resolve(code),
      onError: (_id, error) => reject(error)
    });
  });
  t.after(() => host.dispose());
  host.spawn('powershell-test', process.cwd(), { cols: 100, rows: 24 }, {
    launchCommand: `Write-Output ('POWERSHELL<' + $env:ATP_SHELL_MARKER + '>')`,
    shell: { path: 'powershell.exe', args: [] },
    environment: { ATP_SHELL_MARKER: 'selected' },
    terminalImagesEnabled: false,
    vscodeVersion: 'test'
  });
  assert.equal(await exited, 0);
  assert.match(output, /POWERSHELL<selected>/u);
});
