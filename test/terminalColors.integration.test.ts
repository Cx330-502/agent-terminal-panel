import assert from 'node:assert/strict';
import { resolve } from 'node:path';
import test from 'node:test';
import { SessionManager } from '../src/sessionManager';

test('PTY palette probe meets its 250 ms deadline without a responding Webview', { timeout: 10_000 }, async (t) => {
  if (process.platform === 'win32') return t.skip('ConPTY consumes OSC palette queries before forwarding output');
  for (const hasPalette of [false, true]) {
    let output = '';
    let finish!: () => void;
    const exited = new Promise<void>((resolve) => { finish = resolve; });
    const manager = new SessionManager(() => ({
      launchCommand: `"${process.execPath}" "${resolve('test/fixtures/colorProbe.cjs')}"`,
      shell: { path: '', args: [] }, environment: {}, terminalImagesEnabled: false, vscodeVersion: 'test'
    }), () => ({
      enabled: false, sampleIntervalMs: 2000, quietThresholdMs: 15000,
      stalledThresholdMs: 45000, processNetworkEnabled: false, codexSessionMetricsEnabled: false
    }), {
      onOutput: (_id, data) => { output += data; },
      onAttention: (event) => { if (event.detail?.startsWith('exit ')) finish(); },
      onClear() {}, onStateChanged() {}, onStartupTiming() {}
    });
    try {
      if (hasPalette) manager.setTerminalColors({ 10: '#cccccc', 11: '#1e1e1e', 12: '#ffffff' });
      const id = manager.create(process.cwd(), { cols: 80, rows: 24 });
      await exited;
      assert.match(output, hasPalette ? /PROBE_OK/u : /PROBE_TIMEOUT/u);
      assert.equal(manager.get(id)?.exitCode, hasPalette ? 0 : 2);
      if (hasPalette) {
        assert.doesNotMatch(manager.replays()[id]!, /\x1b\]1[01];\?/u);
        assert.match(output, /\x1b\[48;2;58;58;58m gray composer/u);
      }
    } finally {
      manager.dispose();
    }
  }
});
