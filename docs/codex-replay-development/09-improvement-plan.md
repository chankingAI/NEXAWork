# Record/Replay 改进计划与开发提示词

> 本文档列出从"引擎完成"到"任何人都能一键使用"所需的全部开发工作。

---

## 一、改进优先级总览

| 优先级 | 任务 | 工作量 | 效果 |
|--------|------|--------|------|
| P0 | CLI命令注册到主程序 | 0.5天 | 用户可输入 `claude record/replay/generate` |
| P0 | CDP连接桥接 | 1天 | 录制器自动连接 Chrome 浏览器 |
| P1 | Feature Flag 门控 | 0.5天 | 通过 FEATURE_RECORDER=1 启用 |
| P1 | 回放前权限确认 | 0.5天 | 安全合规 |
| P2 | 终端UI状态组件 | 1天 | 录制/回放进度可视化 |
| P2 | Skill系统对接 | 0.5天 | 生成的Skill被claude-code自动发现 |
| P3 | MCP Tool暴露 | 1天 | 其他Agent可调用录制/回放 |
| P3 | 桌面录制真实连接 | 2天 | 通过FFI连接系统事件（当前为平台命令行） |

**总计预估：7天（1人）**

---

## 二、P0 — CLI 命令注册（让用户能用）

### 改进 Prompt 4.1 — 注册 record/replay/generate 子命令

```
任务：将 @ant/computer-use-recorder 的 CLI 命令注册到 claude-code 主程序中。

现有代码参考：
- src/main.tsx — Commander.js 注册所有子命令的位置（约6981行）
- src/main.tsx 第1276行 — '--replay-user-messages' 选项（证明主程序已有replay概念）
- packages/@ant/computer-use-recorder/src/cli.ts — 已定义的命令接口

要求：
1. 在 src/main.tsx 中注册三个新子命令：
   - `claude record` — 启动操作录制
   - `claude replay` — 回放已录制的操作
   - `claude generate` — 从录制生成 Skill
2. 子命令通过 feature('RECORDER') 门控
3. 复用 cli.ts 中已定义的 handleRecordCommand/handleReplayCommand/handleGenerateCommand
4. record 命令需连接到 computer-use-mcp 的 CDP 实例

集成约束：
- 遵循现有 Commander.js 注册模式（参考 'mcp'/'server' 等子命令）
- 使用 lazy import（动态 import() 而非顶部 import）
- 不修改现有的 --replay-user-messages 选项
```

### 改进 Prompt 4.2 — 创建 RECORDER Feature Flag

```
任务：创建 RECORDER feature flag 并确保功能在 flag 关闭时无任何开销。

现有代码参考：
- scripts/defines.ts — feature flag 定义位置
- build.ts — build 默认启用的 features 列表
- src/types/internal-modules.d.ts — feature 函数类型声明

要求：
1. 在 scripts/defines.ts 中添加 'RECORDER' 到 feature 列表
2. 在 build.ts 默认 features 中添加 'RECORDER'（默认启用）
3. 所有 recorder 相关代码路径使用 feature('RECORDER') 包裹
4. Flag 关闭时：无 import、无内存占用、无 CLI 命令注册

集成约束：
- 遵循现有 feature flag 模式（import { feature } from 'bun:bundle'）
- 环境变量 FEATURE_RECORDER=0 可完全禁用
```

---

## 三、P0 — CDP 连接桥接（让录制能工作）

### 改进 Prompt 4.3 — 连接录制器到 Chrome CDP

```
任务：让 CdpRecorder 自动连接到 computer-use-mcp 管理的 Chrome 实例。

现有代码参考：
- packages/@ant/computer-use-mcp/src/executor.ts — CDP 连接管理
- packages/@ant/computer-use-mcp/src/tools.ts — computer_use_start 工具
- packages/@ant/computer-use-recorder/src/cdpRecorder.ts — CdpRecorder 的 CdpClient 接口

要求：
1. 创建 src/services/recorder/cdpBridge.ts：
   - 获取 computer-use-mcp 的 CDP WebSocket 端点
   - 创建 CdpClient 适配器（将 computer-use-mcp 的 CDP 连接包装为 CdpRecorder 需要的接口）
   - 提供 screenshot 回调（复用 computer-use-mcp 的截图能力）
2. 在 `claude record` 命令中：
   - 自动启动 Chrome（如果未运行）
   - 建立 CDP 连接
   - 传入 CdpRecorder 开始录制
   - Ctrl+C 时保存录制数据到 JSON 文件

集成约束：
- 复用 computer-use-mcp 现有的 CDP 连接逻辑
- 不引入新依赖
- 连接失败时给出清晰错误提示
```

---

## 四、P1 — 权限与安全

### 改进 Prompt 4.4 — 回放前权限确认

```
任务：回放执行前展示操作摘要并要求用户确认。

现有代码参考：
- src/components/permissions/ — 现有权限确认 UI
- src/types/permissions.ts — 权限类型定义
- packages/workflow-engine/src/ports.ts — TaskRegistrar.pendingAction 机制

要求：
1. 回放前展示操作列表摘要（将要执行什么）
2. 用户按 Enter 确认 / Ctrl+C 取消
3. 危险操作（删除/提交/支付等关键词）高亮警告
4. 支持 --yes 参数跳过确认（自动化场景）

集成约束：
- 复用现有 permissions 组件样式
- 遵循 claude-code 现有的权限交互模式
```

---

## 五、P2 — 终端 UI 与 Skill 系统

### 改进 Prompt 4.5 — 录制/回放状态UI组件

```
任务：在终端中显示录制和回放的实时状态。

现有代码参考：
- packages/@ant/ink/ — Ink UI 框架
- src/components/design-system/ProgressBar.tsx — 进度条组件
- src/components/ — 组件注册模式

要求：
1. 创建 RecordingIndicator 组件：
   - 显示 "● Recording..." + 经过时间 + 事件计数
   - 红色闪烁点表示正在录制
2. 创建 ReplayProgress 组件：
   - 进度条 + 当前步骤描述 + 成功/失败计数
   - 自愈恢复时显示恢复策略
3. 创建 SkillList 组件：
   - 列出 .claude/skills/ 下所有已生成的 Skill
   - 显示名称/描述/最后使用时间

集成约束：
- 使用 Ink 现有 ThemeProvider 的颜色
- 组件可嵌入 REPL.tsx 主界面
```

### 改进 Prompt 4.6 — Skill 系统对接

```
任务：让生成的 Skill 被 claude-code 的 Skill 加载系统自动发现。

现有代码参考：
- src/skills/bundledSkills.ts — Skill 注册/加载
- src/services/skillLearning/ — Skill 学习系统
- .claude/skills/ — Skill 文件存储位置

要求：
1. generateSkill() 输出格式对齐 bundledSkills.ts 的加载格式
2. 新生成的 Skill 自动注册到运行中的 claude-code 实例
3. 用户可通过 `/skill list` 查看所有录制生成的 Skill
4. 用户可通过 `/skill run <name>` 直接执行

集成约束：
- 复用现有 Skill 系统，不另建体系
- SKILL.md 格式遵循现有规范（含 frontmatter）
```

---

## 六、P3 — MCP 与系统级

### 改进 Prompt 4.7 — MCP Tool 暴露

```
任务：将 record/replay/generate 作为 MCP Tool 暴露给外部 Agent。

现有代码参考：
- packages/@ant/computer-use-mcp/src/tools.ts — MCP tool 注册模式
- packages/@ant/computer-use-mcp/src/types.ts — tool schema 定义

要求：
1. 注册 3 个新 MCP tool：
   - recorder_start — 开始录制
   - recorder_stop — 停止录制并返回文件路径
   - recorder_replay — 回放指定录制或 Skill
2. Tool schema 使用 Zod 定义（与现有模式一致）
3. 支持通过 MCP 协议被 Claude Desktop 等客户端调用

集成约束：
- 复用 computer-use-mcp 的 tool 注册架构
- 遵循 MCP 协议规范（inputSchema/outputSchema）
```

### 改进 Prompt 4.8 — 桌面录制真实 FFI 连接

```
任务：将 desktopRecorder.ts 的平台命令行方案升级为真实 FFI 调用。

现有代码参考：
- packages/@ant/computer-use-input/src/ — 跨平台 FFI 实现（darwin.ts/win32.ts/linux.ts）
- packages/@ant/computer-use-recorder/src/desktopRecorder.ts — 当前基于命令行进程

要求：
1. Linux: 从 xinput 进程解析 → libinput/X11 事件 via bun:ffi
2. macOS: 从 JXA bridge → CGEvent tap via native module
3. Windows: 从 PowerShell 脚本 → SetWindowsHookEx via DLL
4. 保留命令行方案作为 fallback（FFI 不可用时自动降级）

集成约束：
- 复用 computer-use-input 的 InputBackend 接口模式
- 使用 bun:ffi 而非 node-addon-api
- 必须非阻塞（事件循环不被阻塞）
```

---

## 七、完成后的用户体验

### 最终目标场景

```bash
# 安装
bun install -g claude-code-best

# 配置 API Key
export ANTHROPIC_API_KEY=sk-ant-...

# 启动 claude-code
claude

# 在交互界面中：
> /record --task "下载月度报表"
● Recording... (press Ctrl+C to stop)
  [14 events captured, 00:32 elapsed]

> (用户在浏览器中操作...)
> Ctrl+C

✓ Recording saved: .claude/skills/download-monthly-report/recording.json
✓ Skill generated: download-monthly-report
  - 8 steps (navigate → login → click report → select date → download)
  - Variables detected: {month: "2026-06", report_type: "sales"}

# 第二天...
> /skill run download-monthly-report --month 2026-07
▸ Replaying: download-monthly-report (8 steps)
  [████████████████████░░░░] 80% — Step 7/8: Downloading...
  ✓ Recovered: element relocated via visual match (step 4)
✓ Replay complete — Quality: 95/100
```

---

## 八、开发顺序建议

```
第 1 天: Prompt 4.1 (CLI注册) + Prompt 4.2 (Feature Flag)
第 2 天: Prompt 4.3 (CDP桥接)
第 3 天: Prompt 4.4 (权限确认) + Prompt 4.6 (Skill对接)
第 4 天: Prompt 4.5 (UI组件)
第 5-7天: Prompt 4.7 (MCP) + Prompt 4.8 (FFI升级)
```

每个 Prompt 完成后必须通过：
- `bunx tsc --noEmit` — 零 TypeScript 错误
- `bun run lint` — 零 lint 问题
- `bun test` — 所有测试通过
- 新功能附带对应测试用例
