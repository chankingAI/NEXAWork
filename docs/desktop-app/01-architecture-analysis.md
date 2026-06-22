# 桌面端应用架构分析 — 从 CLI 到世界级 AI 办公软件

> 基于现有 claude-code 代码，分析如何构建对标 Codex/Cursor/Windsurf 的桌面级 AI 办公应用。

---

## 一、竞品技术架构研究

### 1.1 OpenAI Codex Desktop

| 维度 | 技术选型 |
|------|----------|
| 框架 | Electron 40.0.0 |
| 后端语言 | Rust（208个crate依赖） |
| 前端 | React + ProseMirror 编辑器 |
| 数据库 | SQLite（2个库：主数据 + 缓存） |
| IPC | 集中式 70-method handler registry |
| 认证 | OAuth2 + Fetch Proxy Auth Gateway |
| 工作区 | Git-native（git作为上下文边界） |
| 自动化 | 内置 cron/automation 系统 |
| 沙箱 | bubblewrap（Linux）/ 原生沙箱（Windows） |

**核心设计**: 桌面App包装CLI工具，Electron层只加 窗口管理+编辑器+认证，核心智能全在 Rust CLI 中。

### 1.2 Cursor

| 维度 | 技术选型 |
|------|----------|
| 框架 | Electron（VS Code fork） |
| 后端语言 | TypeScript + Rust（性能关键路径） |
| 前端 | React + Monaco 编辑器 |
| 通信 | Electron IPC（ipcMain/ipcRenderer） |
| AI集成 | 直接hook渲染管线（AST级别） |
| 数据库 | turbopuffer（多租户加密存储） |
| 部署 | 后端单体服务 |

**核心设计**: VS Code深度fork，修改底层渲染管线，非扩展模式。

### 1.3 Windsurf

| 维度 | 技术选型 |
|------|----------|
| 框架 | Electron（VS Code fork） |
| 后端语言 | TypeScript + gRPC 服务 |
| 前端 | React + Monaco |
| 通信 | localhost gRPC（protobuf） |
| 服务发现 | extension_server_port + 端口偏移 |
| AI集成 | LanguageServerService + ApiServerService |

**核心设计**: VS Code fork + 本地 gRPC 微服务架构。

---

## 二、框架选型分析

### 2.1 候选方案对比

| 维度 | Electron | Tauri | 原生开发 |
|------|----------|-------|----------|
| 语言匹配 | TypeScript/React（完美匹配） | TypeScript前端 + Rust后端 | Swift/C#/Kotlin |
| 内存占用 | 150-300MB | 15-30MB | 最优 |
| 包体积 | 150-250MB | 12-25MB | 最小 |
| 启动速度 | 1-3s | 200-500ms | 最快 |
| 生态成熟度 | 最成熟（10年+） | 较新（3年） | 最成熟 |
| 现有代码复用 | 95%+ | 70% | 20% |
| 竞品验证 | Codex/Cursor/Windsurf/VS Code | 少数应用 | 无同类竞品 |
| 跨平台 | 全平台 | 全平台 | 需三套代码 |

### 2.2 最终选型：Electron + React

**理由：**

1. **代码复用最大化** — claude-code 全栈 TypeScript/React，Electron 可直接复用
2. **竞品验证** — Codex、Cursor、Windsurf、VS Code 全部使用 Electron
3. **现有资产** — RCS Web UI 已有 React 19 + Vite + Radix UI + Tailwind 的完整组件库（45个组件）
4. **OpenAI Codex 架构模式** — "Electron 包装 CLI" 模式完美适配 claude-code 现有架构
5. **团队效率** — 不引入新语言（无需 Rust/Swift/Kotlin 学习成本）

**性能优化策略（弥补 Electron 天生缺陷）:**
- 进程分离：AI 计算在独立 Worker 进程
- 懒加载：非首屏功能延迟加载
- 原生模块：性能关键路径用 bun:ffi 调用 Rust/C
- V8 快照：预编译启动脚本加速启动

---

## 三、现有代码资产盘点（可直接复用）

### 3.1 后端（100% 复用）

| 模块 | 路径 | 桌面App中的角色 |
|------|------|----------------|
| AI 对话引擎 | src/query.ts, src/QueryEngine.ts | 核心 — AI对话处理 |
| 工具系统 | packages/builtin-tools/ (59个工具) | 核心 — 文件操作/Shell/Agent |
| API 多模型 | src/services/api/ (7个provider) | 核心 — 多模型切换 |
| MCP 协议 | packages/mcp-client/ | 核心 — 外部工具集成 |
| Workflow 引擎 | packages/workflow-engine/ | 核心 — 确定性任务编排 |
| Computer Use | packages/@ant/computer-use-mcp/ | 核心 — 桌面操作 |
| Recorder | packages/@ant/computer-use-recorder/ | 核心 — 录制/回放 |
| Skill 学习 | src/services/skillLearning/ | 核心 — 技能自动学习 |
| ACP 协议 | src/services/acp/ | 扩展 — Agent通信 |
| Bridge | src/bridge/ | 扩展 — 远程控制 |

### 3.2 前端 Web UI（90% 复用）

RCS Web UI 已有的组件（`packages/remote-control-server/web/`）:

| 类别 | 组件 | 桌面App用途 |
|------|------|------------|
| 对话 | ChatView, ChatInput, MessageBubble | 主对话界面 |
| AI展示 | code-block, reasoning, tool, shimmer | AI输出渲染 |
| 权限 | PermissionPanel | 工具权限确认 |
| 计划 | PlanView | 任务计划展示 |
| 会话 | SessionSidebar, ThreadHistory | 多会话管理 |
| 命令 | CommandMenu | 命令面板 |
| 模型 | ModelSelectorPopover | 模型切换 |
| UI基础 | button, card, dialog, input, tabs 等 | 全局复用 |

**技术栈完全一致**: React 19 + Vite + Radix UI + Tailwind CSS + Lucide Icons + Motion

### 3.3 需要新建的部分

| 模块 | 说明 |
|------|------|
| Electron Main Process | 窗口管理、IPC、系统菜单、自动更新 |
| IPC Bridge | Main↔Renderer 通信层 |
| 文件浏览器组件 | 项目文件树 |
| 终端集成组件 | 内嵌终端（xterm.js） |
| 编辑器组件 | 代码编辑（Monaco Editor） |
| 录制/回放UI | 录制状态、回放进度 |
| 系统托盘 | 后台运行 |
| 自动更新 | electron-updater |

---

## 四、目标产品形态

### 4.1 对标 Codex 的功能清单

| Codex 功能 | 对应实现 | 现有代码支撑 |
|------------|----------|-------------|
| 多项目并行 Agent | 多窗口/多标签 + 独立会话 | QueryEngine + 多会话 |
| 工作树（Worktree） | Git worktree 集成 | EnterWorktreeTool 已有 |
| 内置终端 | xterm.js 嵌入 | BashTool/PowerShellTool 已有 |
| 代码编辑 | Monaco Editor | 文件读写工具已有 |
| 自动化/Cron | 定时任务系统 | CronCreateTool 已有 |
| Skill/Plugin | 技能和插件市场 | Skill系统 + Plugin系统已有 |
| Record/Replay | 操作录制回放 | computer-use-recorder 已有 |
| 沙箱执行 | 安全隔离 | sandbox-runtime 已有 |
| OAuth 认证 | 多平台登录 | auth 模块已有 |
| Git 深度集成 | 版本控制 | git 工具已有 |

### 4.2 界面设计规范（Apple 级）

- **白底黑字** — 主背景 #FFFFFF，主文字 #1A1A1A
- **极简间距** — 8px 网格系统
- **SF Pro / Inter** — 系统字体优先
- **无多余装饰** — 功能即界面
- **动效克制** — 仅转场和状态变化使用 motion
- **暗色模式** — 支持但默认浅色
- **信息密度** — 向 Linear/Notion 看齐

---

## 五、架构设计

### 5.1 进程模型（对标 Codex 三层架构）

```
┌─────────────────────────────────────────────────┐
│              Electron Main Process              │
│  ┌──────────┐  ┌──────────┐  ┌──────────────┐  │
│  │ 窗口管理 │  │ IPC Hub  │  │ 系统集成     │  │
│  │          │  │(70+方法) │  │(菜单/托盘/更新)│ │
│  └──────────┘  └──────────┘  └──────────────┘  │
├─────────────────────────────────────────────────┤
│            Renderer Process (React)             │
│  ┌──────────────────────────────────────────┐   │
│  │ React 19 + Vite + Tailwind + Radix UI   │   │
│  │ ┌────────┐ ┌────────┐ ┌─────────────┐  │   │
│  │ │对话面板│ │编辑器  │ │终端面板     │  │   │
│  │ └────────┘ └────────┘ └─────────────┘  │   │
│  │ ┌────────┐ ┌────────┐ ┌─────────────┐  │   │
│  │ │文件树  │ │工具栏  │ │录制/回放UI  │  │   │
│  │ └────────┘ └────────┘ └─────────────┘  │   │
│  └──────────────────────────────────────────┘   │
├─────────────────────────────────────────────────┤
│             Backend Process (Bun)               │
│  ┌──────────────────────────────────────────┐   │
│  │ claude-code CLI 核心（完整复用）          │   │
│  │ QueryEngine + Tools + API + MCP + Skill  │   │
│  │ + Recorder + Workflow + Computer Use     │   │
│  └──────────────────────────────────────────┘   │
└─────────────────────────────────────────────────┘
```

### 5.2 IPC 通信设计（对标 Codex 70-method 模式）

```
IPC 方法分类:
├── session.*     — 会话管理（create/list/delete/switch）
├── chat.*        — 对话（send/stream/cancel/history）
├── file.*        — 文件操作（read/write/list/search）
├── terminal.*    — 终端（create/write/resize/kill）
├── git.*         — 版本控制（status/commit/diff/push）
├── tool.*        — 工具调用（permission/execute/result）
├── recorder.*    — 录制回放（start/stop/replay/list）
├── skill.*       — 技能（list/run/generate/delete）
├── model.*       — 模型（list/switch/config）
├── window.*      — 窗口（open/close/resize/state）
└── system.*      — 系统（update/menu/tray/preference）
```

### 5.3 数据持久化

| 数据类型 | 存储方案 | 理由 |
|----------|----------|------|
| 会话历史 | SQLite | 结构化查询、大量数据 |
| 用户配置 | JSON文件 | 简单、可读、可手动编辑 |
| 操作记忆 | JSON文件 | 已实现、无需迁移 |
| 技能数据 | 文件系统 | SKILL.md + workflow.js 已有 |
| 缓存 | SQLite | 快速读写、可清理 |
| 密钥 | 系统Keychain | 安全标准 |

---

## 六、与竞品的差异化优势

| 竞品 | 局限 | 我们的优势 |
|------|------|-----------|
| Codex | 仅限编程 | AI办公全覆盖（浏览器操作+桌面操作+编程） |
| Cursor | 仅限VS Code编辑 | 不限编辑器，任何桌面操作都能录制 |
| Windsurf | 仅限代码场景 | 支持非技术人员的日常办公操作 |
| RPA工具 | 需手动编写流程 | AI自动录制+智能回放+自动参数化 |

**核心差异化**: 唯一同时具备 "AI编程" + "操作录制" + "智能回放" + "跨应用自动化" 的桌面应用。

---

## 七、风险与对策

| 风险 | 对策 |
|------|------|
| Electron 体积大 | 增量更新 + ASAR 压缩 + 按需加载模块 |
| 内存占用高 | Worker进程分离 + 未激活标签冻结 |
| 启动慢 | V8快照 + 首屏骨架屏 + 后台预加载 |
| 跨平台兼容 | 复用 computer-use-input 已有的三平台后端 |
| 安全审核 | 沙箱 + 权限确认 + 密码脱敏 + Keychain |
