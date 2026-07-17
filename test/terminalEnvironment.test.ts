import assert from 'node:assert/strict';
import test from 'node:test';
import { buildTerminalEnvironment } from '../src/terminalEnvironment';

test('default terminal environment identifies VS Code without image capabilities', () => {
  assert.deepEqual(
    buildTerminalEnvironment(
      { PATH: '/bin', TERM_PROGRAM: 'parent' },
      { AGENT_SETTING: 'enabled' },
      { imagesEnabled: false, vscodeVersion: '1.123.0' }
    ),
    {
      PATH: '/bin',
      TERM_PROGRAM: 'vscode',
      AGENT_SETTING: 'enabled',
      TERM: 'xterm-256color',
      COLORTERM: 'truecolor',
      TERM_PROGRAM_VERSION: '1.123.0'
    }
  );
});

test('image mode advertises Sixel and removes terminal identity overrides', () => {
  assert.deepEqual(
    buildTerminalEnvironment(
      {
        PATH: '/bin',
        TERM_PROGRAM: 'vscode',
        TERM_PROGRAM_VERSION: '1.123.0'
      },
      { TERM_PROGRAM: 'custom', TERM_PROGRAM_VERSION: 'custom-version' },
      { imagesEnabled: true, vscodeVersion: '1.123.0' }
    ),
    {
      PATH: '/bin',
      TERM: 'xterm-sixel',
      COLORTERM: 'truecolor'
    }
  );
});
