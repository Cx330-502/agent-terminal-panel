async (page) => {
  await page.setViewportSize({ width: 620, height: 620 });
  await page.goto('http://127.0.0.1:4173/test/browser-harness.html');
  const screen = page.locator('.xterm-screen');
  await screen.waitFor({ state: 'visible' });
  await page.evaluate(() => {
    const data = Array.from(
      { length: 320 },
      (_, index) => `line-${String(index + 1).padStart(3, '0')} 中文滚动测试\r\n`
    ).join('');
    window.__hostSend({ type: 'output', id: 'session-1', data });
  });
  await page.waitForTimeout(250);
  const box = await screen.boundingBox();
  if (!box) throw new Error('Terminal screen is not visible');
  const slider = page.locator('.scrollbar.vertical .slider');
  const sliderTop = () => slider.evaluate((element) => Number.parseFloat(element.style.top));

  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  for (let index = 0; index < 34; index++) await page.mouse.wheel(0, -1200);
  await page.waitForTimeout(180);
  const beforeUp = await sliderTop();
  await page.mouse.move(box.x + 120, box.y + box.height * 0.55);
  await page.mouse.down();
  await page.mouse.move(box.x + 120, box.y + 2, { steps: 10 });
  await page.waitForTimeout(700);
  const afterUp = await sliderTop();
  const selectedAfterUp = await page.evaluate(() => window.getSelection()?.toString().length ?? 0);
  await page.mouse.up();

  await page.mouse.click(box.x + 160, box.y + box.height / 2);
  const beforeDown = await sliderTop();
  await page.mouse.move(box.x + 120, box.y + box.height * 0.45);
  await page.mouse.down();
  await page.mouse.move(box.x + 120, box.y + box.height - 2, { steps: 10 });
  await page.waitForTimeout(700);
  const afterDown = await sliderTop();
  const selectedAfterDown = await page.evaluate(() => window.getSelection()?.toString().length ?? 0);
  await page.mouse.up();

  await page.screenshot({ path: 'test/v060-selection-auto-scroll.png', fullPage: true });
  const result = {
    beforeUp,
    afterUp,
    beforeDown,
    afterDown,
    scrolledUp: afterUp < beforeUp,
    scrolledDown: afterDown > beforeDown,
    selectedAfterUp,
    selectedAfterDown
  };
  if (!result.scrolledUp || !result.scrolledDown || selectedAfterUp === 0 || selectedAfterDown === 0) {
    throw new Error(`Selection auto-scroll regression failed: ${JSON.stringify(result)}`);
  }
  return result;
}
