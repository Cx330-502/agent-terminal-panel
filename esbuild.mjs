import { build, context } from 'esbuild';
import { copyFile, mkdir } from 'node:fs/promises';

const watch = process.argv.includes('--watch');

await mkdir('dist', { recursive: true });
await copyFile('node_modules/@xterm/xterm/css/xterm.css', 'media/xterm.css');

const builds = [
  {
    entryPoints: ['src/extension.ts'],
    outfile: 'dist/extension.js',
    bundle: true,
    platform: 'node',
    format: 'cjs',
    target: 'node20',
    external: ['vscode', 'node-pty'],
    sourcemap: false
  },
  {
    entryPoints: ['media/main.ts'],
    outfile: 'media/main.js',
    bundle: true,
    platform: 'browser',
    format: 'iife',
    target: 'chrome120',
    sourcemap: false
  }
];

if (watch) {
  const contexts = await Promise.all(builds.map((options) => context(options)));
  await Promise.all(contexts.map((item) => item.watch()));
  console.log('Watching extension and webview bundles...');
} else {
  await Promise.all(builds.map((options) => build({ ...options, minify: true })));
}
