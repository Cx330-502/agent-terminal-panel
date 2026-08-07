async (page) => {
  const harnessUrl = 'http://127.0.0.1:4173/test/browser-harness.html';
  const consoleErrors = [];
  const failedRequests = [];
  page.on('console', (message) => {
    if (message.type() === 'error') consoleErrors.push(message.text());
  });
  page.on('pageerror', (error) => consoleErrors.push(error.message));
  page.on('requestfailed', (request) => {
    failedRequests.push(`${request.method()} ${request.url()}: ${request.failure()?.errorText}`);
  });

  await page.goto(harnessUrl);
  await page.locator('.terminal-surface.active .xterm').waitFor({ state: 'visible' });
  await page.waitForFunction(
    () => window.__webviewMessages.some((message) => message.type === 'heartbeat'),
    undefined,
    { timeout: 7_000 }
  );

  const before = await page.evaluate(() => ({
    sessionIds: [...document.querySelectorAll('.terminal-surface')]
      .map((element) => element.dataset.id),
    readyCount: window.__webviewMessages.filter((message) => message.type === 'ready').length,
    heartbeatCount: window.__webviewMessages
      .filter((message) => message.type === 'heartbeat').length
  }));

  const replayText = '\r\nWEBVIEW_REPLAY_SENTINEL\r\n';
  await page.evaluate((replay) => {
    sessionStorage.setItem(
      '__agentTerminalPanelReplays',
      JSON.stringify({ 'session-1': replay })
    );
  }, replayText);
  await page.reload();
  await page.locator('.terminal-surface.active .xterm').waitFor({ state: 'visible' });
  await page.waitForTimeout(100);
  await page.evaluate(async () => {
    const canvas = [...document.querySelectorAll('.terminal-surface.active .xterm-screen > canvas')]
      .find((candidate) => !candidate.className);
    const extension = canvas?.getContext('webgl2')?.getExtension('WEBGL_lose_context');
    if (!extension) throw new Error('WEBGL_lose_context is unavailable');
    extension.loseContext();
    await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
  });
  await page.waitForFunction(() =>
    document.querySelector('.terminal-surface.active .xterm-rows')?.textContent
      ?.includes('WEBVIEW_REPLAY_SENTINEL') === true
  );

  const after = await page.evaluate(() => ({
    sessionIds: [...document.querySelectorAll('.terminal-surface')]
      .map((element) => element.dataset.id),
    surfaceCount: document.querySelectorAll('.terminal-surface').length,
    activeName: document.querySelector('#active-name')?.textContent,
    replayVisible: document.querySelector('.terminal-surface.active .xterm-rows')?.textContent
      ?.includes('WEBVIEW_REPLAY_SENTINEL') === true,
    readyCount: window.__webviewMessages.filter((message) => message.type === 'ready').length
  }));

  const failures = [];
  if (before.heartbeatCount < 1) failures.push('Webview heartbeat was not emitted');
  if (before.readyCount !== 1 || after.readyCount !== 1) {
    failures.push(`Each Webview generation must emit one ready message: ${JSON.stringify({ before, after })}`);
  }
  if (JSON.stringify(before.sessionIds) !== JSON.stringify(after.sessionIds)) {
    failures.push(`Session identity changed across document reload: ${JSON.stringify({ before, after })}`);
  }
  if (after.surfaceCount !== 1 || !after.replayVisible || after.activeName !== 'Agent 1') {
    failures.push(`Reloaded Webview did not reconstruct the existing session: ${JSON.stringify(after)}`);
  }
  if (failures.length || consoleErrors.length || failedRequests.length) {
    throw new Error(JSON.stringify({ failures, before, after, consoleErrors, failedRequests }, null, 2));
  }
  return { before, after, consoleErrors, failedRequests };
}
