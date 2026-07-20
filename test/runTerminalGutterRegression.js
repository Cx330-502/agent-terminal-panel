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
  const cases = viewports.map(([width, height], index) => ({
    width,
    height,
    imagesEnabled: index % 2 === 1,
    position: index % 4 < 2 ? 'left' : 'right'
  }));
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
    imagesEnabled: false
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
    const rendererCanvas = [...screen.querySelectorAll('canvas')]
      .find((canvas) => !canvas.className);
    const screenRect = screen.getBoundingClientRect();
    const scrollbarRect = scrollbar.getBoundingClientRect();
    const resize = [...window.__webviewMessages]
      .reverse()
      .find((message) => message.type === 'resize');
    return {
      screenWidth: screenRect.width,
      screenRight: screenRect.right,
      scrollbarLeft: scrollbarRect.left,
      scrollbarWidth: scrollbarRect.width,
      gutterWidth: scrollbarRect.left - screenRect.right,
      cellWidth: resize ? screenRect.width / resize.cols : undefined,
      webglRenderer: Boolean(rendererCanvas?.getContext('webgl2')),
      imageCanvas: Boolean(screen.querySelector('canvas.xterm-image-layer')),
      surfaceBackground: getComputedStyle(surface).backgroundColor,
      xtermBackground: getComputedStyle(xterm).backgroundColor,
      screenBackground: getComputedStyle(screen).backgroundColor,
      viewportBackground: getComputedStyle(viewport).backgroundColor
    };
  });

  for (const { width, height, imagesEnabled, position } of cases) {
    const mode = imagesEnabled ? 'pets' : 'plain';
    const caseSettings = { ...settings, imagesEnabled };
    await page.setViewportSize({ width, height });
    await page.goto('http://127.0.0.1:4173/test/browser-harness.html');
    await page.locator('.xterm').waitFor({ state: 'visible' });
    await page.evaluate(({ position, settings }) => {
      window.__hostSend({ type: 'layoutSettings', settings: { sessionListPosition: position } });
      window.__hostSend({ type: 'terminalSettings', settings });
    }, { position, settings: caseSettings });
    await page.waitForTimeout(200);
    await page.evaluate(({ sixel, grayRows, imagesEnabled }) => {
      if (imagesEnabled) {
        for (let frame = 0; frame < 6; frame++) {
          window.__hostSend({ type: 'output', id: 'session-1', data: `\x1b[H${sixel}` });
        }
      }
      window.__hostSend({ type: 'output', id: 'session-1', data: grayRows });
    }, { sixel, grayRows, imagesEnabled });
    if (imagesEnabled) {
      try {
        await page.locator('canvas.xterm-image-layer').waitFor({ state: 'attached', timeout: 5000 });
      } catch {
        throw new Error(`image canvas missing before ${width}x${height} ${position}`);
      }
    } else {
      await page.waitForTimeout(450);
    }
    await page.screenshot({
      path: `test/gutter-${mode}-${position}-${width}x${height}-baseline.png`,
      fullPage: true
    });
    const before = await measure();
    const frameStability = width === 1536
      ? await page.evaluate(async ({ sixel, grayRows, imagesEnabled }) => {
          const samples = [];
          let writes = 0;
          const timer = window.setInterval(() => {
            const image = imagesEnabled ? `\x1b[H${sixel}` : '';
            window.__hostSend({ type: 'output', id: 'session-1', data: image + grayRows });
            if (++writes >= 60) window.clearInterval(timer);
          }, 16);
          await new Promise((resolve) => {
            const sample = () => {
              const screen = document.querySelector('.terminal-surface.active .xterm-screen');
              const rendererCanvas = [...screen.querySelectorAll('canvas')]
                .find((canvas) => !canvas.className);
              const imageCanvas = screen.querySelector('canvas.xterm-image-layer');
              let imageAlpha = imagesEnabled ? -1 : undefined;
              if (imageCanvas) {
                const pixels = imageCanvas.getContext('2d').getImageData(0, 0, 20, 20).data;
                imageAlpha = 0;
                for (let index = 3; index < pixels.length; index += 4) {
                  if (pixels[index]) imageAlpha++;
                }
              }
              samples.push({
                webgl: Boolean(rendererCanvas?.getContext('webgl2')),
                imageAlpha,
                background: getComputedStyle(screen).backgroundColor
              });
              if (samples.length < 90) requestAnimationFrame(sample);
              else resolve();
            };
            requestAnimationFrame(sample);
          });
          return {
            writes,
            nonWebglFrames: samples.filter((sample) => !sample.webgl).length,
            blankImageFrames: samples.filter((sample) => sample.imageAlpha !== undefined && sample.imageAlpha <= 0).length,
            backgrounds: [...new Set(samples.map((sample) => sample.background))]
          };
        }, { sixel, grayRows, imagesEnabled })
      : undefined;

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
      const requestFrame = window.requestAnimationFrame;
      let requestedFrames = 0;
      window.requestAnimationFrame = (callback) => {
        requestedFrames++;
        return requestFrame.call(window, callback);
      };
      try {
        for (let update = 0; update < 12; update++) {
          window.__hostSend({ type: 'state', ...nextState });
        }
      } finally {
        window.requestAnimationFrame = requestFrame;
      }
      return { requestedFrames };
    }, state);
    await page.evaluate(({ sixel, grayRows, imagesEnabled }) => {
      if (imagesEnabled) {
        for (let frame = 0; frame < 6; frame++) {
          window.__hostSend({ type: 'output', id: 'session-1', data: `\x1b[H${sixel}` });
        }
      }
      window.__hostSend({ type: 'output', id: 'session-1', data: grayRows });
    }, { sixel, grayRows, imagesEnabled });
    if (imagesEnabled) {
      try {
        await page.locator('canvas.xterm-image-layer').waitFor({ state: 'attached', timeout: 5000 });
      } catch {
        throw new Error(`image canvas missing after ${width}x${height} ${position}`);
      }
    } else {
      await page.waitForTimeout(450);
    }
    const after = await measure();
    await page.screenshot({
      path: `test/gutter-${mode}-${position}-${width}x${height}-post.png`,
      fullPage: true
    });
    await page.locator('.terminal-pane').screenshot({
      path: `test/gutter-${mode}-${position}-${width}x${height}-terminal.png`
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
    if (!before.webglRenderer || !after.webglRenderer) {
      failures.push('terminal did not keep the WebGL renderer');
    }
    if (before.scrollbarWidth !== 10 || after.scrollbarWidth !== 10) {
      failures.push(`scrollbar width is ${before.scrollbarWidth}/${after.scrollbarWidth}, expected 10`);
    }
    if (before.imageCanvas !== imagesEnabled || after.imageCanvas !== imagesEnabled) {
      failures.push(`image canvas presence does not match imagesEnabled=${imagesEnabled}`);
    }
    if (
      frameStability &&
      (
        frameStability.nonWebglFrames !== 0 ||
        frameStability.blankImageFrames !== 0 ||
        frameStability.backgrounds.length !== 1 ||
        frameStability.backgrounds[0] !== before.surfaceBackground
      )
    ) {
      failures.push(`multi-frame renderer instability: ${JSON.stringify(frameStability)}`);
    }
    if (
      before.viewportBackground !== before.surfaceBackground ||
      before.xtermBackground !== before.surfaceBackground ||
      before.screenBackground !== before.surfaceBackground ||
      after.viewportBackground !== after.surfaceBackground ||
      after.xtermBackground !== after.surfaceBackground ||
      after.screenBackground !== after.surfaceBackground
    ) {
      failures.push('xterm gutter background differs from the VS Code terminal background');
    }
    results.push({
      width,
      height,
      position,
      imagesEnabled,
      before,
      frameStability,
      duringResize,
      stateRefresh,
      after,
      failures
    });
  }

  const failures = results.flatMap((result) =>
    result.failures.map((failure) =>
      `${result.width}x${result.height} ${result.position} images=${result.imagesEnabled}: ${failure}`
    )
  );
  if (failures.length || consoleErrors.length || failedRequests.length) {
    throw new Error(JSON.stringify({ failures, consoleErrors, failedRequests }, null, 2));
  }
  return { results, consoleErrors, failedRequests };
}
