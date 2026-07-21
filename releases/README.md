# Local release artifacts

`npm run package` writes versioned, platform-specific VSIX files here.

VSIX files are intentionally ignored by Git. Tagged builds upload them as
[GitHub Release assets](https://github.com/Cx330-502/agent-terminal-panel/releases)
and publish the same platform packages to the VS Code Marketplace.

Every VSIX includes only the matching `node-pty` prebuild and is excluded from
the extension package itself. Releases through v0.4.0 have four Linux/macOS
packages; v0.4.1 and later have six packages for Windows x64/ARM64, Linux
x64/ARM64, and macOS x64/ARM64.
