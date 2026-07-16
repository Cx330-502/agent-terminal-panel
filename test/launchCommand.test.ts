import assert from 'node:assert/strict';
import test from 'node:test';
import { resolveLaunchCommand } from '../src/launchCommand';

test('Unix launch commands run through the workspace host shell', () => {
  assert.deepEqual(resolveLaunchCommand(' agent-cli --flag value ', 'linux', { SHELL: '/bin/zsh' }), {
    command: '/bin/zsh',
    args: ['-lc', 'agent-cli --flag value']
  });
  assert.deepEqual(resolveLaunchCommand('agent-cli', 'darwin', {}), {
    command: '/bin/sh',
    args: ['-lc', 'agent-cli']
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
