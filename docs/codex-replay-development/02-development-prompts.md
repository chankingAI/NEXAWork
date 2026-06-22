# 开发提示词文档 — Codex Replay/Record 能力实现

> 本文档提供逐阶段、逐模块的精确开发提示词。每个 Prompt 对应一个可独立实现的开发任务，从现有代码出发，确保可落地执行。

---

## 使用说明

- 每个 Prompt 已包含：现有代码路径、参考项目路径、期望输出、集成约束
- 开发时按编号顺序执行，后续 Prompt 依赖前序产出
- 所有新增代码必须通过 `bunx tsc --noEmit`（零 TypeScript 错误）
- 所有新增代码必须遵循 `bun run lint` 的 Biome 规则

---

## 第一阶段 Prompts（浏览器操作录制与回放）

### Prompt 1.1 — 创建 Action Recorder Package 基础结构

```
任务：在 packages/@ant/ 下创建 computer-use-recorder package，建立操作录制的基础架构。

现有代码参考：
- packages/@ant/computer-use-mcp/package.json — 参考包结构和依赖声明方式
- packages/@ant/computer-use-mcp/src/types.ts — 参考类型定义风格
- packages/@ant/computer-use-mcp/src/tools.ts — 参考 BATCH_ACTION_ITEM_SCHEMA 中已有的 action 类型定义

开源项目参考：
- /home/ubuntu/OpenAdapt/legacy/openadapt/record.py — 多进程录制架构，Event namedtuple 定义
- /home/ubuntu/browser-use/browser_use/browser/watchdogs/recording_watchdog.py — CDP screencast 录制

要求：
1. 创建 packages/@ant/computer-use-recorder/package.json（workspace 包，依赖 @anthropic-ai/sdk）
2. 创建 src/types.ts — 定义 RawActionEvent 类型，字段参考现有 BATCH_ACTION_ITEM_SCHEMA 扩展：
   - action: 复用现有 enum（key/type/mouse_move/left_click/...）
   - coordinate/text/scroll_direction 等参数
   - 新增: timestamp(number), screenshot_before(string|null), screenshot_after(string|null)
   - 新增: window_context: {app_name, window_title, url?}
   - 新增: element_context?: {accessible_name?, role?, selector?}
3. 创建 src/types.ts — 定义 RecordingSession 类型：
   - id: string
   - startTime/endTime: number
   - events: RawActionEvent[]
   - metadata: {platform, screen_width, screen_height, task_description?}
4. 创建 src/index.ts 导出所有类型

不要写实现代码，只写类型定义和包结构。
保证 bunx tsc --noEmit 通过。
```

### Prompt 1.2 — 实现浏览器 CDP 事件录制器

```
任务：实现基于 CDP 的浏览器操作录制，捕获用户在 Chrome 中的点击、输入、导航等操作。

现有代码参考：
- packages/@ant/computer-use-mcp/src/executor.ts — 已有的 CDP 连接和截图实现
- packages/@ant/computer-use-mcp/src/toolCalls.ts — dispatchAction 的事件格式
- packages/@ant/claude-for-chrome-mcp/ — Chrome 浏览器控制

开源项目参考：
- /home/ubuntu/browser-use/browser_use/browser/watchdogs/har_recording_watchdog.py — CDP Network/Page 域事件监听模式
- /home/ubuntu/browser-use/browser_use/browser/watchdogs/recording_watchdog.py — CDP screencastFrame 捕获
- /home/ubuntu/browser-use/browser_use/tools/views.py — ClickElementAction/InputTextAction 结构化操作模型

要求：
1. 在 packages/@ant/computer-use-recorder/src/ 创建 cdpRecorder.ts
2. 实现 CDP 域监听（参考 browser-use 的 har_recording_watchdog.py 监听模式）：
   - Input.dispatchMouseEvent（被动监听用户鼠标操作）— 注意 CDP 的 Input 域无被动监听，需使用 DOM.event + Page.ScreencastFrame 结合推断
   - 替代方案：注入 document-level event listener via Runtime.evaluate（点击/输入/滚动）
   - Page.frameNavigated（页面导航事件）
   - Page.screencastFrame（定期截图）
3. 事件转换为 RawActionEvent 格式（与 Prompt 1.1 定义的类型对齐）
4. 实现 start()/stop()/pause() 控制方法
5. 截图采用增量策略：操作发生时截图，非操作期间低频截图

集成约束：
- CDP 连接方式复用 computer-use-mcp 已有的连接机制
- 截图格式复用 computer-use-mcp 的 imageResize.ts 处理
- 事件输出格式必须与 BATCH_ACTION_ITEM_SCHEMA 兼容
```

### Prompt 1.3 — 实现事件流到 Workflow Script 的转换

```
任务：将录制的 RawActionEvent[] 转换为 workflow-engine 可执行的 WorkflowScript。

现有代码参考：
- packages/workflow-engine/src/types.ts — WorkflowMeta, AgentRunParams 类型
- packages/workflow-engine/src/engine/script.ts — parseScript() 函数定义的脚本格式
- packages/workflow-engine/src/engine/hooks.ts — agent() hook 的调用方式
- packages/workflow-engine/src/engine/runWorkflow.ts — RunWorkflowOptions 格式

开源项目参考：
- /home/ubuntu/OpenAdapt/legacy/openadapt/events.py — 事件合并逻辑（连续按键→字符串, 双击检测）
- /home/ubuntu/browser-use/browser_use/tools/views.py — 语义化 Action 类型（NavigateAction, InputTextAction）

要求：
1. 创建 src/services/workflowBuilder/index.ts
2. 创建 src/services/workflowBuilder/eventMerger.ts — 原始事件合并：
   - 连续 type 事件 → 单个 type(text) action（参考 OpenAdapt 的字符合并）
   - click + 后续 type → 聚焦并输入
   - 连续快速 click → double_click
   - mouse_move 序列 → 保留最终位置或识别为 drag
3. 创建 src/services/workflowBuilder/scriptGenerator.ts — 生成 workflow-engine 格式脚本：
   - 输出 JavaScript 字符串（workflow-engine 的 parseScript 期望 JS 模块）
   - export const meta = {name, description, phases}
   - export default async function(hooks) { ... }
   - 内部通过 hooks.agent() 调用执行各步骤
4. 创建 src/services/workflowBuilder/types.ts — WorkflowBuildOptions 类型

集成约束：
- 生成的脚本必须能被 packages/workflow-engine/src/engine/script.ts 的 parseScript() 正确解析
- Agent 调用的 prompt 格式必须包含 computer-use-mcp 可执行的操作指令
```

### Prompt 1.4 — 实现 Skill 生成与注册

```
任务：从生成的 WorkflowScript 创建可复用的 Skill 文件，注册到 Claude Code 技能系统。

现有代码参考：
- src/services/skillLearning/skillGenerator.ts — generateSkillDraft(), writeLearnedSkill(), getLearnedSkillPath()
- src/skills/bundledSkills.ts — registerBundledSkill() 和 BundledSkillDefinition（尤其 files 字段）
- src/skills/loadSkillsDir.ts — 从磁盘加载 SKILL.md
- packages/workflow-engine/src/tool/WorkflowTool.ts — createWorkflowTool()

开源项目参考：
- /home/ubuntu/OpenAdapt/legacy/openadapt/strategies/ — Strategy Pattern（不同回放策略）

要求：
1. 扩展 src/services/skillLearning/skillGenerator.ts：
   - 新增 generateWorkflowSkillDraft(script: string, meta: WorkflowMeta, options) 函数
   - 生成的 SKILL.md 内容包含：frontmatter(name, description, origin:'recorded-workflow')
   - Skill 目录同时包含 workflow.js 文件（录制生成的脚本）
2. 扩展写入逻辑：
   - 复用现有 writeLearnedSkill() 的目录创建逻辑
   - 额外写入 workflow.js 到 skill 目录下
3. 注册逻辑：
   - 录制完成后调用现有 clearCommandsCache() 刷新命令缓存
   - 通过 clearSkillIndexCache() 刷新技能索引
4. 用户可通过 /skill-name 调用录制的技能进行回放

集成约束：
- SKILL.md 格式必须与现有 loadSkillsDir.ts 兼容
- Skill 的 getPromptForCommand 需要加载并执行 workflow.js
- 必须走 feature('RECORDER') 门控
```

### Prompt 1.5 — 实现回放引擎

```
任务：基于 workflow-engine 和 computer-use-mcp 实现录制操作的精确回放。

现有代码参考：
- packages/workflow-engine/src/engine/runWorkflow.ts — runWorkflow() 完整执行流程
- packages/workflow-engine/src/ports.ts — AgentRunner 接口
- packages/@ant/computer-use-mcp/src/toolCalls.ts — dispatchAction() 操作执行
- packages/@ant/computer-use-mcp/src/tools.ts — computer_batch 批量执行

开源项目参考：
- /home/ubuntu/OpenAdapt/legacy/openadapt/replay.py — 策略化回放框架
- /home/ubuntu/OpenAdapt/legacy/openadapt/strategies/naive.py — 直接回放（坐标重放）
- /home/ubuntu/OpenAdapt/legacy/openadapt/strategies/visual.py — 视觉匹配回放

要求：
1. 创建 src/services/replayEngine/index.ts
2. 实现 ReplayAgentRunner（符合 workflow-engine 的 AgentRunner 接口）：
   - 不调用 LLM，直接解析 prompt 中的操作指令并执行
   - 通过 MCP 调用 computer-use-mcp 的 tool 执行实际操作
   - 每步执行后截图，与录制时截图对比验证
3. 创建 src/services/replayEngine/coordinator.ts：
   - 加载 Skill 目录下的 workflow.js
   - 构建 RunWorkflowOptions
   - 启动 runWorkflow()
4. 创建 src/services/replayEngine/verification.ts：
   - 利用现有 pixelCompare.ts 的截图对比
   - 允许一定容差（UI 动画、时间显示等）
   - 验证失败时记录日志并决定是否继续

集成约束：
- 复用 workflow-engine 的 Journal 机制实现断点恢复
- 复用 workflow-engine 的 ProgressEmitter 报告回放进度
- 回放时的权限检查复用 computer-use-mcp 的 allowlist 机制
```

### Prompt 1.6 — 实现 CLI 命令入口

```
任务：在 Claude Code CLI 中添加 record/replay 命令入口。

现有代码参考：
- src/entrypoints/cli.tsx — main() 函数中的命令分发（快速路径模式）
- src/main.tsx — Commander.js CLI 定义（program.command() 注册方式）
- 现有 subcommand 模式：mcp/server/ssh/auth/plugin 等

要求：
1. 在 src/entrypoints/cli.tsx 的快速路径中添加 record/replay 判断：
   - `record [start|stop|list|delete]` — 录制管理
   - `replay <skill-name> [--dry-run] [--verbose]` — 执行回放
2. 在 src/main.tsx 中注册完整命令定义：
   - `claude record start [--description "任务描述"]` — 开始录制
   - `claude record stop` — 停止录制并生成 Skill
   - `claude record list` — 列出已录制的 Skills
   - `claude replay <name> [--input key=value]` — 执行回放（支持传入参数）
3. Feature gate: 所有命令走 `feature('RECORDER')` 判断
4. 命令处理器在独立文件 src/commands/record/ 和 src/commands/replay/ 中实现

集成约束：
- 遵循现有 CLI 快速路径模式（零模块加载路径 → 按需动态 import）
- 遵循现有 Commander.js 命令注册风格
- Feature flag 名称: RECORDER（需添加到 build.ts 的默认 features 列表）
```

---

## 第二阶段 Prompts（桌面软件操作录制）

### Prompt 2.1 — 实现跨平台桌面事件捕获

```
任务：实现 Windows/macOS/Linux 的桌面操作事件监听。

现有代码参考：
- packages/@ant/computer-use-input/src/ — 跨平台 dispatcher 架构（darwin/win32/linux 后端）
- packages/@ant/computer-use-mcp/src/executor.ts — 平台检测和条件加载

开源项目参考：
- /home/ubuntu/OpenAdapt/legacy/openadapt/record.py — pynput keyboard.Listener + mouse.Listener 模式
- /home/ubuntu/OpenAdapt/legacy/openadapt/capture/ — 平台特定捕获（_windows.py, _macos.py, _linux.py）
- /home/ubuntu/UI-TARS-desktop/apps/ui-tars/src/main/agent/operator.ts — NutJS + Electron 桌面捕获

要求：
1. 在 packages/@ant/computer-use-recorder/src/ 创建 desktopRecorder.ts
2. 实现平台 dispatcher（参考 computer-use-input 的模式）：
   - Windows: 使用 node-global-key-listener 或 FFI 调用 SetWindowsHookEx
   - macOS: 使用 CGEvent tap 通过 FFI
   - Linux: 使用 libinput 或 X11 事件通过 FFI
3. 捕获事件类型（参考 OpenAdapt 的 Event namedtuple）：
   - 鼠标: move, click(left/right/middle), scroll, drag
   - 键盘: keydown, keyup, type
   - 窗口: focus_change, title_change
4. 事件增强：
   - 每次操作附带当前窗口信息（app_name, window_title）
   - 关键操作时触发截图（参考 OpenAdapt 的 screen 事件进程）

集成约束：
- 复用 computer-use-input 的 dispatcher/backend 架构模式
- 输出格式与 Prompt 1.1 的 RawActionEvent 一致
- 使用 Bun FFI（bun:ffi）而非 node-addon-api
```

### Prompt 2.2 — 实现 Windows UI Automation 元素捕获

```
任务：录制时同步捕获被操作元素的辅助功能信息，提升回放鲁棒性。

现有代码参考：
- packages/@ant/computer-use-mcp/src/tools.ts — click_element/type_into_element 工具已有 UI Automation 支持
  （accessible name, role, automationId 字段）

开源项目参考：
- /home/ubuntu/UI-TARS-desktop/apps/ui-tars/src/main/agent/operator.ts — ACTION_SPACES 定义的操作空间

要求：
1. 扩展 RawActionEvent 的 element_context 字段：
   - accessible_name: string — 元素名称
   - role: string — 控件类型（Button/Edit/Link等）
   - automationId: string — 唯一标识
   - bounding_box: [x1, y1, x2, y2] — 边界框（参考 UI-TARS）
2. 在点击/输入事件发生时：
   - Windows: 通过 UI Automation COM API 查询光标下元素
   - macOS: 通过 Accessibility API 查询
   - Linux: 通过 AT-SPI2 查询
3. 回放时优先使用 element_context 定位，坐标作为 fallback

集成约束：
- 元素查询必须异步，不阻塞事件录制主循环
- 复用 computer-use-mcp 现有 click_element 的 UI Automation 调用路径
```

### Prompt 2.3 — 实现视觉匹配回放策略

```
任务：当坐标回放失败或元素定位失败时，使用视觉匹配定位目标。

现有代码参考：
- packages/@ant/computer-use-mcp/src/pixelCompare.ts — 已有的像素比对实现
- packages/@ant/computer-use-mcp/src/imageResize.ts — 图像缩放处理
- packages/color-diff-napi/ — 颜色差异计算

开源项目参考：
- /home/ubuntu/OpenAdapt/legacy/openadapt/strategies/visual.py — 视觉匹配回放策略
- /home/ubuntu/UI-TARS-desktop/ — 多模态视觉理解

要求：
1. 创建 src/services/replayEngine/visualMatcher.ts
2. 实现定位策略链（按优先级）：
   - Level 1: 辅助功能定位（accessible_name + role）
   - Level 2: 坐标相对定位（相对于窗口/特定元素的比例坐标）
   - Level 3: 视觉模板匹配（录制时截图裁剪 → 当前截图搜索）
   - Level 4: Claude Vision（发送当前截图 + 描述 → 返回坐标）
3. 每个级别失败后自动降级到下一级别
4. 支持 dry-run 模式（只定位不执行，用于调试）

集成约束：
- Claude Vision 调用复用 src/services/api/claude.ts 的现有 API 客户端
- 截图处理复用 computer-use-mcp 的 imageResize.ts
- 定位结果格式兼容 dispatchAction 的 coordinate 参数
```

---

## 第三阶段 Prompts（智能化与记忆层）

### Prompt 3.1 — 实现变量抽象引擎

```
任务：分析录制的操作序列，识别可参数化的变量并生成带输入 schema 的 Skill。

现有代码参考：
- packages/workflow-engine/src/tool/schema.ts — workflowInputSchema 定义（z.object）
- src/services/skillLearning/learningPolicy.ts — 学习策略（何时生成技能）
- src/services/api/claude.ts — Claude API 调用方式

开源项目参考：
- /home/ubuntu/browser-use/browser_use/agent/variable_detector.py — 变量检测

要求：
1. 创建 src/services/workflowBuilder/variableAbstraction.ts
2. 实现变量检测逻辑：
   - 分析所有 type action 的 text 内容
   - 利用 Claude API 判断哪些是变量（日期、名称、数量、搜索词等）
   - 利用上下文推断变量含义（前后元素 label）
3. 生成参数 schema：
   - 输出 Zod schema（与 workflow-engine 的 workflowInputSchema 格式一致）
   - 变量命名语义化（keyword, date, quantity 而非 var1, var2）
4. 改写 workflow script：
   - 硬编码值替换为 args.variableName 引用
   - 保留原始值作为默认值

集成约束：
- 输出 schema 必须兼容 packages/workflow-engine/src/tool/schema.ts 的 WorkflowInput
- Claude API 调用使用现有的 services/api 层
- 变量抽象是可选步骤，用户可选择跳过
```

### Prompt 3.2 — 实现操作记忆层

```
任务：实现跨会话的操作模式记忆，记录用户习惯和技能使用情况。

现有代码参考：
- src/services/skillLearning/observationStore.ts — 已有的观察存储（appendObservation, readObservations）
- src/services/skillLearning/instinctStore.ts — 已有的本能存储（confidence, evidence）
- src/services/skillLearning/projectContext.ts — 项目上下文解析

开源项目参考：
- /home/ubuntu/mem0/mem0/memory/main.py — Memory 类的 add/search/update/delete 接口
- /home/ubuntu/mem0/mem0/memory/storage.py — SQLite 持久化

要求：
1. 扩展 src/services/skillLearning/observationStore.ts：
   - 新增 'recorded_action' 事件类型
   - 存储录制的操作模式（哪些操作经常一起出现）
2. 创建 src/services/skillLearning/operationMemory.ts：
   - 记录技能使用次数和成功率
   - 记录常用参数值（用户最近搜索的关键词等）
   - 记录操作时间模式（每天几点做什么）
3. 与现有 Instinct 系统集成：
   - 录制的操作模式 → 生成 Instinct
   - 通过 checkPromotion() 自动提升技能置信度
4. 记忆检索：
   - 支持按相似操作模式搜索
   - 支持按时间/项目/应用筛选

集成约束：
- 存储路径复用 getSkillLearningRoot()
- 数据格式兼容现有 StoredSkillObservation 类型
- 搜索/检索不依赖外部服务（本地 JSON + 简单相似度）
```

### Prompt 3.3 — 实现自适应回放与自愈

```
任务：回放过程中遇到异常时自动调整策略并恢复执行。

现有代码参考：
- packages/workflow-engine/src/engine/journal.ts — Journal 断点恢复机制
- packages/workflow-engine/src/engine/hooks.ts — agent() 重试逻辑
- packages/workflow-engine/src/ports.ts — TaskRegistrar 的 pendingAction (skip/retry)

开源项目参考：
- /home/ubuntu/OpenAdapt/legacy/openadapt/strategies/stateful.py — 状态感知回放

要求：
1. 扩展 src/services/replayEngine/verification.ts：
   - 定义验证失败类型（element_not_found, wrong_state, timeout, unexpected_dialog）
   - 每种失败类型对应恢复策略
2. 创建 src/services/replayEngine/recovery.ts：
   - element_not_found → 尝试视觉匹配 → 尝试 Claude Vision → 等待重试
   - wrong_state → 截图分析当前状态 → 动态生成修复操作
   - timeout → 增加等待时间 → 刷新页面 → 重试
   - unexpected_dialog → 检测弹窗 → 自动关闭 → 继续
3. 集成 workflow-engine 的 Journal：
   - 成功步骤记录到 Journal
   - 恢复后从最近成功点继续
4. 回放报告：
   - 记录每步执行时间/成功/失败/恢复
   - 生成回放质量评分

集成约束：
- 恢复逻辑通过 workflow-engine 的 TaskRegistrar.pendingAction 触发
- Claude API 调用（状态分析）复用现有 services/api 层
- 最大重试次数可配置，超出后暂停等待用户确认
```

---

## 通用开发约束（适用于所有 Prompt）

### TypeScript 约束
- strict mode 必须通过（bunx tsc --noEmit 零错误）
- 不使用 Any/getattr/setattr
- 所有新文件导入声明放在顶部
- 使用现有项目中的类型而非重新定义

### 架构约束
- 新功能必须通过 feature('RECORDER') 门控
- 不修改现有测试使其通过
- 优先编辑现有文件而非创建新文件
- 遵循现有代码风格（通过 bun run lint 验证）

### 包管理约束
- 新 package 必须加入 bun workspace
- 依赖声明使用 workspace:* 引用内部包
- 不引入项目中未使用的新外部依赖（优先复用已有库）

### 安全约束
- 录制内容不得包含明文密码（检测到密码输入框时记录 [PASSWORD_REDACTED]）
- 录制数据存储在用户本地，不上传
- 回放前必须经过权限确认
