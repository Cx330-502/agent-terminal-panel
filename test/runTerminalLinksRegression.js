async (page) => {
  await page.setViewportSize({ width: 1280, height: 720 });
  await page.goto('http://127.0.0.1:4173/test/browser-harness.html');
  await page.locator('.xterm').waitFor({ state: 'visible' });
  await page.evaluate(() => window.__hostSend({
    type: 'output', id: 'session-1',
    data: '\x1b[2J\x1b[Hhttps://example.com/?a=1&b=two\r\n' +
      '\x1b]8;;https://example.org/path#anchor\x1b\\open browser\x1b]8;;\x1b\\'
  }));
  await page.waitForTimeout(150);
  const screen = await page.locator('.terminal-surface.active .xterm-screen').boundingBox();
  const rows = await page.evaluate(() => [...window.__webviewMessages].reverse()
    .find((message) => message.type === 'resize').rows);
  if (!screen) throw new Error('Missing terminal grid');
  const height = screen.height / rows;
  for (const line of [0, 1]) {
    await page.mouse.move(screen.x + 40, screen.y + height * (line + 0.5));
    await page.waitForTimeout(250);
    await page.mouse.click(screen.x + 40, screen.y + height * (line + 0.5));
  }
  const links = await page.evaluate(() => window.__webviewMessages.filter((item) => item.type === 'openLink'));
  const expected = ['https://example.com/?a=1&b=two', 'https://example.org/path#anchor'];
  if (JSON.stringify(links.map((item) => item.url)) !== JSON.stringify(expected) ||
      links.some((item) => item.id !== 'session-1')) {
    throw new Error(`Link clicks were not routed to the host: ${JSON.stringify(links)}`);
  }
  return { plainUrl: links[0].url, osc8Url: links[1].url, routedThroughHost: true };
}
