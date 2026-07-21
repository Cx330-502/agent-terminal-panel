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
  await page.evaluate(() => {
    window.__hostSend({
      type: 'output',
      id: 'session-1',
      data: 'first needle\r\n第二个 needle\r\nthird needle\r\n没有匹配\r\n'
    });
  });
  await page.waitForTimeout(120);

  await page.getByRole('button', { name: '在当前终端中查找' }).click();
  const search = page.locator('#terminal-search');
  const input = page.locator('#terminal-search-input');
  const result = page.locator('#terminal-search-result');
  await input.fill('needle');
  await page.waitForFunction(() => /\/3$/u.test(document.querySelector('#terminal-search-result')?.textContent ?? ''));
  const firstResult = await result.textContent();

  await page.getByRole('button', { name: '下一个匹配项' }).click();
  await page.waitForFunction((previous) => {
    const current = document.querySelector('#terminal-search-result')?.textContent ?? '';
    return /\/3$/u.test(current) && current !== previous;
  }, firstResult);
  const nextResult = await result.textContent();

  await input.press('Shift+Enter');
  await page.waitForFunction((expected) => (
    document.querySelector('#terminal-search-result')?.textContent === expected
  ), firstResult);
  await input.press('Escape');
  const hiddenAfterEscape = await search.isHidden();

  await page.keyboard.press('Control+f');
  await input.waitFor({ state: 'visible' });
  const focusedAfterShortcut = await input.evaluate((element) => document.activeElement === element);

  await page.setViewportSize({ width: 360, height: 800 });
  await page.waitForTimeout(80);
  const narrowLayout = await page.evaluate(() => {
    const widget = document.querySelector('#terminal-search').getBoundingClientRect();
    const buttons = [...document.querySelectorAll('#terminal-search button')]
      .map((element) => element.getBoundingClientRect());
    return {
      documentOverflow: document.documentElement.scrollWidth > innerWidth,
      widgetInside: widget.left >= 0 && widget.right <= innerWidth,
      buttonsVisible: buttons.every((box) => box.width > 0 && box.right <= innerWidth)
    };
  });
  await page.screenshot({ path: 'test/terminal-search-narrow.png', fullPage: true });

  const failures = [];
  if (!hiddenAfterEscape) failures.push('Escape did not close terminal search');
  if (!focusedAfterShortcut) failures.push('Ctrl+F did not focus terminal search');
  if (!firstResult || !nextResult || firstResult === nextResult) {
    failures.push(`Search navigation did not move: ${firstResult} -> ${nextResult}`);
  }
  if (narrowLayout.documentOverflow || !narrowLayout.widgetInside || !narrowLayout.buttonsVisible) {
    failures.push(`Narrow search layout is invalid: ${JSON.stringify(narrowLayout)}`);
  }
  if (failures.length || consoleErrors.length || failedRequests.length) {
    throw new Error(JSON.stringify({ failures, consoleErrors, failedRequests }, null, 2));
  }
  return { firstResult, nextResult, narrowLayout, consoleErrors, failedRequests };
}
