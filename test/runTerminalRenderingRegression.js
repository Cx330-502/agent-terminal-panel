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

  const settings = (imagesEnabled) => ({
    fontFamily: 'DejaVu Sans Mono',
    fontSize: 14,
    fontWeight: 'normal',
    fontWeightBold: 'bold',
    lineHeight: 1,
    letterSpacing: 0,
    cursorStyle: 'block',
    cursorBlinking: false,
    cursorWidth: 1,
    scrollback: 1000,
    macOptionIsMeta: false,
    macOptionClickForcesSelection: false,
    altClickMovesCursor: true,
    fastScrollSensitivity: 5,
    mouseWheelScrollSensitivity: 1,
    wordSeparators: ' ()[]{}',
    minimumContrastRatio: 4.5,
    drawBoldTextInBrightColors: true,
    customGlyphs: true,
    rightClickBehavior: 'copyPaste',
    imagesEnabled
  });

  const openHarness = async (imagesEnabled) => {
    await page.setViewportSize({ width: 1280, height: 720 });
    await page.goto(harnessUrl);
    await page.locator('.xterm').waitFor({ state: 'visible' });
    await page.waitForTimeout(100);
    const initialResizes = await page.evaluate(() =>
      window.__webviewMessages.filter((message) => message.type === 'resize')
    );
    await page.evaluate((terminalSettings) => {
      window.__hostSend({ type: 'terminalSettings', settings: terminalSettings });
    }, settings(imagesEnabled));
    await page.waitForTimeout(250);
    return initialResizes;
  };

  const terminalSize = () => page.evaluate(() => {
    const resize = [...window.__webviewMessages]
      .reverse()
      .find((message) => message.type === 'resize');
    if (!resize) throw new Error('Terminal resize message was not emitted');
    return { cols: resize.cols, rows: resize.rows };
  });

  const plainInitialResizes = await openHarness(false);
  const plainSize = await terminalSize();
  const grayRow = Math.max(1, plainSize.rows - 2);
  const grayRows = [grayRow, grayRow + 1]
    .map((row) => `\x1b[${row};1H\x1b[48;2;58;58;58m\x1b[2K`)
    .join('') + '\x1b[0m';
  await page.evaluate((data) => {
    window.__hostSend({ type: 'output', id: 'session-1', data });
  }, grayRows);
  await page.waitForTimeout(150);

  const contextLoss = await page.evaluate(async ({ row }) => {
    const screen = document.querySelector('.terminal-surface.active .xterm-screen');
    const rendererCanvas = [...screen.querySelectorAll('canvas')]
      .find((canvas) => !canvas.className);
    const gl = rendererCanvas?.getContext('webgl2');
    const extension = gl?.getExtension('WEBGL_lose_context');
    if (!extension) return { supported: false };

    const startedAt = performance.now();
    extension.loseContext();
    await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));

    const activeScreen = document.querySelector('.terminal-surface.active .xterm-screen');
    const renderedLine = activeScreen.querySelector('.xterm-rows')?.children.item(row - 1);
    const backgrounds = renderedLine
      ? Array.from(renderedLine.querySelectorAll('span')).map((element) => ({
          tag: element.tagName,
          className: element.className,
          background: getComputedStyle(element).backgroundColor
        }))
      : [];
    const currentRenderer = [...activeScreen.querySelectorAll('canvas')]
      .find((canvas) => !canvas.className);
    return {
      supported: true,
      elapsedMs: performance.now() - startedAt,
      webglRenderer: Boolean(currentRenderer?.getContext('webgl2')),
      domRenderer: Boolean(activeScreen.querySelector('.xterm-rows')),
      visibleBackground: backgrounds.find(
        ({ background }) => background !== 'rgba(0, 0, 0, 0)' && background !== 'transparent'
      )?.background,
      backgrounds
    };
  }, { row: grayRow });
  await page.screenshot({
    path: 'test/terminal-context-loss-immediate.png',
    fullPage: true
  });

  const petsInitialResizes = await openHarness(true);
  const petsSize = await terminalSize();
  const petTop = Math.max(1, petsSize.rows - 7);
  const petColumn = Math.max(1, petsSize.cols - 9);
  const grayFrame = '\x1b[?2026h' + Array.from({ length: 7 }, (_, index) =>
    `\x1b[${petTop + index};1H\x1b[48;2;58;58;58m\x1b[2K`
  ).join('') + '\x1b[0m\x1b[?2026l';
  const sixelBands = ['#1!48~', ...Array.from({ length: 7 }, () => '-!48~')].join('');
  const petFrame =
    `\x1b7\x1b[${petTop};${petColumn}H` +
    `\x1bPq"1;1;48;48#1;2;100;20;80${sixelBands}\x1b\\\x1b8`;
  await page.evaluate(({ grayFrame, petFrame }) => {
    window.__hostSend({ type: 'output', id: 'session-1', data: grayFrame + petFrame });
  }, { grayFrame, petFrame });
  await page.locator('canvas.xterm-image-layer').waitFor({ state: 'attached', timeout: 5000 });
  await page.waitForTimeout(150);

  const petsRefresh = await page.evaluate(async ({ grayFrame, petFrame }) => {
    const samples = [];
    const sample = () => {
      const canvas = document.querySelector('canvas.xterm-image-layer');
      if (!canvas) {
        samples.push(-1);
        return;
      }
      const pixels = canvas
        .getContext('2d')
        .getImageData(0, 0, canvas.width, canvas.height).data;
      let alphaPixels = 0;
      for (let index = 3; index < pixels.length; index += 4) {
        if (pixels[index]) alphaPixels++;
      }
      samples.push(alphaPixels);
    };
    const sampler = window.setInterval(sample, 1);
    for (let iteration = 0; iteration < 70; iteration++) {
      window.__hostSend({ type: 'output', id: 'session-1', data: grayFrame });
      await new Promise((resolve) => window.setTimeout(resolve, 4));
      window.__hostSend({ type: 'output', id: 'session-1', data: petFrame });
      await new Promise((resolve) => window.setTimeout(resolve, 8));
    }
    await new Promise((resolve) => window.setTimeout(resolve, 50));
    window.clearInterval(sampler);
    sample();
    return {
      sampleCount: samples.length,
      blankSamples: samples.filter((value) => value === 0).length,
      missingCanvasSamples: samples.filter((value) => value < 0).length,
      finalAlphaPixels: samples.at(-1),
      minimumAlphaPixels: Math.min(...samples.filter((value) => value >= 0))
    };
  }, { grayFrame, petFrame });
  await page.screenshot({
    path: 'test/terminal-pets-atomic-refresh.png',
    fullPage: true
  });

  const failures = [];
  for (const [mode, resizes] of [
    ['plain', plainInitialResizes],
    ['pets', petsInitialResizes]
  ]) {
    const sizes = new Set(resizes.map(({ cols, rows }) => `${cols}x${rows}`));
    if (sizes.size !== 1) {
      failures.push(`Initial ${mode} session used transient terminal sizes: ${JSON.stringify(resizes)}`);
    }
  }
  if (!contextLoss.supported) {
    failures.push('WEBGL_lose_context is unavailable');
  } else {
    if (contextLoss.webglRenderer) failures.push('WebGL renderer survived the immediate fallback window');
    if (!contextLoss.domRenderer) failures.push('DOM renderer was not active after context loss');
    if (contextLoss.visibleBackground !== 'rgb(58, 58, 58)') {
      failures.push(`Gray terminal cells were not visible after context loss: ${JSON.stringify(contextLoss.backgrounds)}`);
    }
  }
  if (petsRefresh.blankSamples !== 0 || petsRefresh.missingCanvasSamples !== 0) {
    failures.push(`Pets image layer exposed intermediate frames: ${JSON.stringify(petsRefresh)}`);
  }
  if (!petsRefresh.finalAlphaPixels || petsRefresh.finalAlphaPixels <= 0) {
    failures.push(`Pets image did not survive the refresh loop: ${JSON.stringify(petsRefresh)}`);
  }
  if (failures.length || consoleErrors.length || failedRequests.length) {
    throw new Error(JSON.stringify({ failures, contextLoss, petsRefresh, consoleErrors, failedRequests }, null, 2));
  }
  return {
    plainInitialResizes,
    petsInitialResizes,
    contextLoss,
    petsRefresh,
    consoleErrors,
    failedRequests
  };
}
