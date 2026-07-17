async (page) => {
  const cases = [
    {
      width: 1120,
      height: 700,
      sidebarWidth: 196,
      output: 'media/screenshots/panel.png'
    },
    {
      width: 390,
      height: 760,
      sidebarWidth: 116,
      output: 'media/screenshots/sidebar.png'
    }
  ];
  const captured = [];

  for (const item of cases) {
    await page.setViewportSize({ width: item.width, height: item.height });
    await page.goto('http://127.0.0.1:4173/test/browser-harness.html');
    await page.locator('.xterm').waitFor({ state: 'visible' });
    await page.evaluate(({ sidebarWidth, compact }) => {
      document.querySelector('#app')?.style.setProperty('--session-list-width', `${sidebarWidth}px`);
      const sessions = [
        {
          id: 'session-1',
          name: 'Codex · Feature',
          cwd: '/workspace/agent-terminal-panel',
          status: 'running',
          unread: false,
          isActive: true,
          canRestart: true,
          communication: {
            health: 'active',
            healthBasis: 'network',
            silentForMs: 420,
            sampledAt: Date.now(),
            pty: {
              receivedBytes: 24_000,
              sentBytes: 520,
              receiveRate: 840,
              sendRate: 48
            },
            network: {
              source: 'linux-ss',
              available: true,
              hasByteCounters: true,
              connectionCount: 1,
              loopback: true,
              receivedBytes: 18_000,
              sentBytes: 2_800,
              receiveRate: 760,
              sendRate: 42,
              proxy: {
                processName: 'cc-switch',
                connectionCount: 2,
                shared: true,
                receivedBytes: 20_000,
                sentBytes: 3_200,
                receiveRate: 1_240,
                sendRate: 96
              }
            },
            provider: {
              provider: 'codex',
              source: 'codex-jsonl',
              turnActive: true,
              phase: 'waiting',
              waitingForFirstEventMs: 3200,
              totalTokens: 18_400,
              contextWindow: 200_000
            }
          }
        },
        {
          id: 'session-2',
          name: 'Claude · Review',
          cwd: '/workspace/agent-terminal-panel',
          status: 'waiting',
          unread: true,
          isActive: false,
          canRestart: true
        },
        {
          id: 'session-3',
          name: 'Agent · Tests',
          cwd: '/workspace/agent-terminal-panel',
          status: 'completed',
          unread: false,
          isActive: false,
          canRestart: true,
          exitCode: 0
        }
      ];
      window.__hostSend({ type: 'layoutSettings', settings: { sessionListPosition: 'left' } });
      window.__hostSend({ type: 'state', sessions, activeId: 'session-1' });
      window.__hostSend({
        type: 'output',
        id: 'session-1',
        data: (compact ? [
          '\u001b[2J\u001b[H',
          '\u001b[38;2;129;140;248m╭──── Agent Terminal ────╮\u001b[0m\r\n',
          '  /workspace/project\r\n',
          '\u001b[38;2;129;140;248m╰────────────────────────╯\u001b[0m\r\n',
          '\r\n',
          '\u001b[1m› Ship across every host\u001b[0m\r\n',
          '\r\n',
          '\u001b[38;2;103;232;249m•\u001b[0m Regression passed\r\n',
          '\u001b[38;2;103;232;249m•\u001b[0m Six targets packaged\r\n',
          '\r\n',
          '\u001b[38;2;192;132;252m✦\u001b[0m Working…\r\n',
          '\r\n',
          '\u001b[48;2;47;47;55m  Describe the change  \u001b[0m'
        ] : [
          '\u001b[2J\u001b[H',
          '\u001b[38;2;129;140;248m╭──────────── Agent Terminal Panel ────────────╮\u001b[0m\r\n',
          '  workspace  /workspace/agent-terminal-panel\r\n',
          '\u001b[38;2;129;140;248m╰──────────────────────────────────────────────╯\u001b[0m\r\n',
          '\r\n',
          '\u001b[1m› Build a provider-agnostic terminal workspace\u001b[0m\r\n',
          '\r\n',
          '\u001b[38;2;103;232;249m•\u001b[0m Reading the current workspace\r\n',
          '\u001b[38;2;103;232;249m•\u001b[0m Regression suite passed\r\n',
          '\u001b[38;2;103;232;249m•\u001b[0m Packaging six native targets\r\n',
          '\r\n',
          '\u001b[38;2;192;132;252m✦\u001b[0m Working across the workspace host…\r\n',
          '\r\n',
          '\u001b[48;2;47;47;55m  Describe the next change                                  \u001b[0m'
        ]).join('')
      });
    }, { sidebarWidth: item.sidebarWidth, compact: item.width < 500 });
    await page.waitForTimeout(160);
    await page.screenshot({ path: item.output, fullPage: true });
    captured.push(item);
  }

  return captured;
}
