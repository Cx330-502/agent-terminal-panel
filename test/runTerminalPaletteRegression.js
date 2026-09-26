async (page) => {
  await page.addInitScript(() => {
    window.addEventListener('message', ({ data }) => {
      if (data.type === 'initialize') window.__paletteSettings = data.terminalSettings;
    });
  });
  await page.setViewportSize({ width: 1280, height: 720 });
  await page.goto('http://127.0.0.1:4173/test/browser-harness.html');
  await page.locator('.xterm').waitFor({ state: 'visible' });
  const ready = await page.evaluate(() => window.__webviewMessages.find((item) => item.type === 'ready'));
  if (ready.colors?.[11] !== '#1e1e1e' || ready.colors?.[10] !== '#cccccc') {
    throw new Error('Initial host handshake did not include the actual VS Code palette');
  }
  const query = async (data, expected) => {
    await page.evaluate((data) => {
      window.__webviewMessages.length = 0;
      window.__hostSend({ type: 'output', id: 'session-1', data });
    }, data);
    await page.waitForFunction((expected) => window.__webviewMessages.some(
      (item) => item.type === 'input' && item.data.includes(expected)
    ), expected);
  };
  await query('\x1b]11;#3a3a3a\x07\x1b]11;?\x07', ']11;rgb:3a3a/3a3a/3a3a');
  await page.evaluate(() => window.__hostSend({
    type: 'terminalSettings', settings: { ...window.__paletteSettings, fontSize: 15 }
  }));
  await query('\x1b]11;?\x07', ']11;rgb:3a3a/3a3a/3a3a');

  // Host notification and VS Code CSS injection are separate asynchronous paths.
  await page.evaluate(() => window.__hostSend({ type: 'refreshTheme' }));
  await page.waitForTimeout(80);
  await page.evaluate(() => document.documentElement.style.setProperty('--vscode-terminal-background', '#242424'));
  await page.waitForFunction(() => window.__webviewMessages.some(
    (item) => item.type === 'terminalColors' && item.colors[11] === '#242424'
  ));
  await query('\x1b]11;?\x07', ']11;rgb:2424/2424/2424');
  await page.evaluate(() => window.__hostSend({
    type: 'output', id: 'session-1',
    data: '\x1b[2J\x1b[H\x1b[48;2;58;58;58m\x1b[2K› 灰色输入区 / composer\x1b[0m'
  }));
  await page.waitForTimeout(100);
  await page.screenshot({ path: 'test/terminal-palette.png', fullPage: true });

  await page.evaluate(() => sessionStorage.setItem('__agentTerminalPanelReplays', JSON.stringify({
    'session-1': '\x1b]10;?\x07\x1b]11;?\x07\x1b[48;2;58;58;58m replay composer \x1b[0m'
  })));
  await page.reload();
  await page.locator('.xterm').waitFor({ state: 'visible' });
  await page.waitForTimeout(150);
  const replayReplies = await page.evaluate(() => window.__webviewMessages.filter(
    (item) => item.type === 'input' && /\x1b\]1[012];rgb:/u.test(item.data)
  ));
  if (replayReplies.length) throw new Error('Historical palette probes leaked replies into the running Agent');
  return { readyColors: ready.colors, unchangedSettingsPreservedOscColor: true, delayedThemeApplied: true, replayReplies: 0 };
}
