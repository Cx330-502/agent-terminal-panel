async (page) => {
  await page.setViewportSize({ width: 800, height: 620 });
  await page.goto('http://127.0.0.1:4173/test/browser-harness.html');
  const screen = page.locator('.xterm-screen');
  await screen.waitFor({ state: 'visible' });

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
        scrollback: 20000,
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
      }
    });
    const seed = Array.from(
      { length: 5000 },
      (_, index) => `seed-${String(index + 1).padStart(4, '0')}\r\n`
    ).join('');
    window.__hostSend({ type: 'output', id: 'session-1', data: seed });
  });

  const scrollState = () => page.evaluate(() => {
    const scrollbar = document.querySelector('.scrollbar.vertical');
    const slider = scrollbar?.querySelector('.slider');
    if (!(scrollbar instanceof HTMLElement) || !(slider instanceof HTMLElement)) {
      throw new Error('Terminal scrollbar is unavailable');
    }
    const track = scrollbar.getBoundingClientRect();
    const thumb = slider.getBoundingClientRect();
    const maxTop = Math.max(0, track.height - thumb.height);
    const top = thumb.top - track.top;
    return {
      top,
      maxTop,
      distanceFromBottom: Math.max(0, maxTop - top)
    };
  });

  const waitForScroll = async (predicate, label) => {
    const deadline = Date.now() + 4000;
    let state;
    do {
      state = await scrollState();
      if (predicate(state)) return state;
      await page.waitForTimeout(25);
    } while (Date.now() < deadline);
    throw new Error(`${label}: ${JSON.stringify(state)}`);
  };

  const seededBottom = await waitForScroll(
    (state) => state.distanceFromBottom < 2,
    'Seed output did not settle at the bottom'
  );
  const box = await screen.boundingBox();
  if (!box) throw new Error('Terminal screen is not visible');
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  const scrollbarBox = await page.locator('.scrollbar.vertical').boundingBox();
  if (!scrollbarBox) throw new Error('Terminal scrollbar is not visible');

  await page.evaluate(() => {
    for (let index = 1; index <= 8000; index++) {
      window.__hostSend({
        type: 'output',
        id: 'session-1',
        data: `queued-${String(index).padStart(4, '0')} 中文输出跟随测试\r\n`
      });
    }
  });
  await page.mouse.click(
    scrollbarBox.x + scrollbarBox.width / 2,
    scrollbarBox.y + scrollbarBox.height * 0.25
  );

  const userScrolled = await waitForScroll(
    (state) => state.distanceFromBottom > Math.max(40, state.maxTop * 0.2),
    'User scroll did not move away from the bottom'
  );
  await page.waitForTimeout(800);
  const lockedAfterQueue = await scrollState();
  if (lockedAfterQueue.distanceFromBottom < Math.max(20, lockedAfterQueue.maxTop * 0.1)) {
    throw new Error(`Queued output forced the viewport back to the bottom: ${JSON.stringify({
      userScrolled,
      lockedAfterQueue
    })}`);
  }

  await page.evaluate(() => {
    window.__outputFollowComplete = false;
    let index = 0;
    const timer = window.setInterval(() => {
      index += 1;
      window.__hostSend({
        type: 'output',
        id: 'session-1',
        data: `stream-${String(index).padStart(4, '0')} 中文持续输出测试\r\n`
      });
      if (index >= 300) {
        window.clearInterval(timer);
        window.__outputFollowComplete = true;
      }
    }, 4);
  });
  await page.waitForTimeout(500);
  const lockedDuringStream = await scrollState();
  if (lockedDuringStream.distanceFromBottom < Math.max(20, lockedDuringStream.maxTop * 0.1)) {
    throw new Error(`Streaming output forced the viewport back to the bottom: ${JSON.stringify({
      userScrolled,
      lockedDuringStream
    })}`);
  }
  await page.waitForFunction(() => window.__outputFollowComplete === true);
  const lockedAfterCompletion = await scrollState();
  if (lockedAfterCompletion.distanceFromBottom < Math.max(20, lockedAfterCompletion.maxTop * 0.1)) {
    throw new Error(`Completing the output stream forced the viewport to the bottom: ${JSON.stringify({
      userScrolled,
      lockedAfterCompletion
    })}`);
  }

  await page.mouse.click(
    scrollbarBox.x + scrollbarBox.width / 2,
    scrollbarBox.y + scrollbarBox.height - 2
  );
  const returnedBottom = await waitForScroll(
    (state) => state.distanceFromBottom < 2,
    'User could not return to the bottom'
  );
  await page.evaluate(() => {
    window.__hostSend({
      type: 'output',
      id: 'session-1',
      data: 'follow-resumed-1\r\nfollow-resumed-2\r\n'
    });
  });
  const followedNewOutput = await waitForScroll(
    (state) => state.distanceFromBottom < 2,
    'Output follow did not resume at the bottom'
  );

  await page.screenshot({ path: 'test/v072-output-follow.png', fullPage: true });
  return {
    seededBottom,
    userScrolled,
    lockedAfterQueue,
    lockedDuringStream,
    lockedAfterCompletion,
    returnedBottom,
    followedNewOutput
  };
}
