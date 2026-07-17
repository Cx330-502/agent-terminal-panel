import { execFileSync } from 'node:child_process';
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const targets = [
  'win32-x64',
  'win32-arm64',
  'linux-x64',
  'linux-arm64',
  'darwin-x64',
  'darwin-arm64'
];
const packageJson = JSON.parse(readFileSync('package.json', 'utf8'));
const baseIgnore = readFileSync('.vscodeignore', 'utf8');
const prebuildRoot = join('node_modules', 'node-pty', 'prebuilds');
const prebuildTargets = readdirSync(prebuildRoot, { withFileTypes: true })
  .filter((entry) => entry.isDirectory())
  .map((entry) => entry.name);
const releaseDirectory = join('releases', `v${packageJson.version}`);
const vsce = join(
  'node_modules',
  '.bin',
  process.platform === 'win32' ? 'vsce.cmd' : 'vsce'
);

for (const target of targets) {
  if (!prebuildTargets.includes(target)) {
    throw new Error(`node-pty prebuild is missing for ${target}`);
  }
}
const temporaryDirectory = mkdtempSync(join(tmpdir(), 'agent-terminal-panel-'));
mkdirSync(releaseDirectory, { recursive: true });

try {
  for (const target of targets) {
    const output = join(
      releaseDirectory,
      `${packageJson.name}-${packageJson.version}-${target}.vsix`
    );
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
