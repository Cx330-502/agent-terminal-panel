import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const targets = ['linux-x64', 'linux-arm64', 'darwin-x64', 'darwin-arm64'];
const packageJson = JSON.parse(readFileSync('package.json', 'utf8'));
const baseIgnore = readFileSync('.vscodeignore', 'utf8');
const prebuildRoot = join('node_modules', 'node-pty', 'prebuilds');
const prebuildTargets = readdirSync(prebuildRoot, { withFileTypes: true })
  .filter((entry) => entry.isDirectory())
  .map((entry) => entry.name);
const temporaryDirectory = mkdtempSync(join(tmpdir(), 'agent-terminal-panel-'));
const vsce = join(
  'node_modules',
  '.bin',
  process.platform === 'win32' ? 'vsce.cmd' : 'vsce'
);

try {
  for (const target of targets) {
    const output = `${packageJson.name}-${packageJson.version}-${target}.vsix`;
    const ignoreFile = join(temporaryDirectory, `${target}.vscodeignore`);
    const targetIgnores = prebuildTargets
      .filter((prebuildTarget) => prebuildTarget !== target)
      .map((prebuildTarget) => `node_modules/node-pty/prebuilds/${prebuildTarget}/**`);
    writeFileSync(ignoreFile, `${baseIgnore.trimEnd()}\n${targetIgnores.join('\n')}\n`);
    rmSync(output, { force: true });
    execFileSync(
      vsce,
      [
        'package',
        '--allow-missing-repository',
        '--target',
        target,
        '--ignoreFile',
        ignoreFile,
        '--out',
        output
      ],
      { stdio: 'inherit' }
    );
  }
} finally {
  rmSync(temporaryDirectory, { recursive: true, force: true });
}
