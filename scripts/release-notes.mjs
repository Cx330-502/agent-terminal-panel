import { readFileSync, writeFileSync } from 'node:fs';

const repository = 'Cx330-502/agent-terminal-panel';
const packageJson = JSON.parse(readFileSync('package.json', 'utf8'));
const version = process.argv[2] || packageJson.version;
const outputPath = process.argv[3];

if (!/^\d+\.\d+\.\d+$/u.test(version)) {
  throw new Error(`Invalid release version: ${version}`);
}

const changelog = readFileSync('CHANGELOG.md', 'utf8');
const section = extractChangelogSection(changelog, version);
const targets = releaseTargets(version);
const releaseBase = `https://github.com/${repository}/releases/download/v${version}`;
const platformRows = targets.map(({ label, x64, arm64 }) =>
  `| ${label} | [下载 VSIX](${releaseBase}/agent-terminal-panel-${version}-${x64}.vsix) | [下载 VSIX](${releaseBase}/agent-terminal-panel-${version}-${arm64}.vsix) |`
);

const notes = [
  '> 把任意 Agent CLI 放进可移动、可并行、真正运行在 workspace host 上的 VS Code 工作台。',
  '',
  '## 本次更新',
  '',
  section,
  '',
  '## 下载与安装',
  '',
  '推荐从 [VS Code Marketplace](https://marketplace.visualstudio.com/items?itemName=Cx330-502.agent-terminal-panel) 安装，VS Code 会按当前 extension host 自动选择平台。需要手动安装时，请下载匹配 **workspace host** 的 VSIX：',
  '',
  '| Workspace host | x64 | ARM64 |',
  '| --- | --- | --- |',
  ...platformRows,
  '',
  versionBefore(version, '0.4.1')
    ? '> 此历史版本尚未提供 Windows VSIX；Windows x64/ARM64 从 v0.4.1 开始提供。'
    : '> WSL 和 Remote SSH 请下载远端 workspace host 对应的平台包，而不是本地 VS Code UI 所在平台。',
  '',
  '在 VS Code 扩展视图右上角菜单中选择 **从 VSIX 安装… / Install from VSIX…** 即可手动安装。',
  '',
  `[中文说明](https://github.com/${repository}/blob/main/README.md) · [English README](https://github.com/${repository}/blob/main/README.en.md) · [完整更新记录](https://github.com/${repository}/blob/main/CHANGELOG.md)`,
  ''
].join('\n');

if (outputPath) writeFileSync(outputPath, notes);
else process.stdout.write(notes);

function extractChangelogSection(content, releaseVersion) {
  const escaped = releaseVersion.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&');
  const heading = new RegExp(`^## ${escaped}\\s*$`, 'mu');
  const match = heading.exec(content);
  if (!match) throw new Error(`CHANGELOG.md has no section for ${releaseVersion}`);
  const remainder = content.slice(match.index + match[0].length).replace(/^\s+/u, '');
  const nextHeading = /^##\s+/mu.exec(remainder);
  const sectionContent = (nextHeading ? remainder.slice(0, nextHeading.index) : remainder).trim();
  if (!sectionContent) throw new Error(`CHANGELOG.md section ${releaseVersion} is empty`);
  return sectionContent;
}

function releaseTargets(releaseVersion) {
  const targets = [
    { label: 'Linux', x64: 'linux-x64', arm64: 'linux-arm64' },
    { label: 'macOS', x64: 'darwin-x64', arm64: 'darwin-arm64' }
  ];
  if (!versionBefore(releaseVersion, '0.4.1')) {
    targets.unshift({ label: 'Windows', x64: 'win32-x64', arm64: 'win32-arm64' });
  }
  return targets;
}

function versionBefore(left, right) {
  const leftParts = left.split('.').map(Number);
  const rightParts = right.split('.').map(Number);
  for (let index = 0; index < 3; index++) {
    if (leftParts[index] !== rightParts[index]) return leftParts[index] < rightParts[index];
  }
  return false;
}
