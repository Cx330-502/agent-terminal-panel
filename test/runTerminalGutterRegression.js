async (page) => {
  const viewports = [
    [1920, 1080],
    [1680, 1050],
    [1536, 864],
    [1536, 780],
    [1440, 900],
    [1280, 720],
    [390, 844],
    [360, 800]
  ];
  const consoleErrors = [];
  const failedRequests = [];
  const results = [];
  page.on('console', (message) => {
    if (message.type() === 'error') consoleErrors.push(message.text());
  });
  page.on('pageerror', (error) => consoleErrors.push(error.message));
  page.on('requestfailed', (request) => {
    failedRequests.push(`${request.method()} ${request.url()}: ${request.failure()?.errorText}`);
  });
  await page.addInitScript(() => {
    const requestFrame = window.requestAnimationFrame.bind(window);
    window.__rafRequests = 0;
    window.requestAnimationFrame = (callback) => {
      window.__rafRequests++;
      return requestFrame(callback);
    };
  });

  const settings = {
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
    imagesEnabled: true
  };
  const state = {
    sessions: [{
      id: 'session-1',
      name: 'Agent · terminal gutter',
      cwd: '/workspace/中文项目',
      status: 'running',
      unread: false,
      isActive: true,
      canRestart: true
    }],
    activeId: 'session-1'
  };
  const sixel = '\x1bPq"1;1;6;6#1;2;100;0;0#1~~~~~~\x1b\\';
  const grayRows = '\x1b[999;1H\x1b[48;2;58;58;58m\x1b[2K\x1b[1A\x1b[2K\x1b[0m';

  const measure = () => page.evaluate(() => {
    const surface = document.querySelector('.terminal-surface.active');
    const xterm = surface.querySelector('.xterm');
    const viewport = surface.querySelector('.xterm-viewport');
    const screen = surface.querySelector('.xterm-screen');
    const scrollbar = surface.querySelector('.scrollbar.vertical');
    const screenRect = screen.getBoundingClientRect();
    const scrollbarRect = scrollbar.getBoundingClientRect();
    const resize = [...window.__webviewMessages]
      .reverse()
      .find((message) => message.type === 'resize');
    return {
      screenWidth: screenRect.width,
      screenRight: screenRect.right,
      scrollbarLeft: scrollbarRect.left,
      gutterWidth: scrollbarRect.left - screenRect.right,
      cellWidth: resize ? screenRect.width / resize.cols : undefined,
      surfaceBackground: getComputedStyle(surface).backgroundColor,
      xtermBackground: getComputedStyle(xterm).backgroundColor,
      viewportBackground: getComputedStyle(viewport).backgroundColor
    };
  });

  for (let index = 0; index < viewports.length; index++) {
    const [width, height] = viewports[index];
    const position = index % 2 === 0 ? 'left' : 'right';
    await page.setViewportSize({ width, height });
    await page.goto('http://127.0.0.1:4173/test/browser-harness.html');
    await page.locator('.xterm').waitFor({ state: 'visible' });
    await page.evaluate(({ position, settings, sixel, grayRows }) => {
      window.__hostSend({ type: 'layoutSettings', settings: { sessionListPosition: position } });
      window.__hostSend({ type: 'terminalSettings', settings });
      for (let frame = 0; frame < 6; frame++) {
        window.__hostSend({ type: 'output', id: 'session-1', data: `\x1b[H${sixel}` });
      }
      window.__hostSend({ type: 'output', id: 'session-1', data: grayRows });
    }, { position, settings, sixel, grayRows });
    await page.waitForTimeout(450);
    await page.screenshot({
      path: `test/gutter-${position}-${width}x${height}-baseline.png`,
      fullPage: true
    });
    const before = await measure();

    const duringResize = await page.evaluate(() => new Promise((resolve) => {
      const stack = document.querySelector('#terminal-stack');
      const observer = new ResizeObserver(() => {
        const surface = document.querySelector('.terminal-surface.active');
        const screen = surface.querySelector('.xterm-screen').getBoundingClientRect();
        const scrollbar = surface.querySelector('.scrollbar.vertical').getBoundingClientRect();
        const resize = [...window.__webviewMessages]
          .reverse()
          .find((message) => message.type === 'resize');
        observer.disconnect();
        resolve({
          screenWidth: screen.width,
          gutterWidth: scrollbar.left - screen.right,
          cellWidth: resize ? screen.width / resize.cols : undefined
        });
      });
      observer.observe(stack);
      document.querySelector('#app').style.setProperty('--session-list-width', '100px');
    }));

    const stateRefresh = await page.evaluate((nextState) => {
      const beforeFrames = window.__rafRequests;
      for (let update = 0; update < 12; update++) {
        window.__hostSend({ type: 'state', ...nextState });
      }
      return { requestedFrames: window.__rafRequests - beforeFrames };
    }, state);
    await page.evaluate(({ sixel, grayRows }) => {
      for (let frame = 0; frame < 6; frame++) {
        window.__hostSend({ type: 'output', id: 'session-1', data: `\x1b[H${sixel}` });
      }
      window.__hostSend({ type: 'output', id: 'session-1', data: grayRows });
    }, { sixel, grayRows });
    await page.waitForTimeout(450);
    const after = await measure();
    await page.screenshot({
      path: `test/gutter-${position}-${width}x${height}-post.png`,
      fullPage: true
    });
    await page.locator('.terminal-pane').screenshot({
      path: `test/gutter-${position}-${width}x${height}-terminal.png`
    });

    const failures = [];
    for (const [label, geometry] of [['before', before], ['resize observer', duringResize], ['after', after]]) {
      if (geometry.gutterWidth < -0.5) failures.push(`${label}: screen overlaps scrollbar`);
      if (!geometry.cellWidth || geometry.gutterWidth > geometry.cellWidth + 1) {
        failures.push(`${label}: gutter exceeds one fractional cell`);
      }
    }
    if (duringResize.screenWidth <= before.screenWidth + 20) {
      failures.push('ResizeObserver saw stale terminal geometry');
    }
    if (stateRefresh.requestedFrames !== 0) {
      failures.push(`same-session state refresh requested ${stateRefresh.requestedFrames} animation frames`);
    }
    if (
      before.viewportBackground !== before.surfaceBackground ||
      before.xtermBackground !== before.surfaceBackground ||
      after.viewportBackground !== after.surfaceBackground ||
      after.xtermBackground !== after.surfaceBackground
    ) {
      failures.push('xterm gutter background differs from the VS Code terminal background');
    }
    results.push({ width, height, position, before, duringResize, stateRefresh, after, failures });
  }

  const failures = results.flatMap((result) =>
    result.failures.map((failure) => `${result.width}x${result.height} ${result.position}: ${failure}`)
  );
  if (failures.length || consoleErrors.length || failedRequests.length) {
    throw new Error(JSON.stringify({ failures, consoleErrors, failedRequests }, null, 2));
  }
  return { results, consoleErrors, failedRequests };
}
