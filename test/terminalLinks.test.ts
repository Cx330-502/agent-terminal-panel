import assert from 'node:assert/strict';
import test from 'node:test';
import { openTerminalLink } from '../src/terminalLinks';

test('WSL switch chooses client browser or workspace opener; other hosts use the client', async () => {
  for (const remoteName of ['wsl', 'ssh-remote', undefined]) {
    for (const useWindowsBrowser of [true, false]) {
      const opened: string[] = [];
      await openTerminalLink('https://example.com/?a=1&b=%22hello%22#part', {
        remoteName, useWindowsBrowser,
        openClient: async (url) => { opened.push(`client:${url}`); return true; },
        openWorkspace: async (url) => { opened.push(`workspace:${url}`); }
      });
      const expected = remoteName === 'wsl' && !useWindowsBrowser ? 'workspace' : 'client';
      assert.deepEqual(opened, [`${expected}:https://example.com/?a=1&b=%22hello%22#part`]);
    }
  }
});

test('terminal links reject command/file/javascript URLs and control characters', async () => {
  for (const value of ['command:workbench.action.quit', 'javascript:alert(1)', 'file:///etc/passwd',
    'https://example.com/\ncommand', 'not a URL']) {
    await assert.rejects(openTerminalLink(value, {
      remoteName: 'wsl', useWindowsBrowser: true,
      openClient: async () => { assert.fail('must not open'); },
      openWorkspace: async () => { assert.fail('must not open'); }
    }));
  }
});

test('failed browser open is reported rather than silently switching targets', async () => {
  await assert.rejects(openTerminalLink('http://localhost:3000/path', {
    remoteName: 'wsl', useWindowsBrowser: true,
    openClient: async () => false,
    openWorkspace: async () => { assert.fail('must not fall back'); }
  }), /could not open/u);
});
