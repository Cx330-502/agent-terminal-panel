import { spawn } from 'node:child_process';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { basename, join } from 'node:path';
import { chromium } from 'playwright';

const harnessUrl = 'http://127.0.0.1:4173/test/browser-harness.html';
const artifactDirectory = join('artifacts', 'browser');
const regressionFiles = [
  'test/runAttachmentRegression.js',
  'test/runSelectionScrollRegression.js',
  'test/runOutputFollowRegression.js',
  'test/runLaunchMenuRegression.js',
  'test/runTerminalImageRegression.js',
  'test/runTerminalGutterRegression.js',
  'test/runTerminalRenderingRegression.js',
  'test/runScrollbackCompatRegression.js',
  'test/runTerminalSearchRegression.js',
  'test/runI18nRegression.js',
  'test/runUiRegression.js'
];

await mkdir(artifactDirectory, { recursive: true });
const server = await startHarnessServer();
const browser = await chromium.launch({
  headless: true,
  args: ['--enable-webgl', '--ignore-gpu-blocklist', '--use-gl=swiftshader']
});
const report = [];

try {
  for (const file of regressionFiles) {
    const name = basename(file, '.js').replace(/^run/u, '');
    const context = await browser.newContext({ colorScheme: 'dark', locale: 'zh-CN' });
    const page = await context.newPage();
    page.setDefaultTimeout(30_000);
    const startedAt = performance.now();
    try {
      const source = await readFile(file, 'utf8');
      const run = Function(`"use strict"; return (${source});`)();
      const result = await run(page);
      const durationMs = Math.round(performance.now() - startedAt);
      report.push({ name, status: 'passed', durationMs, result });
      process.stdout.write(`PASS ${name} (${durationMs} ms)\n`);
    } catch (error) {
      const message = error instanceof Error ? error.stack ?? error.message : String(error);
      report.push({
        name,
        status: 'failed',
        durationMs: Math.round(performance.now() - startedAt),
        error: message
      });
      try {
        await page.screenshot({
          path: join(artifactDirectory, `${name}-failure.png`),
          fullPage: true
        });
      } catch {
        // The page can already be gone after a browser crash.
      }
      process.stderr.write(`FAIL ${name}\n${message}\n`);
    } finally {
      await context.close();
    }
  }
} finally {
  await browser.close();
  if (server) server.kill();
}

await writeFile(
  join(artifactDirectory, 'report.json'),
  `${JSON.stringify(report, null, 2)}\n`
);
const failures = report.filter((item) => item.status === 'failed');
if (failures.length > 0) {
  throw new Error(`${failures.length} browser regression(s) failed: ${failures.map((item) => item.name).join(', ')}`);
}

async function startHarnessServer() {
  if (await harnessAvailable()) return undefined;
  const child = spawn(process.execPath, ['test/serveHarness.mjs'], {
    stdio: ['ignore', 'pipe', 'pipe']
  });
  let diagnostics = '';
  child.stdout.on('data', (data) => {
    diagnostics += data.toString();
  });
  child.stderr.on('data', (data) => {
    diagnostics += data.toString();
  });
  const deadline = Date.now() + 10_000;
  while (!(await harnessAvailable())) {
    if (child.exitCode !== null) {
      throw new Error(`Harness server exited with ${child.exitCode}: ${diagnostics}`);
    }
    if (Date.now() > deadline) {
      child.kill();
      throw new Error(`Timed out starting harness server: ${diagnostics}`);
    }
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  return child;
}

async function harnessAvailable() {
  try {
    const response = await fetch(harnessUrl);
    return response.ok;
  } catch {
    return false;
  }
}
