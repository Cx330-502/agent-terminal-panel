async (page) => {
  const viewports = [
    [1920, 1080],
    [1680, 1050],
    [1536, 864],
    [1536, 780],
    [1440, 900],
    [1280, 720],
    [390, 844],
    [360, 800],
    [320, 720]
  ];
  const consoleErrors = [];
  const failedRequests = [];
  page.on('console', (message) => {
    if (message.type() === 'error') consoleErrors.push(message.text());
  });
  page.on('requestfailed', (request) => {
    failedRequests.push(`${request.method()} ${request.url()}: ${request.failure()?.errorText}`);
  });
  const results = [];

  const communication = (health, overrides = {}) => ({
    health,
    healthBasis: 'network',
    silentForMs: health === 'stalled' ? 52_000 : health === 'quiet' ? 18_000 : 450,
    sampledAt: Date.now(),
    pty: {
      receivedBytes: 24_000,
      sentBytes: 520,
      receiveRate: health === 'active' ? 840 : 0,
      sendRate: health === 'active' ? 48 : 0
    },
    network: {
      source: 'linux-ss',
      available: true,
      hasByteCounters: true,
      connectionCount: 1,
      loopback: true,
      receivedBytes: 18_000,
      sentBytes: 2_800,
      receiveRate: health === 'active' ? 760 : 0,
      sendRate: health === 'active' ? 42 : 0,
      proxy: {
        processName: 'cc-switch',
        connectionCount: 2,
        shared: true,
        receivedBytes: 20_000,
        sentBytes: 3_200,
        receiveRate: health === 'active' ? 1_240 : 0,
        sendRate: health === 'active' ? 96 : 0
      }
    },
    ...overrides
  });

  const sessionsFor = (activeCommunication, active = {}) => [
    {
      id: 'session-1',
      name: 'Codex · 通信健康与代理流量',
      cwd: '/workspace/中文项目/agent-terminal-panel',
      status: 'running',
      unread: false,
      isActive: true,
      canRestart: true,
      startupDurationMs: 680,
      communication: activeCommunication,
      ...active
    },
    {
      id: 'session-2',
      name: 'Claude · Review',
      cwd: '/workspace/中文项目',
      status: 'approval',
      unread: true,
      isActive: false,
      canRestart: true
    },
    {
      id: 'session-3',
      name: 'Agent · Tests',
      cwd: '/workspace/中文项目',
      status: 'completed',
      unread: false,
      isActive: false,
      canRestart: true,
      exitCode: 0
    }
  ];

  const communicationProbe = () => page.evaluate(() => {
    const summary = document.querySelector('#communication-summary');
    const full = document.querySelector('#communication-health-full');
    const compact = document.querySelector('#communication-health-compact');
    const traffic = document.querySelector('#communication-traffic');
    const latency = document.querySelector('#communication-latency');
    const visibleText = (element) => element && getComputedStyle(element).display !== 'none'
      ? element.textContent?.trim()
      : undefined;
    return {
      hidden: summary?.hidden,
      health: visibleText(full) || visibleText(compact),
      traffic: visibleText(traffic),
      latency: visibleText(latency),
      title: summary?.getAttribute('title'),
      className: summary?.className,
      width: summary?.getBoundingClientRect().width,
      clipped: summary ? summary.scrollWidth > summary.clientWidth + 1 : false
    };
  });

  for (let index = 0; index < viewports.length; index++) {
    const [width, height] = viewports[index];
    const position = index % 2 === 0 ? 'left' : 'right';
    await page.setViewportSize({ width, height });
    await page.goto('http://127.0.0.1:4173/test/browser-harness.html');
    await page.locator('.xterm').waitFor({ state: 'visible' });
    await page.evaluate((side) => {
      window.__webviewMessages.length = 0;
      window.__hostSend({ type: 'layoutSettings', settings: { sessionListPosition: side } });
    }, position);
    await page.screenshot({
      path: `test/v060-${position}-${width}x${height}-baseline.png`,
      fullPage: true
    });
    const ariaSnapshot = await page.locator('body').ariaSnapshot();

    await page.evaluate(() => {
      window.__hostSend({
        type: 'state',
        sessions: [{
          id: 'session-1',
          name: 'Agent 启动诊断',
          cwd: '/workspace/中文项目',
          status: 'running',
          unread: false,
          isActive: true,
          canRestart: true,
          startupElapsedMs: 120
        }],
        activeId: 'session-1'
      });
    });
    await page.screenshot({
      path: `test/v060-${position}-${width}x${height}-startup.png`,
      fullPage: true
    });
    const startupProbe = await page.evaluate(() => ({
      visible: !document.querySelector('#startup-overlay').hidden,
      title: document.querySelector('#startup-title').textContent,
      detail: document.querySelector('#startup-detail').textContent
    }));

    await page.evaluate(() => {
      window.__hostSend({
        type: 'state',
        sessions: [{
          id: 'session-1',
          name: 'Agent 启动诊断',
          cwd: '/workspace/中文项目',
          status: 'running',
          unread: false,
          isActive: true,
          canRestart: true,
          spawnDurationMs: 6,
          startupElapsedMs: 5200
        }],
        activeId: 'session-1'
      });
    });
    const startupHiddenAfterSpawn = await page.evaluate(
      () => document.querySelector('#startup-overlay')?.hidden === true
    );

    await page.evaluate((sessions) => {
      window.__hostSend({ type: 'state', sessions, activeId: 'session-1' });
    }, sessionsFor(communication('active', {
      provider: {
        provider: 'codex',
        source: 'codex-jsonl',
        turnActive: true,
        phase: 'waiting',
        waitingForFirstEventMs: 3200,
        totalTokens: 18_400,
        contextWindow: 200_000
      }
    })));
    await page.screenshot({
      path: `test/v060-${position}-${width}x${height}-active.png`,
      fullPage: true
    });
    const activeProbe = await communicationProbe();

    await page.evaluate((sessions) => {
      window.__hostSend({ type: 'state', sessions, activeId: 'session-1' });
    }, sessionsFor(communication('quiet', {
      provider: {
        provider: 'codex',
        source: 'codex-jsonl',
        turnActive: true,
        phase: 'model',
        firstEventMs: 2600,
        turnInputTokens: 6200,
        turnOutputTokens: 240,
        totalTokens: 18_640,
        contextWindow: 200_000
      }
    })));
    await page.screenshot({
      path: `test/v060-${position}-${width}x${height}-quiet.png`,
      fullPage: true
    });
    const quietProbe = await communicationProbe();

    await page.evaluate((sessions) => {
      window.__hostSend({ type: 'state', sessions, activeId: 'session-1' });
    }, sessionsFor(communication('stalled', {
      provider: {
        provider: 'codex',
        source: 'codex-jsonl',
        turnActive: true,
        phase: 'model',
        firstEventMs: 2600,
        turnInputTokens: 6200,
        turnOutputTokens: 240,
        totalTokens: 18_640,
        contextWindow: 200_000
      }
    })));
    await page.screenshot({
      path: `test/v060-${position}-${width}x${height}-stalled.png`,
      fullPage: true
    });
    const stalledProbe = await communicationProbe();

    await page.locator('.session-row').first().focus();
    await page.keyboard.press('F2');
    const renameInput = page.locator('.session-rename');
    await renameInput.fill('编辑中的会话名');
    await page.evaluate((sessions) => {
      window.__hostSend({ type: 'state', sessions, activeId: 'session-1' });
    }, sessionsFor(communication('active')));
    const inlineRenamePreserved = await page.evaluate(() => ({
      present: Boolean(document.querySelector('.session-rename')),
      value: document.querySelector('.session-rename')?.value
    }));
    await page.keyboard.press('Escape');

    await page.locator('#new-session-menu').click();
    const launchMenuAria = await page.locator('#launch-menu').ariaSnapshot();
    const launchMenuProbe = await page.evaluate(() => {
      const menu = document.querySelector('#launch-menu');
      const trigger = document.querySelector('#new-session-menu');
      const menuRect = menu?.getBoundingClientRect();
      const triggerRect = trigger?.getBoundingClientRect();
      return {
        visible: menu?.hidden === false,
        withinViewport: Boolean(menuRect && menuRect.left >= 3 && menuRect.right <= innerWidth - 3),
        belowTrigger: Boolean(
          menuRect && triggerRect &&
          menuRect.top >= triggerRect.bottom - 1 && menuRect.top <= triggerRect.bottom + 8
        ),
        labels: [...(menu?.querySelectorAll('[role="menuitem"]') ?? [])]
          .map((element) => element.textContent?.trim())
      };
    });
    await page.screenshot({
      path: `test/v080-${position}-${width}x${height}-launch-menu.png`,
      fullPage: true
    });
    await page.locator('#launch-menu').getByRole('menuitem', { name: /Claude/ }).click();
    await page.locator('#restore-workspace-sessions').click();
    await page.locator('#active-name').dblclick();
    await page.locator('#restart-session').hover();
    await page.locator('.session-row').first().focus();
    await page.locator('#session-splitter').focus();
    await page.keyboard.press(position === 'left' ? 'ArrowRight' : 'ArrowLeft');

    await page.evaluate((sessions) => {
      window.__hostSend({ type: 'state', sessions, activeId: 'session-1' });
    }, sessionsFor(communication('idle', {
      silentForMs: 1800,
      provider: {
        provider: 'codex',
        source: 'codex-jsonl',
        turnActive: false,
        phase: 'complete',
        lastTtftMs: 1850,
        lastTurnDurationMs: 12_400,
        turnInputTokens: 6200,
        turnOutputTokens: 940,
        totalTokens: 19_340,
        contextWindow: 200_000
      }
    }), {
      status: 'completed',
      unread: true,
      canRestart: false,
      exitCode: 0
    }));
    await page.screenshot({
      path: `test/v060-${position}-${width}x${height}-post.png`,
      fullPage: true
    });
    await page.locator('.active-header').screenshot({
      path: `test/v060-${position}-${width}x${height}-communication.png`
    });
    const completedProbe = await communicationProbe();

    const probe = await page.evaluate(() => {
      const controls = [...document.querySelectorAll('button, [role="button"], [role="tab"], [role="separator"]')]
        .filter((element) => {
          const rect = element.getBoundingClientRect();
          return rect.width > 0 && rect.height > 0;
        });
      const clipped = controls.flatMap((element) => {
        if (element.getAttribute('role') === 'separator') return [];
        const text = element.textContent?.trim() || element.getAttribute('aria-label') || '';
        return element.scrollWidth > element.clientWidth + 1 || element.scrollHeight > element.clientHeight + 1
          ? [text]
          : [];
      });
      const shortWrapped = controls.flatMap((element) => {
        const text = (element.textContent?.trim() || element.getAttribute('aria-label') || '').trim();
        const style = getComputedStyle(element);
        const rect = element.getBoundingClientRect();
        const lineHeight = Number.parseFloat(style.lineHeight) || Number.parseFloat(style.fontSize) * 1.2;
        return text.length >= 2 && text.length <= 12 && style.writingMode.startsWith('horizontal') &&
          rect.width > rect.height && rect.height > lineHeight * 1.7 ? [text] : [];
      });
      const occluded = controls.flatMap((element) => {
        const rect = element.getBoundingClientRect();
        const target = document.elementFromPoint(rect.left + rect.width / 2, rect.top + rect.height / 2);
        const covered = target && target !== element && !element.contains(target) && !target.contains(element);
        return covered ? [element.getAttribute('aria-label') || element.textContent?.trim() || element.tagName] : [];
      });
      const summary = document.querySelector('#communication-summary');
      return {
        documentOverflow: document.documentElement.scrollWidth > innerWidth,
        clipped,
        shortWrapped,
        occluded,
        communicationClipped: summary ? summary.scrollWidth > summary.clientWidth + 1 : false,
        restartDisabled: document.querySelector('#restart-session')?.disabled === true,
        rightLayout: document.querySelector('#app')?.classList.contains('session-list-right') === true,
        profileLaunchPosted: window.__webviewMessages.some(
          (message) => message.type === 'newProfileSession' && message.id === 'profile-0'
        ),
        launchMenuHidden: document.querySelector('#launch-menu')?.hidden === true,
        restorePosted: window.__webviewMessages.some((message) => message.type === 'restoreWorkspaceSessions'),
        restoreVisible: document.querySelector('#workspace-restore')?.hidden === false,
        renamePosted: window.__webviewMessages.some((message) => message.type === 'promptRenameSession'),
        startupHiddenAfterOutput: document.querySelector('#startup-overlay')?.hidden === true,
        iconButtonCount: document.querySelectorAll('.icon-button').length,
        missingButtonIcons: [...document.querySelectorAll('.icon-button')]
          .filter((element) => element.querySelectorAll('.ui-icon').length !== 1)
          .map((element) => element.getAttribute('aria-label'))
      };
    });
    results.push({
      width,
      height,
      position,
      ariaLength: ariaSnapshot.length,
      startupProbe,
      startupHiddenAfterSpawn,
      activeProbe,
      quietProbe,
      stalledProbe,
      completedProbe,
      inlineRenamePreserved,
      launchMenuAriaLength: launchMenuAria.length,
      launchMenuProbe,
      ...probe
    });
  }

  return { results, consoleErrors, failedRequests };
}
