async (page) => {
  const cases = [
    {
      locale: 'zh-CN',
      heading: '会话',
      find: '在当前终端中查找',
      running: '运行中',
      launchGroup: '启动命令',
      noResults: '无结果',
      restorePrefix: '上次窗口保留了 2 个会话'
    },
    {
      locale: 'en-US',
      heading: 'Sessions',
      find: 'Find in current terminal',
      running: 'Running',
      launchGroup: 'Launch commands',
      noResults: 'No results',
      restorePrefix: 'The previous window kept 2 sessions'
    }
  ];
  const results = [];
  for (const item of cases) {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(`http://127.0.0.1:4173/test/browser-harness.html?locale=${item.locale}`);
    await page.locator('.xterm').waitFor({ state: 'visible' });
    await page.evaluate(() => {
      window.__hostSend({
        type: 'state',
        sessions: [{
          id: 'session-1',
          name: 'Agent i18n',
          cwd: '/workspace/i18n',
          status: 'running',
          unread: false,
          isActive: true,
          canRestart: true,
          launchSource: 'default'
        }],
        activeId: 'session-1'
      });
    });
    await page.locator('#new-session-menu').click();
    const launchText = await page.locator('#launch-menu').innerText();
    await page.keyboard.press('Escape');
    await page.locator('#find-terminal').click();
    await page.locator('#terminal-search-input').fill('missing-i18n-result');
    await page.waitForFunction((expected) => (
      document.querySelector('#terminal-search-result')?.textContent === expected
    ), item.noResults);
    const probe = await page.evaluate(() => {
      const controls = [...document.querySelectorAll('button, [role="button"], [role="tab"]')]
        .filter((element) => {
          const box = element.getBoundingClientRect();
          return box.width > 0 && box.height > 0;
        });
      return {
        lang: document.documentElement.lang,
        heading: document.querySelector('#session-heading')?.textContent,
        find: document.querySelector('#find-terminal')?.getAttribute('aria-label'),
        running: document.querySelector('#active-status')?.getAttribute('title'),
        restoreTitle: document.querySelector('#workspace-restore-title')?.textContent,
        searchResult: document.querySelector('#terminal-search-result')?.textContent,
        documentOverflow: document.documentElement.scrollWidth > innerWidth,
        clipped: controls
          .filter((element) => (
            element.scrollWidth > element.clientWidth + 1 ||
            element.scrollHeight > element.clientHeight + 1
          ))
          .map((element) => element.getAttribute('aria-label') || element.textContent?.trim())
      };
    });
    const ariaSnapshot = await page.locator('body').ariaSnapshot();
    await page.screenshot({
      path: `test/i18n-${item.locale.toLowerCase()}.png`,
      fullPage: true
    });
    const failures = [];
    if (!probe.lang.toLowerCase().startsWith(item.locale.toLowerCase().split('-')[0])) {
      failures.push(`lang=${probe.lang}`);
    }
    if (probe.heading !== item.heading) failures.push(`heading=${probe.heading}`);
    if (probe.find !== item.find) failures.push(`find=${probe.find}`);
    if (probe.running !== item.running) failures.push(`running=${probe.running}`);
    if (!launchText.toLocaleLowerCase(item.locale).includes(item.launchGroup.toLocaleLowerCase(item.locale))) {
      failures.push(`launch=${launchText}`);
    }
    if (probe.searchResult !== item.noResults) failures.push(`search=${probe.searchResult}`);
    if (!probe.restoreTitle?.startsWith(item.restorePrefix)) {
      failures.push(`restore=${probe.restoreTitle}`);
    }
    if (probe.documentOverflow || probe.clipped.length > 0 || ariaSnapshot.length === 0) {
      failures.push(`layout=${JSON.stringify(probe)}`);
    }
    if (failures.length > 0) {
      throw new Error(`${item.locale} localization regression: ${failures.join(', ')}`);
    }
    results.push({ locale: item.locale, launchText, ariaLength: ariaSnapshot.length, ...probe });
  }
  return results;
}
