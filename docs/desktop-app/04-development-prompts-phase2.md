# Phase 2 开发提示词 — 核心功能集成

> 文件浏览器、代码编辑器、终端、Git 集成、命令面板。

---

## Prompt D8 — 文件浏览器面板

```
任务：实现项目文件树浏览面板，支持打开项目目录。

现有代码参考：
- packages/builtin-tools/src/tools/ 中的 GlobTool, FileReadTool — 文件操作API
- packages/remote-control-server/web/components/ui/collapsible.tsx — 可折叠组件
- packages/remote-control-server/web/components/ui/scroll-area.tsx — 滚动区域

要求：
1. IPC handlers：
   - file.openProject — 打开目录选择对话框，设为当前项目
   - file.listDir — 列出目录内容（名称、类型、大小）
   - file.readFile — 读取文件内容
   - file.getProjectRoot — 返回当前项目根目录
2. FileTree 组件：
   - 递归文件/文件夹树
   - 文件夹展开/折叠
   - 文件图标（按扩展名）
   - 搜索过滤（顶部搜索框）
   - .gitignore 规则排除
3. 交互：
   - 单击文件 → 在编辑器中预览
   - 双击文件 → 在编辑器中打开（固定标签）
   - 右键 → 在终端中打开/复制路径/删除

验收：打开一个项目 → 看到完整文件树 → 点击文件可查看内容

集成约束：
- 大目录延迟加载（仅展开时读取子目录）
- 复用 GlobTool 的 ignore 模式
- 文件树宽度可调整（resizable panel）
```

---

## Prompt D9 — Monaco Editor 集成

```
任务：集成 Monaco Editor 作为代码编辑器。

现有代码参考：
- packages/remote-control-server/web/components/ai-elements/code-block.tsx — 代码高亮
- packages/builtin-tools/src/tools/ 中的 FileEditTool — 文件编辑API

要求：
1. Monaco Editor 配置：
   - 支持常见语言语法高亮（TypeScript/JavaScript/Python/Go/Rust等）
   - 主题跟随App主题（浅色/深色）
   - 字体：JetBrains Mono / Fira Code / 系统等宽字体
   - 行号、缩进指引线、minimap
2. 标签系统：
   - 多文件标签页
   - 修改指示（圆点标记）
   - 关闭/关闭其他/关闭所有
3. 编辑功能：
   - Cmd+S 保存（调用 file.write IPC）
   - Cmd+Z/Y 撤销/重做
   - Cmd+F 搜索/替换
   - Cmd+P 文件快速打开
4. AI 集成预留：
   - inline diff 显示（AI修改建议）
   - ghost text（AI补全预览）

验收：打开 .ts 文件 → 语法高亮 → 编辑 → 保存 → 文件实际被修改

集成约束：
- Monaco Editor 通过 @monaco-editor/react 集成
- 编辑器主题与全局主题联动
- 大文件性能：100KB+ 文件不卡顿
```

---

## Prompt D10 — 终端面板

```
任务：集成 xterm.js 终端仿真器。

现有代码参考：
- packages/builtin-tools/src/tools/ 中的 BashTool — Shell 执行
- src/main.tsx 中的 shell 工具 — PTY 管理

要求：
1. IPC handlers：
   - terminal.create — 创建新终端实例（返回 terminalId）
   - terminal.write — 向终端写入
   - terminal.resize — 调整终端尺寸
   - terminal.kill — 关闭终端
   - 使用 node-pty 创建真正的 PTY 进程
2. Terminal 组件：
   - xterm.js + xterm-addon-fit（自适应尺寸）
   - xterm-addon-web-links（URL可点击）
   - 多终端标签
   - 复制/粘贴支持
3. 布局：
   - 底部面板（可隐藏/显示 Cmd+`）
   - 可调整高度
   - 分屏（水平/垂直）

验收：打开终端 → 执行 ls/cd 等命令 → 输出正确 → Tab补全正常

集成约束：
- PTY 在 Main Process 中创建（安全）
- 通过 IPC 流式传输输出到 Renderer
- 默认 Shell：macOS(zsh) / Windows(PowerShell) / Linux(bash)
- 终端字体跟随编辑器字体设置
```

---

## Prompt D11 — 分面板布局

```
任务：实现可调整大小的多面板布局系统。

现有代码参考：
- packages/remote-control-server/web/components/ui/resizable.tsx — 已有 resizable 组件
- react-resizable-panels（已有依赖）

要求：
1. 主布局结构：
   ┌──────────────────────────────────┐
   │ 标题栏 / 工具栏                   │
   ├─────┬──────────────────┬─────────┤
   │     │                  │         │
   │文件 │   编辑器/对话    │  侧边   │
   │ 树  │                  │  面板   │
   │     │                  │(可选)   │
   │     ├──────────────────┤         │
   │     │   终端面板       │         │
   ├─────┴──────────────────┴─────────┤
   │ 状态栏                            │
   └──────────────────────────────────┘

2. 面板行为：
   - 各面板可折叠/展开
   - 拖拽分隔条调整比例
   - 双击分隔条恢复默认比例
   - 布局状态持久化
3. 响应式：
   - 窗口 <900px 时自动隐藏文件树
   - 全屏模式（隐藏所有面板只留编辑器/对话）

验收：拖拽调整面板 → 折叠展开 → 关闭重开后记住布局

集成约束：
- 复用 resizable.tsx 组件
- 使用 react-resizable-panels（已有依赖）
- 面板比例存储在 localStorage
```

---

## Prompt D12 — 工具权限确认UI

```
任务：AI 调用工具前展示确认界面。

现有代码参考：
- packages/remote-control-server/web/components/chat/PermissionPanel.tsx — 权限面板
- src/components/permissions/ — 终端版权限UI
- src/types/permissions.ts — 权限类型

要求：
1. 权限请求展示：
   - 工具名称 + 参数摘要
   - 允许/拒绝 按钮
   - "始终允许此工具" 选项
   - 危险操作（rm/git push）红色警告
2. 权限策略：
   - 默认：每次确认
   - 宽松：自动允许读操作，写操作确认
   - 信任：全部自动允许
   - 可在设置中切换
3. 权限历史：
   - 记录所有工具调用（允许/拒绝）
   - 可在设置中查看和撤销

验收：AI 尝试写文件 → 弹出权限确认 → 允许后执行 → 拒绝后跳过

集成约束：
- 复用 PermissionPanel 组件
- 权限策略存储在配置文件
- 与终端版权限模式对齐
```

---

## Prompt D13 — Git 状态集成

```
任务：在侧边栏显示 Git 状态。

现有代码参考：
- 项目中已有 git 相关工具和操作
- packages/remote-control-server/web/components/ui/badge.tsx — 状态标记

要求：
1. Git 面板（侧边栏标签）：
   - 当前分支名
   - 变更文件列表（新增/修改/删除，颜色区分）
   - 暂存/取消暂存
   - commit 消息输入 + 提交按钮
2. Diff 查看：
   - 点击变更文件 → 在编辑器中显示 diff
   - inline diff 模式（行内对比）
3. IPC handlers：
   - git.status — 返回变更列表
   - git.diff — 返回文件 diff
   - git.stage — 暂存文件
   - git.commit — 提交
   - git.currentBranch — 当前分支

验收：修改文件 → Git面板显示变更 → 暂存 → 提交 → 变更消失

集成约束：
- 使用 simple-git 库或直接调用 git CLI
- 状态定期轮询（每3秒）+ 文件变更时触发
- 大型仓库不卡顿（限制显示文件数）
```

---

## Prompt D14 — 命令面板

```
任务：实现 Cmd+K 全局命令面板（对标 VS Code 的 Cmd+P / Cursor 的 Cmd+K）。

现有代码参考：
- packages/remote-control-server/web/components/chat/CommandMenu.tsx — 已有命令菜单
- cmdk 依赖（已安装）

要求：
1. 命令面板功能：
   - 文件搜索（fuzzy match项目文件）
   - 命令执行（所有菜单命令可搜索）
   - 最近打开文件
   - 设置搜索
   - AI对话（直接输入问题）
2. 交互：
   - Cmd+K 打开（全局快捷键）
   - 实时搜索过滤
   - 上下键选择 + Enter 确认
   - Esc 关闭
3. 分类：
   - > 前缀：命令模式
   - @ 前缀：跳转到符号
   - : 前缀：跳转到行号
   - 无前缀：搜索文件

验收：Cmd+K → 输入文件名 → 回车 → 打开文件

集成约束：
- 复用 cmdk 库（已有依赖）
- 复用 CommandMenu 组件样式
- 文件搜索使用 GlobTool 的索引
```
