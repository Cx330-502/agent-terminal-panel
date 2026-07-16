# Changelog

## 0.1.1

- 移除默认 Codex 绑定，首次新建会话时提示配置启动命令。
- 新增 `Agent Terminal Panel: 配置启动命令` 和视图标题栏齿轮入口。
- 使用 workspace host 系统 shell 执行完整命令行，支持参数、环境变量前缀和脚本。

## 0.1.0

- 首次实现可移动的 Agent Terminal WebviewView。
- 支持多会话、cwd 选择、后台 PTY、重命名、关闭和重启。
- 同步 VS Code 原生终端字体、光标、滚动和主题颜色。
- 支持 OSC 10/11/12、resize、Bracketed Paste 和中文 IME。
- 增加运行、等待输入、审批、完成状态，以及去重红点、Toast 和完成声音。
- Agent CLI 命令和参数可配置，不绑定单一产品。
- 提供 Linux x64、Linux ARM64、Intel Mac 和 Apple Silicon Mac 原生包。
- 声明 workspace extension host 运行方式以支持 WSL/Remote SSH。
