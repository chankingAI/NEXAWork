# 架构集成详解 — 从现有代码到完整 Record/Replay 能力

> 精确说明每个新增模块如何与现有代码对接，避免推倒重来。

---

## 一、现有代码精确对接关系

### 1.1 录制层 → 现有 computer-use-mcp 的对接

**现有代码入口**: `packages/@ant/computer-use-mcp/src/toolCalls.ts`

```
现有 toolCalls.ts 逻辑：
  外部请求 → 安全检查 → dispatchAction() → executor.方法() → 执行操作 → 返回截图

需要增加的录制模式：
  用户操作 → [新] eventListener → [新] 事件缓冲 → 转换为与 dispatchAction 相同格式 → 存储
```

**关键对接点**:
- dispatchAction 的 action 格式已经是标准化的结构（action name + params）
- 录制器输出必须产生相同格式的 action 序列
- 这样录制的输出可以直接由 dispatchAction 回放，无需格式转换

**现有 BATCH_ACTION_ITEM_SCHEMA**（来自 tools.ts）:
```
{action: 'left_click', coordinate: [x, y]}
{action: 'type', text: 'hello'}
{action: 'key', text: 'Return'}
{action: 'scroll', coordinate: [x, y], direction: 'down', amount: 3}
{action: 'mouse_move', coordinate: [x, y]}
{action: 'left_click_drag', start_coordinate: [x1,y1], coordinate: [x2,y2]}
```

录制器只需产生上述格式 + timestamp + screenshot，即可直接用于回放。

### 1.2 回放层 → 现有 workflow-engine 的对接

**现有代码入口**: `packages/workflow-engine/src/engine/runWorkflow.ts`

```
现有 workflow-engine 执行流程：
  WorkflowScript (JS module)
    → parseScript() 解析出 meta + default function
    → createEngineContext() 准备运行环境
    → hooks.agent(prompt) 调用 AgentRunner
    → AgentRunner → Claude API → 工具调用 → 返回结果
    → Journal 记录每步结果
    → ProgressEmitter 报告进度

回放模式需要的修改：
  WorkflowScript (录制生成的 JS module)
    → parseScript() [不变]
    → createEngineContext() [不变]
    → hooks.agent(prompt) [不变]
    → [新] ReplayAgentRunner → 解析 prompt 中的操作指令 → 直接执行 → 不调用 Claude API
    → Journal [不变]
    → ProgressEmitter [不变]
```

**关键设计**: 通过替换 AgentRunner 实现回放模式，其余所有机制（Journal、Progress、Budget、Concurrency）全部复用。

**现有 AgentRunner 接口**（来自 ports.ts）:
```
type AgentRunner = {
  runAgentToResult(params: AgentRunParams, host: HostHandle): Promise<AgentRunResult>
}
```

ReplayAgentRunner 实现相同接口，但不调用 LLM，而是解析 prompt 中嵌入的操作指令直接执行。

### 1.3 技能生成 → 现有 skillLearning 的对接

**现有代码入口**: `src/services/skillLearning/skillGenerator.ts`

```
现有 Skill 生成流程：
  Observations → analyzeWithActiveBackend() → InstinctCandidate[] → upsertInstinct()
    → autoEvolveLearnedSkills() → generateSkillDraft() → writeLearnedSkill()
    → .claude/skills/<name>/SKILL.md

需要增加的直接生成路径：
  RecordingSession → WorkflowBuilder → WorkflowScript
    → [新] generateWorkflowSkill() → writeWorkflowSkill()
    → .claude/skills/<name>/SKILL.md + workflow.js
```

**现有 SKILL.md 格式**:
```yaml
---
name: skill-name
description: 描述
---
# 技能内容（Prompt 文本）
```

**扩展格式** (增加 workflow 引用):
```yaml
---
name: recorded-skill-name
description: 从录制生成的操作技能
origin: recorded-workflow
workflow: ./workflow.js
inputs:
  keyword: { type: string, description: '搜索关键词', default: '手机' }
---
# 此技能通过录制生成
# 执行时自动运行 workflow.js 中定义的操作序列
```

### 1.4 录制控制 → 现有 CLI 的对接

**现有代码入口**: `src/entrypoints/cli.tsx`

```
现有快速路径判断逻辑：
  const arg = process.argv[2]
  switch(arg) {
    case 'mcp': ...
    case 'server': ...
    case 'ssh': ...
    // 新增:
    case 'record': return handleRecord()
    case 'replay': return handleReplay()
  }
```

**现有 Feature Flag 模式**（来自 build.ts）:
```
feature('FLAG_NAME') — 通过 FEATURE_FLAG_NAME=1 环境变量启用
```

录制功能使用: `feature('RECORDER')` / `FEATURE_RECORDER=1`

---

## 二、数据流详细设计

### 2.1 录制阶段数据流

```
[用户操作浏览器]
      │
      ▼ CDP Events (注入 document listener / DOM mutation observer)
[cdpRecorder.ts]  ←── 参考 browser-use/recording_watchdog.py
      │
      │ 输出: RawActionEvent[]
      │   {action:'left_click', coordinate:[340,128], timestamp:1719066000123,
      │    screenshot_before: 'base64...', window_context:{app:'Chrome', title:'淘宝', url:'...'}}
      │
      ▼
[eventMerger.ts]  ←── 参考 OpenAdapt/events.py 事件合并
      │
      │ 输出: MergedActionEvent[]
      │   连续 type → 单个 type(text:'搜索手机')
      │   click+type → focus_and_input
      │
      ▼
[scriptGenerator.ts]  ←── 输出兼容 workflow-engine/script.ts
      │
      │ 输出: WorkflowScript (JavaScript module string)
      │   export const meta = {name:'淘宝搜索手机', phases:[...]}
      │   export default async function(hooks) {
      │     await hooks.agent('navigate to taobao.com')
      │     await hooks.agent('click search box and type 手机')
      │     ...
      │   }
      │
      ▼
[variableAbstraction.ts]  ←── Claude API 分析参数化
      │
      │ 输出: ParameterizedScript + InputSchema
      │   args.keyword 替代硬编码 '手机'
      │
      ▼
[skillWriter.ts]  ←── 复用 skillGenerator.ts 的写入逻辑
      │
      │ 输出:
      │   .claude/skills/taobao-search/SKILL.md
      │   .claude/skills/taobao-search/workflow.js
      │
      ▼
[Done] 技能已就绪
```

### 2.2 回放阶段数据流

```
[用户执行: claude replay taobao-search --keyword 手机壳]
      │
      ▼
[replayCoordinator.ts]  ←── 加载 skill 目录
      │
      │ 读取: .claude/skills/taobao-search/workflow.js
      │ 注入: args = {keyword: '手机壳'}
      │
      ▼
[workflow-engine/runWorkflow.ts]  ←── 已有机制，不修改
      │
      │ 执行 workflow script
      │ 每步调用 hooks.agent(prompt)
      │
      ▼
[ReplayAgentRunner]  ←── 新实现，符合 AgentRunner 接口
      │
      │ 解析 prompt → 提取操作指令 → 调用 computer-use-mcp
      │
      ▼
[computer-use-mcp/dispatchAction]  ←── 已有机制，不修改
      │
      │ 执行实际桌面/浏览器操作
      │ 返回截图
      │
      ▼
[verification.ts]  ←── 截图对比 + 状态验证
      │
      │ 对比当前截图与录制时截图
      │ 通过 → 继续下一步
      │ 不通过 → 触发 recovery 策略
      │
      ▼
[Journal 记录]  ←── 复用 workflow-engine journal
      │
      ▼
[Done] 回放完成，报告结果
```

---

## 三、现有 Skill Learning 系统的扩展方案

### 3.1 现有流程（不修改）

```
toolEventObserver → recordToolStart/Complete → StoredSkillObservation
      ↓
runtimeObserver → observationsFromMessages → analyzeWithActiveBackend
      ↓
InstinctCandidate → upsertInstinct → Instinct (trigger+action+confidence)
      ↓
autoEvolveLearnedSkills → generateSkillDraft → LearnedSkillDraft
      ↓
writeLearnedSkill → .claude/skills/
```

### 3.2 新增的直接录制路径（与现有并行）

```
[录制器] → RawActionEvent[] → eventMerger → scriptGenerator
      ↓
[新] generateWorkflowSkill(script, meta) → WorkflowSkillDraft
      ↓
[新] writeWorkflowSkill() → .claude/skills/<name>/{SKILL.md, workflow.js}
```

### 3.3 两条路径的汇合点

| 现有路径产物 | 录制路径产物 | 共享 |
|-------------|-------------|------|
| SKILL.md (文本描述) | SKILL.md (含 workflow 引用) | 相同目录结构、相同加载机制 |
| 基于 Instinct 演化 | 基于多次录制优化 | 共享 evolution.ts 的置信度提升 |
| observationStore | operationMemory | 共享存储根目录 |

---

## 四、Feature Flag 与渐进式开发

### 4.1 Feature Gate 设计

```
feature('RECORDER')         — 总开关
feature('RECORDER_BROWSER') — 浏览器录制子开关
feature('RECORDER_DESKTOP') — 桌面录制子开关（第二阶段）
feature('REPLAY_VISUAL')    — 视觉匹配回放（第二阶段）
feature('REPLAY_MEMORY')    — 记忆层集成（第三阶段）
```

### 4.2 环境变量

```
FEATURE_RECORDER=1          — 启用录制/回放总功能
FEATURE_RECORDER_BROWSER=1  — 启用浏览器录制
FEATURE_RECORDER_DESKTOP=1  — 启用桌面录制
FEATURE_REPLAY_VISUAL=1     — 启用视觉匹配
FEATURE_REPLAY_MEMORY=1     — 启用记忆层
```

---

## 五、包依赖关系

```
packages/@ant/computer-use-recorder/
  ├── 依赖: @anthropic-ai/sdk (API 调用)
  ├── 依赖: @anthropic-ai/computer-use-mcp (类型复用)
  └── 依赖: @anthropic-ai/computer-use-input (底层输入)

src/services/workflowBuilder/
  ├── 依赖: packages/workflow-engine/ (类型和 parseScript)
  └── 依赖: src/services/api/claude.ts (变量抽象 LLM 调用)

src/services/replayEngine/
  ├── 依赖: packages/workflow-engine/ (runWorkflow)
  ├── 依赖: packages/@ant/computer-use-mcp/ (操作执行)
  └── 依赖: packages/@ant/computer-use-recorder/ (类型)

src/commands/record/
  ├── 依赖: packages/@ant/computer-use-recorder/
  └── 依赖: src/services/workflowBuilder/

src/commands/replay/
  └── 依赖: src/services/replayEngine/
```

---

## 六、测试策略

### 6.1 单元测试

| 模块 | 测试重点 | 测试方式 |
|------|---------|----------|
| eventMerger | 事件合并逻辑 | 输入 RawActionEvent[] → 验证输出 |
| scriptGenerator | 脚本格式正确性 | 生成脚本 → parseScript() 验证 |
| variableAbstraction | 变量检测准确性 | Mock Claude API → 验证变量标注 |
| ReplayAgentRunner | 指令解析 | 输入 prompt → 验证调用 dispatchAction 参数 |

### 6.2 集成测试

| 场景 | 验证 |
|------|------|
| 录制浏览器搜索 | RawActionEvent 包含完整操作序列 |
| 事件→脚本转换 | 生成的 WorkflowScript 可被 runWorkflow 执行 |
| 回放简单流程 | dispatchAction 收到正确参数 |
| 端到端回放 | 录制→生成 Skill→回放 全链路 |

### 6.3 验收测试

| 用例 | 步骤 | 验证 |
|------|------|------|
| 浏览器搜索录制回放 | 录制在淘宝搜索"手机"→回放搜索"平板" | 搜索结果页正确显示 |
| 表单填写录制回放 | 录制填写注册表单→回放用不同数据填写 | 表单提交成功 |
| 多步骤操作 | 录制完整购物流程→回放 | 每步操作正确执行 |
