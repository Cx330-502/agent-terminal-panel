async (page) => {
  const cases = [
    { width: 800, height: 620, position: 'left' },
    { width: 800, height: 620, position: 'right' },
    { width: 390, height: 844, position: 'left' },
    { width: 360, height: 800, position: 'right' }
  ];
  const results = [];
  const consoleErrors = [];
  const failedRequests = [];
  page.on('console', (message) => {
    if (message.type() === 'error') consoleErrors.push(message.text());
  });
  page.on('requestfailed', (request) => {
    failedRequests.push(`${request.method()} ${request.url()}: ${request.failure()?.errorText}`);
  });

  for (const item of cases) {
    await page.setViewportSize({ width: item.width, height: item.height });
    await page.goto('http://127.0.0.1:4173/test/browser-harness.html');
    await page.locator('.xterm').waitFor({ state: 'visible' });
    await page.evaluate((position) => {
      window.__webviewMessages.length = 0;
      window.__hostSend({ type: 'layoutSettings', settings: { sessionListPosition: position } });
      window.__hostSend({
        type: 'launchProfiles',
        profiles: [
          { id: 'profile-0', name: 'Claude', command: 'claude' },
          { id: 'profile-1', name: 'Codex Full Auto', command: 'codex --full-auto' }
        ]
      });
    }, item.position);

    const trigger = page.locator('#new-session-menu');
    const menu = page.locator('#launch-menu');
    await trigger.click();
    await menu.waitFor({ state: 'visible' });
    const triggerBox = await trigger.boundingBox();
    const menuBox = await menu.boundingBox();
    if (!triggerBox || !menuBox) throw new Error('Launch menu geometry is unavailable');
    const labels = await menu.locator('[role="menuitem"]').allTextContents();
    const geometry = {
      belowTrigger: menuBox.y >= triggerBox.y + triggerBox.height - 1 &&
        menuBox.y <= triggerBox.y + triggerBox.height + 8,
      withinViewport: menuBox.x >= 3 && menuBox.x + menuBox.width <= item.width - 3,
      opensTowardTerminal: item.position === 'left'
        ? menuBox.x <= triggerBox.x + 2
        : menuBox.x + menuBox.width >= triggerBox.x + triggerBox.width - 2
    };
    await page.screenshot({
      path: `test/v080-launch-menu-${item.position}-${item.width}x${item.height}.png`,
      fullPage: true
    });

    await menu.getByRole('menuitem', { name: /Claude/ }).click();
    const profileMessage = await page.evaluate(() =>
      window.__webviewMessages.find((message) => message.type === 'newProfileSession')
    );
    const closedAfterAction = await menu.isHidden();

    await trigger.focus();
    await page.keyboard.press('ArrowDown');
    const focusedFirstItem = await page.evaluate(
      () => document.activeElement?.getAttribute('role') === 'menuitem'
    );
    await page.keyboard.press('Escape');
    const escapedToTrigger = await page.evaluate(
      () => document.activeElement?.id === 'new-session-menu' &&
        document.querySelector('#launch-menu')?.hidden === true
    );

    await trigger.click();
    await page.evaluate(() => {
      window.__hostSend({
        type: 'launchProfiles',
        profiles: [{ id: 'profile-0', name: 'Gemini', command: 'gemini --model pro' }]
      });
      window.__hostSend({ type: 'workspaceRestore', restore: { count: 0, names: [] } });
    });
    const refreshedLabels = await menu.locator('[role="menuitem"]').allTextContents();
    await page.mouse.click(item.width / 2, item.height / 2);
    const closedOutside = await menu.isHidden();
    await page.evaluate(() => window.__hostSend({ type: 'openLaunchMenu' }));
    const openedFromHost = await menu.isVisible();
    await page.keyboard.press('Escape');
    const closedFromHost = await menu.isHidden();

    await page.evaluate(() => {
      window.__hostSend({ type: 'state', sessions: [], activeId: undefined });
    });
    const emptyTrigger = page.locator('#empty-new-session-menu');
    await emptyTrigger.click();
    const emptyTriggerBox = await emptyTrigger.boundingBox();
    const emptyMenuBox = await menu.boundingBox();
    if (!emptyTriggerBox || !emptyMenuBox) throw new Error('Empty-state menu geometry is unavailable');
    const emptyMenuAnchored =
      Math.abs(emptyMenuBox.y + emptyMenuBox.height - emptyTriggerBox.y) <= 8 ||
      Math.abs(emptyMenuBox.y - emptyTriggerBox.y - emptyTriggerBox.height) <= 8;
    const emptyMenuWithinViewport =
      emptyMenuBox.x >= 3 && emptyMenuBox.x + emptyMenuBox.width <= item.width - 3 &&
      emptyMenuBox.y >= 3 && emptyMenuBox.y + emptyMenuBox.height <= item.height - 3;
    await page.keyboard.press('Escape');

    const failures = [
      ...Object.entries(geometry).filter(([, value]) => !value).map(([key]) => key),
      ...(profileMessage?.id === 'profile-0' ? [] : ['profileMessage']),
      ...(closedAfterAction ? [] : ['closedAfterAction']),
      ...(focusedFirstItem ? [] : ['focusedFirstItem']),
      ...(escapedToTrigger ? [] : ['escapedToTrigger']),
      ...(refreshedLabels.some((label) => label.includes('Gemini')) ? [] : ['profileRefresh']),
      ...(refreshedLabels.some((label) => label.includes('恢复上次窗口')) ? ['restoreRefresh'] : []),
      ...(closedOutside ? [] : ['closedOutside']),
      ...(openedFromHost && closedFromHost ? [] : ['hostOpen']),
      ...(emptyMenuAnchored ? [] : ['emptyMenuAnchored']),
      ...(emptyMenuWithinViewport ? [] : ['emptyMenuWithinViewport'])
    ];
    if (failures.length > 0) {
      throw new Error(`Launch menu regression failed at ${item.position} ${item.width}x${item.height}: ${failures.join(', ')}`);
    }

    results.push({
      ...item,
      labels,
      geometry,
      profileMessage,
      closedAfterAction,
      focusedFirstItem,
      escapedToTrigger,
      refreshedLabels,
      closedOutside,
      openedFromHost,
      closedFromHost,
      emptyMenuAnchored,
      emptyMenuWithinViewport
    });
  }

  return { results, consoleErrors, failedRequests };
}
