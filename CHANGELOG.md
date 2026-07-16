# Changelog

## 0.3.0

- 新增当前 workspace 的 Agent 历史会话入口，严格按记录中的 cwd 过滤 workspace 根目录及其子目录。
- 首批 provider 适配器支持 Codex 与 Claude Code，并使用各自原生 Resume/Fork 命令。
- 历史结果显示 provider、最近提示、更新时间、cwd 与会话 ID。
- Codex 与 Claude 命令前缀、历史结果数量均可配置，便于 WSL、SSH、Mac 和自定义安装路径使用。
- Fork 会话禁止直接重复重启，避免同一个旧会话被意外连续派生；新会话写入 provider 历史后可正常 Resume。
- 增加 fixture 测试，覆盖 JSONL 解析、subagent 排除、workspace 边界、排序、去重和 provider 失败隔离。

## 0.2.0

- 修复 VS Code Webview 默认内边距造成的会话列表左侧留白，并压缩行内空耗。
- 会话列表支持配置在终端左侧或右侧，拖拽和键盘调整方向会随位置变化。
- 设置按钮改为打开完整扩展设置页。
- 新增一次性自定义启动命令会话，不修改默认命令，并支持创建时命名。
- 顶部增加显式重命名入口，同时保留双击和 `F2`。
- 新增 Agent Terminal Panel 图标与公开项目元数据。
- 记录关闭会话快速恢复和 terminal pets 的后续 TODO。

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
