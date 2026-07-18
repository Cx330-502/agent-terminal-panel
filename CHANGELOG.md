# Changelog

## 0.6.1

- 修复 Webview CSP 拦截 xterm.js image addon 的 WebAssembly Sixel 解码器，导致 Codex Pets 不再报终端不支持、但实际图像仍静默消失的问题。
- CSP 仅增加 `wasm-unsafe-eval`，不开放 JavaScript `unsafe-eval`；增加 Sixel 在受限/允许 CSP 下的正反浏览器回归。

## 0.6.0

- 新增响应式通信健康条，显示活跃、静默、疑似停滞和空闲状态；窄侧栏自动收缩为短标签，不遮挡会话名与操作按钮。
- 新增通用 PTY 收发速率与静默计时，并在界面和提示中明确标注为“非网络流量”。
- Linux/WSL/Remote SSH 使用 `ss` 关联 Agent 进程树和 TCP 累计字节；macOS 使用 `nettop`；Windows 显示逐进程连接数并安全回退到 PTY。
- 支持识别 Agent 到本地 loopback 代理的连接，反向关联 cc-switch 等代理上游，并用 `*` 标记“代理进程共享估计”。
- 新增 Codex 进程级 rollout JSONL 映射，展示真实完成 TTFT、回合时长、token 计数和进行中的首事件时间；不保存、上传或展示消息正文。
- 新增静默/停滞阈值、采样间隔、进程网络和 Codex 元数据独立开关；配置修改可热刷新。
- 明确不伪造 TPOT/TBT，并记录远端 CPA、多账号代理和共享代理无法仅凭进程 socket 精确归因的边界。
- 修复 xterm DOM 渲染器中拖选文字到终端上下边缘时不自动滚动 scrollback 的问题，并增加上下方向浏览器回归。
- 文件拖入遮罩明确提示 VS Code 的 `Shift` Webview 手势，新增统一图片图标的原生文件选择入口；继续支持 Explorer/远端 URI 与剪贴板路径。
- Marketplace 图标改为真正透明的 RGBA PNG，移除圆角外的白色底边。
- 启动遮罩改为仅覆盖 PTY 创建阶段；进程一创建就显示终端，不再把 Agent 首次输出或网络等待误表现为插件加载。
- 增加 Linux 真实 TCP 探针、macOS `nettop` fixture、Codex 首回合 token、通信状态和九视口 UI 回归；更新 Marketplace 展示图。

## 0.5.0

- 全面更新品牌视觉：新的梦幻渐变 Marketplace 图标、专用 Activity Bar 图标，以及统一的 Webview 线性图标体系。
- 区分默认新建与自定义命令入口，移除标题栏中两个近似“加号”的视觉歧义。
- 扩展图片拖放兼容范围，支持大小写归一、`ResourceURLs`、VS Code 内部 URI list、`CodeFiles`、远端 URI 和绝对路径。
- 拖放监听覆盖完整终端面板并使用捕获阶段接收，修复部分 xterm 子元素和非标准 MIME 无法触发 drop 的问题。
- 新增启动阶段遮罩，明确区分“创建 PTY”和“等待 Agent 首个输出”，长时间启动不再只显示空白终端。
- 新增 `Agent Terminal Panel` 日志输出，记录 Webview ready、PTY spawn、首个输出、启动失败和过早退出耗时。
- 新增默认中文、独立英文的 Marketplace 文档、压缩展示图和独立开发文档。

## 0.4.2

- 新增默认关闭的 Sixel/iTerm 终端图片开关，为 Codex Pets 等终端图片功能加载官方 xterm.js image addon。
- 图片模式会向子进程声明 `TERM=xterm-sixel`，并移除会覆盖 Codex Sixel 检测的 `TERM_PROGRAM` / `TERM_PROGRAM_VERSION`。
- 设置可即时控制 Webview 图片解码；进程环境在新建或重启会话时生效。
- 限制单终端图片缓存和单图解码尺寸，避免多后台会话无界占用 Webview 内存。

## 0.4.1

- 补充 Windows x64 与 Windows ARM64 的 `node-pty` 原生 VSIX。
- 六个平台包统一输出到版本化的 `releases/` 目录并纳入仓库。
- 打包前校验每个目标平台都存在对应的 `node-pty` 预编译文件。
- Windows 包排除仅用于调试的 PDB 符号文件。

## 0.4.0

- 新增剪贴板图片粘贴：保留普通文本、中文和 Bracketed Paste 行为，不产生重复输入。
- 新增图片文件拖放与拖拽遮罩，支持从本机 UI 向 WSL/SSH workspace host 传输图片字节。
- 支持拖放 `file://` / VS Code 远端图片 URI，并对非文件型 URI复制到扩展存储。
- 图片保存到当前 workspace 的扩展存储，不污染项目目录；插入主机平台转义后的绝对路径且不自动回车。
- 增加成功、部分失败和错误提示；单张限制 25 MB、单次最多 8 张且总量限制 50 MB。
- 增加图片名称清理、路径转义、文本快捷键、图片剪贴板、拖放与重复插入回归测试。

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
