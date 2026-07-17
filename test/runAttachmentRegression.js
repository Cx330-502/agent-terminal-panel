async (page) => {
  const consoleErrors = [];
  const failedRequests = [];
  page.on('console', (message) => {
    if (message.type() === 'error') consoleErrors.push(message.text());
  });
  page.on('requestfailed', (request) => {
    failedRequests.push(`${request.method()} ${request.url()}: ${request.failure()?.errorText}`);
  });
  await page.context().grantPermissions(['clipboard-read', 'clipboard-write'], {
    origin: 'http://127.0.0.1:4173'
  });
  await page.setViewportSize({ width: 620, height: 620 });
  await page.goto('http://127.0.0.1:4173/test/browser-harness.html');
  await page.locator('.xterm-helper-textarea').waitFor({ state: 'attached' });

  const textPaste = await page.evaluate(async () => {
    window.__webviewMessages.length = 0;
    const transfer = new DataTransfer();
    transfer.setData('text/plain', '中文粘贴');
    document.querySelector('.xterm-helper-textarea').dispatchEvent(
      new ClipboardEvent('paste', { clipboardData: transfer, bubbles: true, cancelable: true })
    );
    await new Promise((resolve) => setTimeout(resolve, 30));
    const inputs = window.__webviewMessages.filter((message) => message.type === 'input');
    return {
      inputCount: inputs.length,
      data: inputs.map((message) => message.data).join(''),
      attachmentCount: window.__webviewMessages.filter(
        (message) => message.type === 'saveAttachments'
      ).length
    };
  });

  const keyboardPaste = await page.evaluate(async () => {
    window.__webviewMessages.length = 0;
    await navigator.clipboard.writeText('快捷键粘贴');
    document.querySelector('.xterm-helper-textarea').focus();
  }).then(async () => {
    await page.keyboard.press('Control+Shift+V');
    await page.waitForTimeout(60);
    return page.evaluate(() => {
      const inputs = window.__webviewMessages.filter((message) => message.type === 'input');
      return { inputCount: inputs.length, data: inputs.map((message) => message.data).join('') };
    });
  });

  const imagePaste = await page.evaluate(async () => {
    window.__webviewMessages.length = 0;
    const transfer = new DataTransfer();
    transfer.items.add(new File([new Uint8Array([137, 80, 78, 71])], '截图.png', {
      type: 'image/png'
    }));
    document.querySelector('.xterm-helper-textarea').dispatchEvent(
      new ClipboardEvent('paste', { clipboardData: transfer, bubbles: true, cancelable: true })
    );
    await new Promise((resolve) => setTimeout(resolve, 60));
    const saves = window.__webviewMessages.filter((message) => message.type === 'saveAttachments');
    const inputs = window.__webviewMessages.filter((message) => message.type === 'input');
    return {
      saveCount: saves.length,
      uploadCount: saves[0]?.uploads.length,
      uploadName: saves[0]?.uploads[0]?.name,
      uploadMime: saves[0]?.uploads[0]?.mimeType,
      decodedBytes: atob(saves[0]?.uploads[0]?.base64 || '').length,
      inputCount: inputs.length,
      inserted: inputs.map((message) => message.data).join(''),
      status: document.querySelector('#attachment-status').textContent
    };
  });

  await page.evaluate(() => { window.__webviewMessages.length = 0; });
  await page.locator('#pick-attachments').click();
  await page.waitForTimeout(60);
  const filePicker = await page.evaluate(() => {
    const inputs = window.__webviewMessages.filter((message) => message.type === 'input');
    return {
      pickerPosted: window.__webviewMessages.some((message) => message.type === 'pickAttachments'),
      inputCount: inputs.length,
      inserted: inputs.map((message) => message.data).join(''),
      status: document.querySelector('#attachment-status').textContent
    };
  });

  const dragDrop = await page.evaluate(async () => {
    window.__webviewMessages.length = 0;
    const transfer = new DataTransfer();
    transfer.items.add(new File([new Uint8Array([1, 2, 3])], 'drag.webp', {
      type: 'image/webp'
    }));
    const target = document.querySelector('#terminal-stack');
    target.dispatchEvent(new DragEvent('dragenter', {
      dataTransfer: transfer,
      shiftKey: true,
      bubbles: true,
      cancelable: true
    }));
    const overlayDuring = !document.querySelector('#attachment-overlay').hidden;
    target.dispatchEvent(new DragEvent('drop', {
      dataTransfer: transfer,
      shiftKey: true,
      bubbles: true,
      cancelable: true
    }));
    await new Promise((resolve) => setTimeout(resolve, 60));
    return {
      overlayDuring,
      overlayAfter: !document.querySelector('#attachment-overlay').hidden,
      saveCount: window.__webviewMessages.filter(
        (message) => message.type === 'saveAttachments'
      ).length,
      inputCount: window.__webviewMessages.filter((message) => message.type === 'input').length
    };
  });

  const uriDrop = await page.evaluate(async () => {
    window.__webviewMessages.length = 0;
    const transfer = new DataTransfer();
    transfer.setData('text/uri-list', 'file:///tmp/example%20image.png');
    document.querySelector('#terminal-stack').dispatchEvent(new DragEvent('drop', {
      dataTransfer: transfer,
      shiftKey: true,
      bubbles: true,
      cancelable: true
    }));
    await new Promise((resolve) => setTimeout(resolve, 60));
    const save = window.__webviewMessages.find((message) => message.type === 'saveAttachments');
    return { saveCount: save ? 1 : 0, uris: save?.uris || [] };
  });

  const vscodeTransfers = await page.evaluate(async () => {
    const cases = [
      {
        type: 'ResourceURLs',
        value: JSON.stringify(['vscode-remote://ssh-remote+demo/workspace/资源图.png'])
      },
      {
        type: 'application/vnd.code.uri-list',
        value: 'file:///tmp/internal-uri.webp'
      },
      {
        type: 'CodeFiles',
        value: JSON.stringify(['/tmp/code-file.jpg'])
      },
      {
        type: 'text/plain',
        value: '/tmp/plain-path.gif'
      }
    ];
    const results = [];
    for (const item of cases) {
      window.__webviewMessages.length = 0;
      const transfer = new DataTransfer();
      transfer.setData(item.type, item.value);
      document.querySelector('#active-header').dispatchEvent(new DragEvent('drop', {
        dataTransfer: transfer,
        shiftKey: true,
        bubbles: true,
        cancelable: true
      }));
      await new Promise((resolve) => setTimeout(resolve, 60));
      const save = window.__webviewMessages.find((message) => message.type === 'saveAttachments');
      results.push({ type: item.type, saveCount: save ? 1 : 0, uris: save?.uris || [] });
    }
    const unknownTransfer = new DataTransfer();
    unknownTransfer.setData('application/x-agent-terminal-test', 'unknown');
    const dragOver = new DragEvent('dragover', {
      dataTransfer: unknownTransfer,
      shiftKey: true,
      bubbles: true,
      cancelable: true
    });
    document.querySelector('#terminal-stack').dispatchEvent(dragOver);
    return { results, unknownDragAccepted: dragOver.defaultPrevented };
  });

  const layoutResults = [];
  for (const [width, height] of [[620, 620], [320, 720]]) {
    await page.setViewportSize({ width, height });
    await page.goto('http://127.0.0.1:4173/test/browser-harness.html');
    await page.locator('.xterm-helper-textarea').waitFor({ state: 'attached' });
    await page.evaluate(() => {
      const transfer = new DataTransfer();
      transfer.items.add(new File([new Uint8Array([1, 2, 3])], 'layout.png', {
        type: 'image/png'
      }));
      window.__layoutTransfer = transfer;
      document.querySelector('#terminal-stack').dispatchEvent(new DragEvent('dragenter', {
        dataTransfer: transfer,
        shiftKey: true,
        bubbles: true,
        cancelable: true
      }));
    });
    await page.screenshot({ path: `test/v040-overlay-${width}x${height}.png`, fullPage: true });
    const overlayProbe = await page.evaluate(() => {
      const overlay = document.querySelector('#attachment-overlay');
      const rect = overlay.getBoundingClientRect();
      return {
        visible: !overlay.hidden,
        withinViewport: rect.left >= 0 && rect.right <= innerWidth && rect.bottom <= innerHeight,
        clipped: overlay.scrollWidth > overlay.clientWidth || overlay.scrollHeight > overlay.clientHeight
      };
    });
    await page.evaluate(() => {
      document.querySelector('#terminal-stack').dispatchEvent(new DragEvent('drop', {
        dataTransfer: window.__layoutTransfer,
        shiftKey: true,
        bubbles: true,
        cancelable: true
      }));
    });
    await page.waitForTimeout(60);
    await page.screenshot({ path: `test/v040-status-${width}x${height}.png`, fullPage: true });
    const statusProbe = await page.evaluate(() => {
      const status = document.querySelector('#attachment-status');
      const rect = status.getBoundingClientRect();
      return {
        visible: !status.hidden,
        withinViewport: rect.left >= 0 && rect.right <= innerWidth,
        clipped: status.scrollWidth > status.clientWidth || status.scrollHeight > status.clientHeight
      };
    });
    layoutResults.push({ width, height, overlayProbe, statusProbe });
  }

  return {
    textPaste,
    keyboardPaste,
    imagePaste,
    filePicker,
    dragDrop,
    uriDrop,
    vscodeTransfers,
    layoutResults,
    consoleErrors,
    failedRequests
  };
}
