async (page) => {
  await page.setViewportSize({ width: 900, height: 700 });
  await page.goto('http://127.0.0.1:4173/test/browser-harness.html?locale=zh-CN');
  await page.locator('.xterm').waitFor({ state: 'visible' });
  await page.waitForFunction(() => document.querySelectorAll('.session-row').length > 0);

  const probe = () => page.evaluate(() => {
    const sidebar = document.querySelector('#session-sidebar');
    const splitter = document.querySelector('#session-splitter');
    const pane = document.querySelector('.terminal-pane');
    return {
      collapsed: document.querySelector('#app')?.classList.contains('session-sidebar-collapsed'),
      sidebarWidth: sidebar?.getBoundingClientRect().width,
      splitterWidth: splitter?.getBoundingClientRect().width,
      paneWidth: pane?.getBoundingClientRect().width,
      expandHidden: document.querySelector('#show-session-sidebar')?.hidden,
      activeElement: document.activeElement?.id,
      persisted: window.__persistedState?.sessionSidebarCollapsed,
      posted: window.__webviewMessages
        .filter((message) => message.type === 'setSessionSidebarCollapsed')
        .map((message) => message.collapsed)
    };
  });

  const initial = await probe();
  await page.locator('#collapse-session-sidebar').click();
  const collapsed = await probe();
  await page.locator('#show-session-sidebar').click();
  const expanded = await probe();
  await page.screenshot({
    path: 'test/sidebar-collapse-expanded.png',
    fullPage: true
  });

  const failures = [];
  if (initial.collapsed || initial.expandHidden !== true || initial.sidebarWidth === 0) {
    failures.push(`initial=${JSON.stringify(initial)}`);
  }
  if (
    !collapsed.collapsed ||
    collapsed.sidebarWidth !== 0 ||
    collapsed.splitterWidth !== 0 ||
    collapsed.expandHidden !== false ||
    collapsed.paneWidth < 899 ||
    collapsed.activeElement !== 'show-session-sidebar' ||
    collapsed.persisted !== true ||
    !collapsed.posted.includes(true)
  ) {
    failures.push(`collapsed=${JSON.stringify(collapsed)}`);
  }
  if (
    expanded.collapsed ||
    expanded.sidebarWidth === 0 ||
    expanded.expandHidden !== true ||
    expanded.activeElement !== 'collapse-session-sidebar' ||
    expanded.persisted !== false ||
    !expanded.posted.includes(false)
  ) {
    failures.push(`expanded=${JSON.stringify(expanded)}`);
  }
  if (failures.length > 0) {
    throw new Error(`sidebar collapse regression: ${failures.join(', ')}`);
  }
  return { initial, collapsed, expanded };
}
