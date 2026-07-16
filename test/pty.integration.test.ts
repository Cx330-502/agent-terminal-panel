import assert from 'node:assert/strict';
import test from 'node:test';
import * as nodePty from 'node-pty';
import { resolveLaunchCommand } from '../src/launchCommand';

test('node-pty carries Chinese input and terminal resize events', { timeout: 10_000 }, async (t) => {
  if (process.platform === 'win32') {
    t.skip('Unix PTY integration is covered by the WSL/SSH package target');
    return;
  }
  const script = [
    "process.stdin.setEncoding('utf8')",
    "process.stdout.write('READY 中文\\n')",
    "process.stdin.on('data', d => process.stdout.write('ECHO<' + d.replace(/\\r?\\n/g, '') + '>\\n'))",
    "process.on('SIGWINCH', () => process.stdout.write('SIZE<' + process.stdout.columns + 'x' + process.stdout.rows + '>\\n'))",
    'setInterval(() => {}, 1000)'
  ].join(';');
  const pty = nodePty.spawn(process.execPath, ['-e', script], {
    name: 'xterm-256color',
    cols: 80,
    rows: 24,
    cwd: process.cwd(),
    env: { ...process.env, TERM: 'xterm-256color', COLORTERM: 'truecolor' }
  });
  let output = '';
  pty.onData((data) => {
    output += data;
  });
  t.after(() => {
    try {
      pty.kill();
    } catch {
      // Already exited.
    }
  });

  await waitFor(() => output.includes('READY 中文'));
  pty.write('粘贴中文\r');
  await waitFor(() => output.includes('ECHO<粘贴中文>'));
  pty.resize(100, 40);
  await waitFor(() => output.includes('SIZE<100x40>'));
  assert.match(output, /READY 中文/);
});

async function waitFor(predicate: () => boolean): Promise<void> {
  const deadline = Date.now() + 5000;
  while (!predicate()) {
    if (Date.now() > deadline) throw new Error('Timed out waiting for PTY output');
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
}

test('node-pty launches a full custom command line', { timeout: 10_000 }, async (t) => {
  if (process.platform === 'win32') {
    t.skip('Unix shell command integration is covered by the WSL/SSH package target');
    return;
  }
  const launch = resolveLaunchCommand(
    `printf 'CUSTOM<%s>\\n' "$AGENT_PANEL_TEST"`,
    process.platform,
    process.env
  );
  const pty = nodePty.spawn(launch.command, launch.args, {
    name: 'xterm-256color',
    cols: 80,
    rows: 24,
    cwd: process.cwd(),
    env: {
      ...process.env,
      TERM: 'xterm-256color',
      COLORTERM: 'truecolor',
      AGENT_PANEL_TEST: '自定义 参数'
    }
  });
  let output = '';
  const exited = new Promise<number>((resolve) => {
    pty.onData((data) => {
      output += data;
    });
    pty.onExit(({ exitCode }) => resolve(exitCode));
  });
  assert.equal(await exited, 0);
  assert.match(output, /CUSTOM<自定义 参数>/);
});
