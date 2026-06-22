# Phase 1 开发提示词 — 最小可用桌面App

> 按顺序执行以下 Prompt，每个完成后必须通过 `bunx tsc --noEmit` 和 `bun run lint`。

---

## Prompt D1 — Electron 项目脚手架

```
任务：创建 packages/desktop/ 桌面应用包，搭建 Electron + Vite + React 基础结构。

现有代码参考：
- packages/remote-control-server/package.json — React 19 + Vite 6 + Tailwind 4 依赖声明
- packages/remote-control-server/web/ — Vite 项目结构参考
- package.json 根目录 — workspace 配置

要求：
1. 创建 packages/desktop/package.json：
   - 依赖：electron、electron-vite、@vitejs/plugin-react
   - 复用 RCS 的 UI 依赖（react、radix-ui、tailwind、lucide 等）
   - scripts: dev、build、package、start
2. 创建目录结构：
   - src/main/ — Electron 主进程
   - src/preload/ — preload 脚本
   - src/renderer/ — React 渲染进程
3. 创建 src/main/index.ts：
   - 创建 BrowserWindow（1280x800，白色背景）
   - 加载 renderer 的 index.html
   - 开发模式连接 Vite dev server
4. 创建 src/preload/index.ts：
   - contextBridge 暴露安全 API
   - 定义 window.electronAPI 类型
5. 创建 src/renderer/index.html + main.tsx：
   - 最简 React 入口
   - 引入 Tailwind CSS
6. 创建 electron-vite.config.ts：
   - main/preload/renderer 三入口配置

验收：bun run dev:desktop 启动后看到白色窗口 + "Claude Code Desktop" 标题

集成约束：
- 加入 bun workspace（根 package.json 的 workspaces 数组）
- 使用 workspace:* 引用内部包
- 不引入 RCS 未使用的外部依赖
```

---

## Prompt D2 — IPC 通信基础

```
任务：建立 Main Process ↔ Renderer 的类型安全 IPC 通信层。

现有代码参考：
- packages/remote-control-server/src/index.ts — Hono 服务端模式（参考API设计风格）
- src/services/acp/agent.ts — 消息传递模式

OpenAI Codex 参考：
- 集中式 IPC handler registry（70个方法，统一注册）
- 方法分类：session/chat/file/terminal/git/tool/recorder/skill/model/window/system

要求：
1. 创建 src/main/ipc/registry.ts：
   - 集中式 handler 注册表（Map<string, AsyncHandler>）
   - 统一错误处理和日志
   - 类型安全的请求/响应定义
2. 创建 src/main/ipc/handlers/ 目录：
   - session.ts — 会话管理（create/list/delete）
   - chat.ts — 对话（send/cancel）占位
   - system.ts — 系统信息（version/platform/paths）
3. 创建 src/preload/api.ts：
   - 类型安全的 invoke 封装
   - 暴露 window.electronAPI.invoke(method, params)
4. 创建 shared/ipc-types.ts：
   - 所有 IPC 方法的请求/响应类型定义
   - Main 和 Renderer 共享

验收：Renderer 调用 system.getInfo → 返回平台信息

集成约束：
- 遵循 Electron 安全最佳实践（nodeIntegration: false, contextIsolation: true）
- preload 仅暴露 invoke 方法，不暴露完整 Node.js
- handler 支持异步和流式响应
```

---

## Prompt D3 — 对话界面集成

```
任务：将 RCS Web UI 的对话组件移植到桌面App的 Renderer 中。

现有代码参考：
- packages/remote-control-server/web/components/chat/ChatView.tsx — 对话视图
- packages/remote-control-server/web/components/chat/ChatInput.tsx — 输入框
- packages/remote-control-server/web/components/chat/MessageBubble.tsx — 消息气泡
- packages/remote-control-server/web/components/ai-elements/ — AI元素渲染

要求：
1. 在 src/renderer/ 中建立对话页面：
   - 复制 ChatView + ChatInput + MessageBubble 组件
   - 适配 IPC 调用（原来是 HTTP/WS，改为 electronAPI.invoke）
2. 实现消息流：
   - 用户输入 → invoke('chat.send', {message}) → 流式接收
   - AI回复逐字显示（streaming）
   - 工具调用展示（ToolCallGroup）
3. 样式适配：
   - 白底黑字主题
   - 字体：system-ui（SF Pro / Segoe UI / Ubuntu）
   - 对话区域居中，最大宽度 768px（参考 ChatGPT）

验收：输入消息 → 看到 AI 流式回复 → 工具调用正确显示

集成约束：
- 共享 UI 组件代码（通过 workspace 引用或直接复制）
- 不修改 RCS 原有组件
- 保持 Tailwind 类名一致
```

---

## Prompt D4 — API Provider 集成

```
任务：连接桌面App到 claude-code 的多模型 API 层。

现有代码参考：
- src/services/api/claude.ts — Anthropic API 客户端
- src/services/api/ 下的 7 个 provider（firstParty/bedrock/vertex/openai/gemini/grok/foundry）
- src/utils/model/providers.ts — provider 选择逻辑

要求：
1. 在 Main Process 中初始化 API 客户端：
   - 读取环境变量或配置文件中的 API Key
   - 支持多 provider 切换
2. IPC handler 扩展：
   - model.list — 返回可用模型列表
   - model.switch — 切换当前模型
   - chat.send — 调用 API 并流式返回
3. Renderer 中添加模型选择器：
   - 复用 RCS 的 ModelSelectorPopover 组件
   - 显示当前模型 + 点击切换
4. API Key 配置界面：
   - 设置页面输入 API Key
   - 存储到系统 Keychain（不明文存储）

验收：选择不同模型 → 发送消息 → 正确收到对应模型回复

集成约束：
- API Key 存储使用 electron safeStorage 或 keytar
- 不硬编码任何 Key
- Provider 选择逻辑复用现有 providers.ts
```

---

## Prompt D5 — 多会话管理

```
任务：实现多会话的创建、切换、删除，对话历史持久化。

现有代码参考：
- packages/remote-control-server/web/components/chat/SessionSidebar.tsx — 会话侧边栏
- packages/remote-control-server/web/components/ThreadHistory.tsx — 历史记录
- src/bootstrap/state.ts — 会话状态管理

要求：
1. 数据模型：
   - Session: {id, title, createdAt, updatedAt, messages[], modelId}
   - 持久化到 SQLite（better-sqlite3）
2. 侧边栏组件：
   - 显示会话列表（按时间倒序）
   - 新建会话按钮
   - 右键菜单：重命名/删除
   - 当前会话高亮
3. IPC handlers：
   - session.create → 新建空会话
   - session.list → 返回会话列表
   - session.get → 返回单个会话含消息
   - session.delete → 删除会话
   - session.rename → 重命名
4. 自动标题：
   - 第一条消息后自动生成标题（取消息前20字）

验收：创建3个会话 → 切换 → 各自消息独立 → 重启App后数据仍在

集成约束：
- SQLite 数据库存储在用户数据目录（app.getPath('userData')）
- 使用 better-sqlite3（同步，性能好）
- 复用 SessionSidebar 组件样式
```

---

## Prompt D6 — 系统菜单与快捷键

```
任务：实现原生系统菜单和全局快捷键。

现有代码参考：
- Electron Menu API 标准模式
- packages/@ant/ink/keybindings/ — 快捷键注册参考

要求：
1. 应用菜单（macOS菜单栏 / Windows标题栏）：
   - File: New Session(Cmd+N), Close Window(Cmd+W), Quit(Cmd+Q)
   - Edit: Undo, Redo, Cut, Copy, Paste, Select All
   - View: Toggle Sidebar(Cmd+B), Toggle Terminal(Cmd+`), Zoom In/Out
   - Help: About, Check for Updates, Documentation
2. 全局快捷键：
   - Cmd+K: 命令面板（全局搜索+命令）
   - Cmd+Enter: 发送消息
   - Cmd+Shift+R: 开始/停止录制（预留）
3. 上下文菜单（右键）：
   - 会话列表：重命名/删除
   - 消息：复制/重试

验收：所有菜单项可点击且功能正确，快捷键响应 <100ms

集成约束：
- macOS 和 Windows/Linux 菜单结构不同（macOS 有应用级菜单）
- 快捷键跨平台适配（Cmd→Ctrl on Windows/Linux）
```

---

## Prompt D7 — 主题系统

```
任务：实现浅色/深色主题切换，默认白底黑字 Apple 风格。

现有代码参考：
- packages/remote-control-server/web/components/ui/theme-toggle.tsx — 主题切换组件
- packages/remote-control-server/web/src/lib/theme.ts — ThemeProvider

要求：
1. 主题变量定义（CSS Variables）：
   - 浅色：背景 #FFFFFF，文字 #1A1A1A，边框 #E5E5E5
   - 深色：背景 #1A1A1A，文字 #FAFAFA，边框 #333333
   - 强调色：#2563EB (blue-600)
2. ThemeProvider 集成：
   - 复用 RCS 的 ThemeProvider
   - 跟随系统主题 / 手动切换
   - 偏好持久化到配置
3. 窗口样式：
   - 标题栏颜色跟随主题
   - macOS vibrancy 效果（可选）
   - 圆角窗口（macOS）

验收：
- 默认启动为白底黑字
- 切换暗色模式后全局响应
- 重启后记住上次选择

集成约束：
- 复用 RCS 已有的 theme 基础设施
- Tailwind dark: 前缀正常工作
- 系统托盘图标也跟随主题切换
```
