import assert from 'node:assert/strict';
import test from 'node:test';
import type { VSCodeApi, WebviewMessage } from '../src/shared';
import {
  readWebviewState,
  updateWebviewState,
  WEBVIEW_STATE_VERSION
} from '../media/webviewState';

test('webview state migrates the legacy unversioned sidebar width', () => {
  assert.deepEqual(readWebviewState({ sidebarWidth: 188 }), {
    version: WEBVIEW_STATE_VERSION,
    sidebarWidth: 188
  });
});

test('webview state rejects unknown future versions', () => {
  assert.deepEqual(readWebviewState({ version: 99, sidebarWidth: 240 }), {
    version: WEBVIEW_STATE_VERSION
  });
});

test('webview state updates preserve known fields and write the current version', () => {
  const vscode = new FakeVSCodeApi({ sidebarWidth: 144 });
  updateWebviewState(vscode, { sidebarWidth: 216 });
  assert.deepEqual(vscode.getState(), {
    version: WEBVIEW_STATE_VERSION,
    sidebarWidth: 216
  });
});

class FakeVSCodeApi implements VSCodeApi {
  constructor(private state: unknown) {}

  postMessage(_message: WebviewMessage): void {}

  getState(): unknown {
    return this.state;
  }

  setState(state: unknown): void {
    this.state = state;
  }
}
