import assert from 'node:assert/strict';
import test from 'node:test';
import { resolveLaunchCommand } from '../src/launchCommand';

test('Unix launch commands run through the workspace host shell', () => {
  assert.deepEqual(resolveLaunchCommand(' agent-cli --flag value ', 'linux', { SHELL: '/bin/zsh' }), {
    command: '/bin/zsh',
    args: ['-ic', 'agent-cli --flag value']
  });
  assert.deepEqual(resolveLaunchCommand('agent-cli', 'darwin', {}), {
    command: '/bin/sh',
    args: ['-ic', 'agent-cli']
  });
});

test('Windows launch commands run through ComSpec', () => {
  assert.deepEqual(
    resolveLaunchCommand('agent-cli --flag value', 'win32', { ComSpec: 'C:\\Windows\\cmd.exe' }),
    {
      command: 'C:\\Windows\\cmd.exe',
      args: ['/d', '/s', '/c', 'agent-cli --flag value']
    }
  );
});

test('an empty launch command is rejected', () => {
  assert.throws(() => resolveLaunchCommand('   ', 'linux', {}), /not configured/);
});

test('an explicit shell overrides the inherited shell on Linux and macOS', () => {
  for (const platform of ['linux', 'darwin'] as const) {
    assert.deepEqual(resolveLaunchCommand('agent --name "two words"', platform,
      { SHELL: '/bin/zsh' }, { path: ' /bin/bash ', args: [] }), {
      command: '/bin/bash',
      args: ['-ic', 'agent --name "two words"']
    });
  }
});

test('shell arguments replace defaults and leave the command as one final argument', () => {
  const command = 'agent "中文 参数" && echo done';
  const args = ['--rcfile', '/tmp/shell config/rc', '-ic'];
  assert.deepEqual(resolveLaunchCommand(command, 'linux', {}, { path: '/bin/bash', args }), {
    command: '/bin/bash', args: [...args, command]
  });
  assert.equal(args.length, 3);
  assert.deepEqual(resolveLaunchCommand(command, 'linux', { SHELL: '/bin/zsh' }, {
    path: '', args: ['-ilc']
  }), { command: '/bin/zsh', args: ['-ilc', command] });
  assert.deepEqual(resolveLaunchCommand(command, 'linux', {}, { path: '/bin/bash', args: [] }), {
    command: '/bin/bash', args: ['-ic', command]
  });
});

test('Windows shell selection distinguishes CMD, PowerShell and Git Bash', () => {
  const environment = { ComSpec: 'C:\\Windows\\System32\\cmd.exe' };
  for (const executable of ['pwsh.exe', 'C:\\Program Files\\PowerShell\\7\\pwsh.exe', 'PowerShell.EXE']) {
    assert.deepEqual(resolveLaunchCommand('agent --flag', 'win32', environment, {
      path: executable, args: []
    }), { command: executable, args: ['-NoLogo', '-Command', 'agent --flag'] });
  }
  assert.deepEqual(resolveLaunchCommand('agent', 'win32', environment, {
    path: 'C:\\Program Files\\Git\\bin\\bash.exe', args: []
  }), { command: 'C:\\Program Files\\Git\\bin\\bash.exe', args: ['-ic', 'agent'] });
  assert.deepEqual(resolveLaunchCommand('agent', 'win32', environment, {
    path: 'CMD.EXE', args: []
  }), { command: 'CMD.EXE', args: ['/d', '/s', '/c', 'agent'] });
});

test('PowerShell uses its command flag on Unix and honors explicit profile arguments', () => {
  assert.deepEqual(resolveLaunchCommand('agent', 'linux', {}, {
    path: '/usr/bin/pwsh', args: []
  }), { command: '/usr/bin/pwsh', args: ['-NoLogo', '-Command', 'agent'] });
  assert.deepEqual(resolveLaunchCommand('agent', 'win32', {}, {
    path: 'pwsh.exe', args: ['-NoLogo', '-NoProfile', '-Command']
  }), { command: 'pwsh.exe', args: ['-NoLogo', '-NoProfile', '-Command', 'agent'] });
});
