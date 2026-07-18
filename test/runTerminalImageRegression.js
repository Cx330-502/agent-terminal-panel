async (page) => {
  const harnessUrl = 'http://127.0.0.1:4173/test/browser-harness.html';
  const response = await page.request.get(harnessUrl);
  const harness = await response.text();

  const run = async (allowWasm) => {
    const nonce = 'terminal-image-regression';
    const errors = [];
    const onConsole = (message) => {
      if (message.type() === 'error') errors.push(message.text());
    };
    const onPageError = (error) => errors.push(error.message);
    page.on('console', onConsole);
    page.on('pageerror', onPageError);
    const scriptPolicy = `'nonce-${nonce}'${allowWasm ? " 'wasm-unsafe-eval'" : ''}`;
    const html = harness
      .replace(
        '<head>',
        `<head>
  <base href="${harnessUrl}">
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src data: blob:; style-src 'self' 'unsafe-inline'; script-src ${scriptPolicy};">`
      )
      .replaceAll('<script>', `<script nonce="${nonce}">`)
      .replaceAll('<script src=', `<script nonce="${nonce}" src=`);

    await page.goto(harnessUrl);
    await page.setContent(html, { waitUntil: 'load' });
    await page.locator('.xterm').waitFor({ state: 'visible' });
    await page.evaluate(() => {
      window.__hostSend({
        type: 'terminalSettings',
        settings: {
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
        }
      });
    });
    await page.waitForTimeout(500);
    await page.evaluate(() => {
      const sixel = '\x1bPq"1;1;6;6#1;2;100;0;0#1~~~~~~\x1b\\';
      window.__hostSend({ type: 'output', id: 'session-1', data: sixel });
    });
    await page.waitForTimeout(800);
    const result = await page.evaluate(() => {
      const canvas = document.querySelector('canvas.xterm-image-layer');
      if (!canvas) return { canvas: false, nonTransparent: 0 };
      const pixels = canvas
        .getContext('2d')
        .getImageData(0, 0, canvas.width, canvas.height).data;
      let nonTransparent = 0;
      for (let index = 3; index < pixels.length; index += 4) {
        if (pixels[index] !== 0) nonTransparent++;
      }
      return {
        canvas: true,
        nonTransparent,
        width: canvas.width,
        height: canvas.height
      };
    });
    page.off('console', onConsole);
    page.off('pageerror', onPageError);
    return { ...result, errors };
  };

  const blockedWithoutWasm = await run(false);
  const renderedWithWasm = await run(true);
  if (
    blockedWithoutWasm.canvas ||
    !blockedWithoutWasm.errors.some((error) => error.includes('WebAssembly.instantiate'))
  ) {
    throw new Error(`Expected restrictive CSP to block Sixel WASM: ${JSON.stringify(blockedWithoutWasm)}`);
  }
  if (
    !renderedWithWasm.canvas ||
    renderedWithWasm.nonTransparent === 0 ||
    renderedWithWasm.errors.length > 0
  ) {
    throw new Error(`Expected wasm-unsafe-eval to render Sixel: ${JSON.stringify(renderedWithWasm)}`);
  }
  return { blockedWithoutWasm, renderedWithWasm };
}
