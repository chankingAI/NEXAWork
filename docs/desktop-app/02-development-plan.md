# 桌面端应用开发计划

> 从现有 claude-code 代码出发，分阶段构建对标 Codex 的桌面 AI 办公应用。

---

## 阶段总览

| 阶段 | 周期 | 目标 | 产出 |
|------|------|------|------|
| Phase 1 | 第1-2周 | 最小可用桌面App | 能对话的桌面窗口 |
| Phase 2 | 第3-4周 | 核心功能集成 | 文件/终端/编辑器 |
| Phase 3 | 第5-6周 | Record/Replay 集成 | 操作录制+回放 |
| Phase 4 | 第7-8周 | 产品化打磨 | 自动更新+安装包+性能优化 |

---

## Phase 1：最小可用桌面App（第1-2周）

### 目标
一个 Electron 窗口，内嵌现有 RCS Web UI 的对话界面，连接 claude-code 后端。

### 里程碑

| 天 | 任务 | 验收标准 |
|----|------|----------|
| D1 | Electron 项目脚手架 | `bun run dev:desktop` 启动窗口 |
| D2 | Main Process + IPC 基础 | 窗口↔后端通信正常 |
| D3 | 集成 ChatView 组件 | 输入消息→AI回复→显示结果 |
| D4 | 集成 API Provider | 选择模型→发送→流式显示 |
| D5 | 多会话管理 | 新建/切换/删除会话 |
| D6 | 系统菜单+快捷键 | Cmd+N新窗口、Cmd+W关闭 |
| D7 | 浅色/深色主题 | 白底黑字默认 + 暗色可选 |

### 技术决策

- 包位置：`packages/desktop/`
- 构建：Vite + electron-vite
- IPC：preload script + contextBridge（安全模式）
- 状态管理：Zustand（与主项目一致）
- 路由：React Router v7（SPA模式）

### 依赖关系

```
packages/desktop/
├── 复用 remote-control-server/web/components/ (对话UI组件)
├── 复用 remote-control-server/web/components/ui/ (基础组件库)
├── 调用 src/QueryEngine.ts (AI对话引擎)
├── 调用 src/services/api/ (API多模型)
└── 调用 src/tools.ts (工具注册)
```

---

## Phase 2：核心功能集成（第3-4周）

### 目标
具备 Codex/Cursor 核心能力：文件浏览、代码编辑、终端、Git。

### 里程碑

| 天 | 任务 | 验收标准 |
|----|------|----------|
| D8 | 文件浏览器面板 | 展示项目文件树，点击打开文件 |
| D9 | Monaco Editor 集成 | 语法高亮、自动补全 |
| D10 | 终端面板（xterm.js） | 在App内执行Shell命令 |
| D11 | 分面板布局 | 可调整大小的三栏布局 |
| D12 | 工具权限UI | 工具执行前确认 |
| D13 | Git 状态集成 | 显示变更、diff、commit |
| D14 | 命令面板（Cmd+K） | 全局搜索+命令执行 |

### 复用计划

| 功能 | 复用来源 | 新建比例 |
|------|----------|----------|
| 文件操作 | FileReadTool/FileWriteTool/GlobTool | 后端0%，前端UI新建 |
| 终端 | BashTool/PowerShellTool | 后端0%，xterm.js集成新建 |
| 编辑器 | Monaco（npm包） | 全新集成 |
| Git | 现有git工具 | 后端0%，前端UI新建 |
| 布局 | react-resizable-panels（已有依赖） | 组合新建 |
| 命令面板 | cmdk（已有依赖） | 扩展 |

---

## Phase 3：Record/Replay 集成（第5-6周）

### 目标
将 computer-use-recorder 完整集成为桌面App功能，非技术人员可一键录制。

### 里程碑

| 天 | 任务 | 验收标准 |
|----|------|----------|
| D15 | 录制按钮+状态指示 | 点击红色按钮开始/停止录制 |
| D16 | CDP桥接（浏览器录制） | 录制Chrome操作 |
| D17 | 桌面录制连接 | 录制非浏览器操作 |
| D18 | 回放面板 | 选择录制→预览步骤→执行回放 |
| D19 | 技能管理界面 | 列表/编辑/删除/运行 Skill |
| D20 | 变量参数化UI | 回放前填入变量值 |
| D21 | 回放进度+自愈状态 | 实时显示回放状态和恢复操作 |

### 关键集成点

```
Electron Main Process
  ├── CDP连接管理 (连接Chrome DevTools)
  ├── 桌面事件监听 (系统级hook)
  └── 文件IO (保存/加载录制数据)

Renderer Process
  ├── RecordButton组件 (开始/暂停/停止)
  ├── ReplayPanel组件 (选择+参数+执行)
  ├── SkillManager组件 (CRUD)
  └── ProgressView组件 (进度+自愈状态)

Backend Process
  ├── CdpRecorder (事件捕获)
  ├── DesktopRecorder (桌面捕获)
  ├── EventMerger + WorkflowBuilder (处理)
  ├── SkillGenerator (生成)
  ├── ReplayEngine + AdaptiveReplayEngine (回放)
  └── OperationMemoryStore (记忆)
```

---

## Phase 4：产品化打磨（第7-8周）

### 目标
达到可发布品质：安装包、自动更新、性能优化、用户引导。

### 里程碑

| 天 | 任务 | 验收标准 |
|----|------|----------|
| D22 | 自动更新系统 | electron-updater + GitHub Releases |
| D23 | 安装包构建 | macOS(.dmg) + Windows(.exe) + Linux(.AppImage) |
| D24 | 启动性能优化 | 冷启动 <2s |
| D25 | 内存优化 | 空闲 <200MB |
| D26 | 新用户引导（Onboarding） | 首次启动教程 |
| D27 | 错误追踪+遥测 | Sentry + 匿名使用统计 |
| D28 | 端到端测试 | Playwright E2E 全流程 |

### 发布要求

- 代码签名：macOS (Apple Developer) + Windows (Code Signing)
- 公证：macOS Notarization
- 自动更新：检查更新 → 下载 → 重启应用
- 安装体验：DMG 拖拽安装 / EXE 一键安装
- 卸载干净：无残留文件

---

## 技术栈完整清单

### 桌面框架层
- Electron 33+ (Chromium + Node.js)
- electron-vite (构建工具)
- electron-builder (打包)
- electron-updater (自动更新)

### 前端 UI 层（复用+扩展 RCS Web UI）
- React 19
- Vite 6
- Tailwind CSS 4
- Radix UI (无障碍组件)
- Lucide React (图标)
- Motion (动画)
- Monaco Editor (代码编辑)
- xterm.js (终端)
- react-resizable-panels (布局)
- cmdk (命令面板)
- Zustand (状态管理)
- Shiki (语法高亮)

### 后端逻辑层（100% 复用 claude-code）
- Bun 运行时
- TypeScript 5.7+ (strict mode)
- Anthropic SDK
- MCP 协议
- Workflow Engine
- Computer Use Recorder
- Skill Learning System

### 数据层
- SQLite (better-sqlite3，会话历史+缓存)
- JSON 文件 (配置+技能+记忆)
- 系统 Keychain (密钥)

### 质量保障
- Biome (lint + format)
- TypeScript strict (类型安全)
- Playwright (E2E测试)
- bun:test (单元测试)
- Sentry (错误追踪)

---

## 人力资源建议

| 角色 | 人数 | 职责 |
|------|------|------|
| 全栈工程师 | 2-3 | Electron + React + 后端集成 |
| UI/UX 设计师 | 1 | Apple级视觉设计 + 交互 |
| QA | 1 | 跨平台测试 + E2E |

**最小团队**: 1名全栈工程师可在 8 周内完成 Phase 1-4（因为大量复用现有代码）。
