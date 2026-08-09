async (page) => {
  const consoleErrors = [];
  const failedRequests = [];
  page.on('console', (message) => {
    if (message.type() === 'error') consoleErrors.push(message.text());
  });
  page.on('requestfailed', (request) => {
    failedRequests.push(`${request.method()} ${request.url()}: ${request.failure()?.errorText}`);
  });
  await page.addInitScript(() => {
    Object.defineProperty(Navigator.prototype, 'platform', {
      configurable: true,
      get: () => 'MacIntel'
    });
    if (globalThis.NavigatorUAData) {
      Object.defineProperty(globalThis.NavigatorUAData.prototype, 'platform', {
        configurable: true,
        get: () => 'macOS'
      });
    }
  });
  await page.setViewportSize({ width: 1280, height: 720 });
  await page.goto('http://127.0.0.1:4173/test/browser-harness.html');
  const terminal = page.locator('.xterm-helper-textarea');
  await terminal.waitFor({ state: 'attached' });
  await terminal.focus();

  await page.evaluate(() => { window.__webviewMessages.length = 0; });
  await page.keyboard.press('Control+/');
  await page.waitForTimeout(30);
  const controlSlash = await page.evaluate(() =>
    window.__webviewMessages
      .filter((message) => message.type === 'input')
      .map((message) => [...message.data].map((char) => char.codePointAt(0)))
  );

  await page.evaluate(() => {
    window.__hostSend({ type: 'output', id: 'session-1', data: 'mac-copy-target\r\n' });
  });
  await page.waitForTimeout(80);
  const screenBox = await page.locator('.xterm-screen').boundingBox();
  if (!screenBox) throw new Error('terminal screen is unavailable');
  await page.mouse.dblclick(screenBox.x + 70, screenBox.y + 10);
  await page.evaluate(() => { window.__webviewMessages.length = 0; });
  await terminal.focus();
  await page.keyboard.press('Meta+C');
  await page.waitForTimeout(30);
  const macCopy = await page.evaluate(() =>
    window.__webviewMessages.filter((message) => message.type === 'clipboardWrite')
  );

  await page.evaluate(() => {
    window.__webviewMessages.length = 0;
    window.__macPasteKeyEvents = [];
    document.addEventListener('keydown', (event) => {
      if (event.metaKey && event.key.toLowerCase() === 'v') {
        window.__macPasteKeyEvents.push({
          defaultPrevented: event.defaultPrevented,
          cancelBubble: event.cancelBubble
        });
      }
    });
  });
  await terminal.focus();
  await page.keyboard.press('Meta+V');
  await page.waitForTimeout(30);
  const macPasteKeyEvents = await page.evaluate(() => window.__macPasteKeyEvents);

  const itemsOnlyImage = await page.evaluate(async () => {
    window.__webviewMessages.length = 0;
    const file = new File([new Uint8Array([137, 80, 78, 71])], '', {
      type: 'image/png'
    });
    const transfer = {
      files: [],
      items: [{ kind: 'file', type: 'image/png', getAsFile: () => file }],
      types: ['Files'],
      getData: () => ''
    };
    const event = new ClipboardEvent('paste', { bubbles: true, cancelable: true });
    Object.defineProperty(event, 'clipboardData', { value: transfer });
    document.querySelector('.xterm-helper-textarea').dispatchEvent(event);
    await new Promise((resolve) => setTimeout(resolve, 80));
    const saves = window.__webviewMessages.filter(
      (message) => message.type === 'saveAttachments'
    );
    return {
      saveCount: saves.length,
      uploadCount: saves[0]?.uploads.length ?? 0,
      uploadName: saves[0]?.uploads[0]?.name,
      uploadMime: saves[0]?.uploads[0]?.mimeType,
      inputCount: window.__webviewMessages.filter((message) => message.type === 'input').length
    };
  });

  const failures = [];
  if (controlSlash.length !== 1 || controlSlash[0]?.[0] !== 31) {
    failures.push(`Ctrl+/: ${JSON.stringify(controlSlash)}`);
  }
  if (macCopy.length !== 1 || macCopy[0]?.text !== 'mac-copy-target') {
    failures.push(`Cmd+C: ${JSON.stringify(macCopy)}`);
  }
  if (
    macPasteKeyEvents.length !== 1 ||
    macPasteKeyEvents[0]?.defaultPrevented ||
    macPasteKeyEvents[0]?.cancelBubble
  ) {
    failures.push(`Cmd+V propagation: ${JSON.stringify(macPasteKeyEvents)}`);
  }
  if (
    itemsOnlyImage.saveCount !== 1 ||
    itemsOnlyImage.uploadCount !== 1 ||
    itemsOnlyImage.uploadName !== 'pasted-image-1.png' ||
    itemsOnlyImage.uploadMime !== 'image/png' ||
    itemsOnlyImage.inputCount !== 1
  ) {
    failures.push(`items-only image paste: ${JSON.stringify(itemsOnlyImage)}`);
  }
  if (consoleErrors.length > 0 || failedRequests.length > 0) {
    failures.push(`browser diagnostics: ${JSON.stringify({ consoleErrors, failedRequests })}`);
  }
  if (failures.length > 0) throw new Error(failures.join('\n'));

  return {
    controlSlash,
    macCopy,
    macPasteKeyEvents,
    itemsOnlyImage,
    consoleErrors,
    failedRequests
  };
}
