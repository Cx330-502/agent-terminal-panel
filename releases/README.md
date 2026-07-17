# Release artifacts

`npm run package` writes versioned, platform-specific VSIX files here.

Each version contains six packages for Windows x64/ARM64, Linux x64/ARM64,
and macOS x64/ARM64. Every VSIX includes only the matching `node-pty`
prebuild and is excluded from the extension package itself.
