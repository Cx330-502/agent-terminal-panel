async (page) => {
  const viewports = [
    [1920, 1080],
    [1680, 1050],
    [1536, 864],
    [1536, 780],
    [1440, 900],
    [1280, 720],
    [390, 844],
    [360, 800],
    [320, 720]
  ];
  const consoleErrors = [];
  const failedRequests = [];
  page.on('console', (message) => {
    if (message.type() === 'error') consoleErrors.push(message.text());
  });
  page.on('requestfailed', (request) => {
    failedRequests.push(`${request.method()} ${request.url()}: ${request.failure()?.errorText}`);
  });
  const results = [];

  for (let index = 0; index < viewports.length; index++) {
    const [width, height] = viewports[index];
    const position = index % 2 === 0 ? 'left' : 'right';
    await page.setViewportSize({ width, height });
    await page.goto('http://127.0.0.1:4173/test/browser-harness.html');
    await page.locator('.xterm').waitFor({ state: 'visible' });
    await page.evaluate((side) => {
      window.__webviewMessages.length = 0;
      window.__hostSend({ type: 'layoutSettings', settings: { sessionListPosition: side } });
    }, position);
    await page.screenshot({
      path: `test/v030-${position}-${width}x${height}-baseline.png`,
      fullPage: true
    });
    const ariaSnapshot = await page.locator('body').ariaSnapshot();

    await page.evaluate(() => {
      window.__hostSend({
        type: 'state',
        sessions: [{
          id: 'session-1',
          name: 'Agent 1',
          cwd: '/workspace/中文项目',
          status: 'running',
          unread: false,
          isActive: true,
          canRestart: true,
          spawnDurationMs: 6,
          startupElapsedMs: 5200
        }],
        activeId: 'session-1'
      });
    });
    await page.screenshot({
      path: `test/v050-${position}-${width}x${height}-startup.png`,
      fullPage: true
    });
    const startupProbe = await page.evaluate(() => ({
      visible: !document.querySelector('#startup-overlay').hidden,
      title: document.querySelector('#startup-title').textContent,
      detail: document.querySelector('#startup-detail').textContent
    }));

    const historyButton = page.locator('#session-history');
    if (await historyButton.isVisible()) await historyButton.click();
    await page.evaluate(() => {
      window.__hostSend({
        type: 'state',
        sessions: [{
          id: 'session-1',
          name: 'Fork: Agent 历史会话',
          cwd: '/workspace/中文项目',
          status: 'completed',
          unread: true,
          isActive: true,
          canRestart: false,
          exitCode: 0
        }],
        activeId: 'session-1'
      });
    });
    await page.locator('#restart-session').hover();
    await page.locator('.session-row').focus();
    await page.screenshot({
      path: `test/v030-${position}-${width}x${height}-post.png`,
      fullPage: true
    });
    await page.locator('.session-header').screenshot({
      path: `test/v030-${position}-${width}x${height}-controls.png`
    });

    const probe = await page.evaluate(() => {
      const controls = [...document.querySelectorAll('button, [role="button"], [role="tab"]')]
        .filter((element) => {
          const rect = element.getBoundingClientRect();
          return rect.width > 0 && rect.height > 0;
        });
      const clipped = controls.flatMap((element) => {
        const html = element;
        const text = element.textContent?.trim() || element.getAttribute('aria-label') || '';
        return html.scrollWidth > html.clientWidth + 1 || html.scrollHeight > html.clientHeight + 1
          ? [text]
          : [];
      });
      const occluded = controls.flatMap((element) => {
        const rect = element.getBoundingClientRect();
        const target = document.elementFromPoint(rect.left + rect.width / 2, rect.top + rect.height / 2);
        const covered = target && target !== element && !element.contains(target) && !target.contains(element);
        return covered ? [element.getAttribute('aria-label') || element.textContent?.trim() || element.tagName] : [];
      });
      return {
        documentOverflow: document.documentElement.scrollWidth > innerWidth,
        clipped,
        occluded,
        restartDisabled: document.querySelector('#restart-session')?.disabled === true,
        rightLayout: document.querySelector('#app')?.classList.contains('session-list-right') === true,
        historyPosted: window.__webviewMessages.some((message) => message.type === 'openSessionHistory'),
        startupHiddenAfterOutput: document.querySelector('#startup-overlay')?.hidden === true,
        iconButtonCount: document.querySelectorAll('.icon-button').length,
        missingButtonIcons: [...document.querySelectorAll('.icon-button')]
          .filter((element) => element.querySelectorAll('.ui-icon').length !== 1)
          .map((element) => element.getAttribute('aria-label'))
      };
    });
    results.push({ width, height, position, ariaLength: ariaSnapshot.length, startupProbe, ...probe });
  }

  return { results, consoleErrors, failedRequests };
}
