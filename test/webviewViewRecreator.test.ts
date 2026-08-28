import assert from 'node:assert/strict';
import test from 'node:test';
import {
  recreateWebviewView,
  type WebviewCommandRunner
} from '../src/webviewViewRecreator';

test('recreates a Webview hosted in the Panel or Auxiliary Bar', async () => {
  const view = new FakeView('panel');
  const commands = createCommandRunner(view);

  assert.equal(await recreateWebviewView(view, commands.run, { visibilityTimeoutMs: 5 }), true);
  assert.equal(view.visible, true);
  assert.deepEqual(commands.calls, [
    ['agentTerminalPanel.terminalView.focus'],
    ['agentTerminalPanel.terminalView.open'],
    ['agentTerminalPanel.terminalView.open', { preserveFocus: true }]
  ]);
});

test('recreates a Webview hosted in the Primary Sidebar', async () => {
  const view = new FakeView('sidebar');
  const commands = createCommandRunner(view);

  assert.equal(await recreateWebviewView(view, commands.run, { visibilityTimeoutMs: 1 }), true);
  assert.equal(view.visible, true);
  assert.deepEqual(commands.calls, [
    ['agentTerminalPanel.terminalView.focus'],
    ['agentTerminalPanel.terminalView.open'],
    ['workbench.action.toggleSidebarVisibility'],
    ['agentTerminalPanel.terminalView.open', { preserveFocus: true }]
  ]);
});

test('does not reopen the view when VS Code cannot hide its container', async () => {
  const view = new FakeView('stuck');
  const commands = createCommandRunner(view);

  assert.equal(await recreateWebviewView(view, commands.run, { visibilityTimeoutMs: 1 }), false);
  assert.deepEqual(commands.calls, [
    ['agentTerminalPanel.terminalView.focus'],
    ['agentTerminalPanel.terminalView.open'],
    ['workbench.action.toggleSidebarVisibility']
  ]);
});

type ViewLocation = 'panel' | 'sidebar' | 'stuck';

class FakeView {
  readonly viewType = 'agentTerminalPanel.terminalView';
  visible = true;
  focused = false;
  private readonly listeners = new Set<() => void>();

  constructor(readonly location: ViewLocation) {}

  readonly onDidChangeVisibility = (listener: () => void): { dispose(): void } => {
    this.listeners.add(listener);
    return { dispose: () => this.listeners.delete(listener) };
  };

  setVisible(visible: boolean): void {
    if (this.visible === visible) return;
    this.visible = visible;
    for (const listener of this.listeners) listener();
  }
}

function createCommandRunner(view: FakeView): {
  calls: unknown[][];
  run: WebviewCommandRunner;
} {
  const calls: unknown[][] = [];
  return {
    calls,
    async run(command, ...args) {
      calls.push([command, ...args]);
      if (command.endsWith('.focus')) {
        view.focused = true;
        view.setVisible(true);
      } else if (command.endsWith('.open')) {
        const preserveFocus = (args[0] as { preserveFocus?: boolean } | undefined)?.preserveFocus;
        if (view.focused && !preserveFocus) {
          view.focused = false;
          if (view.location === 'panel') view.setVisible(false);
        } else {
          view.setVisible(true);
        }
      } else if (
        command === 'workbench.action.toggleSidebarVisibility' &&
        view.location === 'sidebar'
      ) {
        view.setVisible(false);
      }
    }
  };
}
