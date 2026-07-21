async (page) => {
  const consoleErrors = [];
  const failedRequests = [];
  page.on('console', (message) => {
    if (message.type() === 'error') consoleErrors.push(message.text());
  });
  page.on('pageerror', (error) => consoleErrors.push(error.message));
  page.on('requestfailed', (request) => {
    failedRequests.push(`${request.method()} ${request.url()}: ${request.failure()?.errorText}`);
  });

  await page.setViewportSize({ width: 1280, height: 720 });
  await page.goto('http://127.0.0.1:4173/test/browser-harness.html');
  await page.locator('.xterm').waitFor({ state: 'visible' });
  await page.waitForFunction(() => window.__webviewMessages.some((message) => message.type === 'resize'));
  const rows = await page.evaluate(() => [...window.__webviewMessages]
    .reverse()
    .find((message) => message.type === 'resize').rows);
  const markerCount = rows + 100;
  const lostMarker = 'REGION-102';
  const markers = Array.from(
    { length: markerCount },
    (_, index) => `REGION-${String(index + 1).padStart(3, '0')}\r\n`
  ).join('');

  await page.evaluate(({ markers }) => {
    window.__hostSend({
      type: 'output',
      id: 'session-1',
      data: `${markers}\x1b[1;5r\x1b[5S`
    });
  }, { markers });
  await page.waitForTimeout(30);
  await page.evaluate(() => {
    window.__hostSend({ type: 'output', id: 'session-1', data: '\x1b[r' });
  });
  await page.waitForTimeout(120);

  await page.getByRole('button', { name: '在当前终端中查找' }).click();
  const input = page.locator('#terminal-search-input');
  const result = page.locator('#terminal-search-result');
  await input.fill(lostMarker);
  await page.waitForFunction(() => document.querySelector('#terminal-search-result')?.textContent === '1/1');
  const searchResult = await result.textContent();
  await page.screenshot({ path: 'test/terminal-scrollback-compat.png', fullPage: true });

  const failures = [];
  if (searchResult !== '1/1') {
    failures.push(`Previously deleted marker is not searchable: ${searchResult}`);
  }
  if (failures.length || consoleErrors.length || failedRequests.length) {
    throw new Error(JSON.stringify({ failures, rows, lostMarker, searchResult, consoleErrors, failedRequests }, null, 2));
  }
  return { rows, lostMarker, searchResult, consoleErrors, failedRequests };
}
