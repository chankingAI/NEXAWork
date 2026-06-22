# Codex Replay/Record 能力开发计划

> 基于 chankingAI/claude-code 现有代码分析，补齐用户示教学习（User Demonstration Learning）能力，实现"用户操作一次 → 自动录制 → 生成 Skill → 精确回放"的完整链路。

---

## 一、现有代码基础能力盘点

### 1.1 已具备的核心模块

| 模块 | 路径 | 能力 |
|------|------|------|
| **Skill Learning** | `src/services/skillLearning/` | 运行时观察(runtimeObserver)、工具事件钩子(toolEventObserver)、本能(Instinct)提取、技能生成(skillGenerator)、技能演化(evolution)、生命周期管理(skillLifecycle) |
| **Workflow Engine** | `packages/workflow-engine/` | 确定性脚本编排、Journal日志、Agent调度、并发控制、进度事件、命名工作流 |
| **Computer Use MCP** | `packages/@ant/computer-use-mcp/` | 截图、鼠标/键盘模拟、应用访问控制、坐标系统、teach_step/teach_batch 教学模式 |
| **Computer Use Input** | `packages/@ant/computer-use-input/` | 跨平台(darwin/win32/linux)键鼠模拟后端 |
| **Bundled Skills** | `src/skills/bundledSkills.ts` | 技能注册/提取/加载框架 |
| **Hooks System** | `src/utils/hooks/postSamplingHooks.ts` | 后采样钩子，可挂载自定义处理逻辑 |
| **MCP Client** | `packages/mcp-client/` | MCP协议客户端，可连接任意MCP服务器 |
| **Agent Tools** | `packages/agent-tools/` | SubAgent工具集 |

### 1.2 已有但需扩展的能力

| 能力 | 现状 | 缺口 |
|------|------|------|
| teach_step/teach_batch | 仅向用户展示操作步骤（教学模式），不录制用户操作 | 需反向：录制用户操作生成 teach 序列 |
| toolEventObserver | 记录 tool 调用事件，但仅限于 CLI 工具 | 需扩展到桌面/浏览器操作事件 |
| skillGenerator | 从 Instinct 生成 SKILL.md | 需从 Action Sequence 直接生成可执行 Workflow Script |
| workflow-engine | 执行 JS 脚本编排 | 需增加从录制事件自动生成脚本的能力 |
| computer-use-mcp | 执行桌面操作 | 需增加操作录制（反向捕获）能力 |

### 1.3 完全缺失的能力

1. **Action Recorder Layer** — 用户桌面/浏览器操作的实时捕获
2. **Action-to-Workflow Converter** — 原始事件 → 结构化工作流
3. **Variable Abstraction Engine** — 硬编码值 → 参数化变量
4. **Replay Verification Engine** — 回放后的状态验证
5. **操作记忆持久化** — 跨会话的操作模式记忆

---

## 二、需要借鉴的开源项目及其核心价值

### 2.1 OpenAdapt（录制层）

- **仓库**: https://github.com/OpenAdaptAI/OpenAdapt
- **核心价值**: 用户桌面操作录制的完整实现
- **关键代码参考**:
  - `legacy/openadapt/record.py` — 多进程录制架构：屏幕捕获进程 + 鼠标/键盘事件进程 + 窗口事件进程 + 浏览器事件进程
  - `legacy/openadapt/models.py` — 数据模型：Recording、ActionEvent、Screenshot、WindowEvent、BrowserEvent
  - `legacy/openadapt/replay.py` — 策略化回放框架（Strategy Pattern）
  - `legacy/openadapt/strategies/` — 多种回放策略：naive（直接回放）、visual（视觉匹配）、stateful（状态感知）
  - `legacy/openadapt/events.py` — 事件处理和合并
- **技术要点**:
  - 使用 pynput 进行键盘/鼠标监听
  - 多进程架构保证录制不卡顿
  - Recording 包含完整的环境元数据（分辨率、平台、时间戳）
  - 策略模式让回放可以适应不同场景

### 2.2 Browser Use（浏览器操作层）

- **仓库**: https://github.com/browser-use/browser-use
- **核心价值**: CDP 驱动的浏览器自动化 + AI Agent 决策
- **关键代码参考**:
  - `browser_use/browser/watchdogs/recording_watchdog.py` — CDP 屏幕录制（startScreencast/stopScreencast）
  - `browser_use/browser/watchdogs/har_recording_watchdog.py` — 网络请求 HAR 录制（完整的请求/响应捕获）
  - `browser_use/tools/views.py` — 结构化操作定义：ClickElementAction、InputTextAction、NavigateAction、SearchAction
  - `browser_use/agent/service.py` — Agent 编排循环
  - `browser_use/dom/service.py` — DOM 快照和元素定位
- **技术要点**:
  - 事件驱动架构（bubus EventBus）
  - CDP 实现零侵入录制
  - 结构化 Action 模型（Pydantic BaseModel）
  - DOM 元素索引系统（element index）

### 2.3 UI-TARS Desktop（桌面 AI 操作）

- **仓库**: https://github.com/bytedance/UI-TARS-desktop
- **核心价值**: 多模态 AI 驱动的桌面操作
- **关键代码参考**:
  - `apps/ui-tars/src/main/agent/operator.ts` — NutJS + Electron 桌面操作算子：截图(desktopCapturer)、点击、拖拽、输入
  - ACTION_SPACES 定义 — click/double_click/right_click/drag/hotkey/type/scroll/wait/finished/call_user
  - 坐标系统 — `[x1, y1, x2, y2]` 边界框模式
- **技术要点**:
  - NutJS 跨平台桌面自动化
  - Electron desktopCapturer 截图
  - 边界框坐标而非绝对像素坐标（更鲁棒）

### 2.4 Playwright（浏览器录制回放）

- **仓库**: https://github.com/microsoft/playwright
- **核心价值**: 企业级浏览器操作录制与精确回放
- **关键能力**:
  - `codegen` — 录制用户浏览器操作并生成可回放脚本
  - 选择器策略 — 多层级选择器（role > text > testId > css）确保回放稳定性
  - HAR 录制 — 网络层完整录制
  - Trace Viewer — 操作轨迹可视化
- **对本项目的价值**: 浏览器操作的录制和回放直接可用，已被 browser-use 项目验证

### 2.5 Mem0（记忆层）

- **仓库**: https://github.com/mem0ai/mem0
- **核心价值**: AI 应用长期记忆管理
- **关键代码参考**:
  - `mem0/memory/main.py` — Memory 类：add/search/update/delete 操作
  - 向量搜索 + BM25 混合检索
  - 实体抽取 + 关系图谱
- **对本项目的价值**: 技能使用频率、用户习惯、操作上下文的长期记忆

---

## 三、开发架构设计

### 3.1 整体架构（基于现有代码扩展）

```
用户桌面操作
    ↓ [Action Recorder Layer - 新增]
packages/@ant/computer-use-recorder/
    ↓ 原始事件流 (RawActionEvent[])
src/services/actionCapture/
    ↓ [Action-to-Workflow Converter - 新增]
src/services/workflowBuilder/
    ↓ 结构化工作流 (WorkflowScript)
packages/workflow-engine/ [已有，扩展]
    ↓ [Variable Abstraction - 新增]
src/services/skillLearning/ [已有，扩展]
    ↓ 参数化 Skill
.claude/skills/<generated>/ [已有格式]
    ↓ [Replay Engine - 基于已有扩展]
packages/@ant/computer-use-mcp/ [已有，扩展]
    ↓ [Verification Engine - 新增]
src/services/replayVerification/
```

### 3.2 核心模块设计

#### 模块 A: Action Recorder（操作录制器）

**位置**: `packages/@ant/computer-use-recorder/`

**职责**: 捕获用户在桌面/浏览器中的所有操作事件

**实现方式参考**:
- 桌面层: 参考 OpenAdapt 的 pynput 监听 + 参考 UI-TARS 的 NutJS/Electron desktopCapturer
- 浏览器层: 参考 Browser Use 的 CDP 事件监听 + Playwright codegen
- 现有集成点: 扩展 `packages/@ant/computer-use-mcp/` 的 executor，增加反向监听模式

**输出格式**: RawActionEvent 数组（参考现有 `computer_batch` 的 BATCH_ACTION_ITEM_SCHEMA 格式）

**设计要点**:
- 录制时不干扰用户操作（参考 OpenAdapt 的多进程架构）
- 同步录制截图快照（参考 Browser Use 的 RecordingWatchdog）
- 记录窗口/应用上下文（参考 OpenAdapt 的 WindowEvent）
- 支持开始/暂停/停止控制

#### 模块 B: Workflow Builder（工作流构建器）

**位置**: `src/services/workflowBuilder/`

**职责**: 将原始事件流转换为结构化工作流

**实现参考**:
- 事件合并: 参考 OpenAdapt 的 `events.py`（连续输入合并为单次 type、双击检测、拖拽合并）
- 意图理解: 利用 Claude API（现有 `src/services/api/claude.ts`）分析事件序列意图
- 输出格式: 兼容 `packages/workflow-engine/` 的 WorkflowScript 格式

**设计要点**:
- 原始事件 → 语义动作（click→navigate, type→fill_form）
- 利用截图+DOM快照推断操作意图
- 生成可读的 meta.phases 描述

#### 模块 C: Variable Abstraction（变量抽象引擎）

**位置**: `src/services/workflowBuilder/variableAbstraction.ts`

**职责**: 将硬编码值抽象为可参数化的变量

**实现参考**:
- 参考 OpenAdapt 的 strategies（不同策略处理不同类型的参数化）
- 利用 Claude API 分析哪些值应该被参数化
- 参考 Browser Use 的 `variable_detector.py`

**设计要点**:
- 检测输入内容中的变量（日期、名称、数量等）
- 坐标 → 元素选择器（提升回放鲁棒性）
- 生成 WorkflowInput schema（复用现有 `packages/workflow-engine/src/tool/schema.ts`）

#### 模块 D: Skill Generator（从工作流生成技能）

**位置**: 扩展 `src/services/skillLearning/skillGenerator.ts`

**职责**: 从构建好的工作流生成可复用 Skill

**现有基础**:
- 已有 `generateSkillDraft()` 从 Instinct 生成 Skill
- 已有 `writeLearnedSkill()` 写入 `.claude/skills/` 目录
- 已有 `generateOrMergeSkillDraft()` 处理去重

**需扩展**:
- 增加从 WorkflowScript 直接生成 Skill 的路径
- Skill 内容包含 workflow 脚本引用
- 集成 `registerBundledSkill()` 的 `files` 机制存储工作流脚本

#### 模块 E: Replay Engine（回放引擎）

**位置**: 扩展 `packages/@ant/computer-use-mcp/` + `packages/workflow-engine/`

**职责**: 精确执行已录制的操作序列

**现有基础**:
- `computer_batch` 已实现批量操作执行
- `teach_step/teach_batch` 已实现步骤执行 + 截图反馈
- `workflow-engine` 已实现 Journal 日志 + 断点恢复

**需扩展**:
- 增加"回放模式"：按录制序列执行操作
- 利用截图对比验证每步执行结果
- 元素定位自适应（坐标 → 视觉匹配 → 可访问性名称）
- 异常处理和自动恢复

#### 模块 F: Verification Engine（验证引擎）

**位置**: `src/services/replayVerification/`

**职责**: 验证回放结果与录制时一致

**实现参考**:
- 参考现有 `packages/@ant/computer-use-mcp/src/pixelCompare.ts`（像素级比对）
- 参考 Browser Use 的 DOM 快照比较
- 利用 Claude Vision 进行语义级验证

**设计要点**:
- 截图对比（pixel diff + 结构相似度）
- DOM/窗口状态对比
- 语义级验证（"表单已提交"vs"表单未提交"）
- 验证失败时的回滚/重试策略

---

## 四、开发阶段规划

### 第一阶段：浏览器操作录制与回放（4周）

**目标**: 用户在浏览器中操作一次，系统录制并能精确回放

**具体任务**:

1. **扩展 computer-use-mcp 增加 CDP 录制能力**
   - 基于文件: `packages/@ant/computer-use-mcp/src/`
   - 参考: Browser Use 的 `recording_watchdog.py` 和 `har_recording_watchdog.py`
   - 新增: CDP 事件监听（click/input/navigation/network），输出结构化 ActionEvent

2. **实现浏览器事件 → Workflow 转换**
   - 基于: `packages/workflow-engine/src/engine/script.ts` 的 ParsedScript 格式
   - 新增: `src/services/workflowBuilder/browserWorkflowBuilder.ts`
   - 事件合并逻辑: 连续 type → 单次输入, click+navigate → goto

3. **实现基于 workflow-engine 的浏览器回放**
   - 复用: `packages/workflow-engine/src/engine/runWorkflow.ts`
   - 复用: `computer_batch` 的 action 执行路径
   - 新增: 回放专用 AgentRunner（不需 LLM，直接执行脚本）

4. **基础验证**
   - 复用: `pixelCompare.ts` 的截图对比
   - 新增: 回放后截图 vs 录制时截图的对比判定

**交付物**:
- 新增 `packages/@ant/computer-use-recorder/` package
- 新增录制命令: `claude record start` / `claude record stop`
- 新增回放命令: `claude replay <skill-name>`
- 生成 Skill 文件包含 workflow script

### 第二阶段：桌面软件操作录制与回放（4周）

**目标**: 扩展到任意桌面应用（ERP/OA/Office 等）

**具体任务**:

1. **实现跨平台桌面事件捕获**
   - 基于: `packages/@ant/computer-use-input/` 的 dispatcher 架构
   - 参考: OpenAdapt 的 pynput 监听 + UI-TARS 的 NutJS
   - 新增: 反向监听模式（现有代码是发送事件，需增加接收事件）
   - 平台适配: darwin(CGEvent) / win32(SetWindowsHookEx) / linux(Xlib/libinput)

2. **实现应用上下文感知**
   - 参考: OpenAdapt 的 WindowEvent 模型
   - 复用: `computer-use-mcp` 的 app 管理（open_application/request_access）
   - 新增: 录制时自动记录当前窗口、应用、标题

3. **实现视觉匹配回放策略**
   - 参考: OpenAdapt 的 `strategies/visual.py`
   - 参考: UI-TARS 的边界框坐标模式
   - 利用: Claude Vision 进行元素定位（截图→找到目标元素→生成坐标）

4. **实现 Windows 辅助功能集成**
   - 复用: 现有 `click_element`/`type_into_element` 工具（已有 UI Automation 支持）
   - 扩展: 录制时记录元素的 accessible name/role/automationId

**交付物**:
- 桌面操作录制支持（Windows/macOS/Linux）
- 视觉+辅助功能双重定位策略
- 应用上下文感知的 Skill 生成

### 第三阶段：智能化与记忆层（4周）

**目标**: 操作参数化、长期记忆、自我优化

**具体任务**:

1. **变量抽象与参数化**
   - 利用现有: `src/services/api/claude.ts` 调用 Claude 分析操作中的变量
   - 扩展: `src/services/skillLearning/` 增加参数化逻辑
   - 输出: 带 inputs schema 的 Workflow Script

2. **集成记忆层**
   - 参考: Mem0 的 Memory 架构（add/search/update）
   - 扩展: 现有 `src/services/skillLearning/observationStore.ts`
   - 新增: 操作模式记忆、技能使用频率、上下文关联

3. **自适应回放优化**
   - 复用: `workflow-engine` 的 Journal 机制（已支持断点恢复）
   - 新增: 回放失败时的自动修复策略（重新定位元素、等待加载、重试）
   - 利用: Claude API 在回放异常时动态调整策略

4. **技能自动演化**
   - 复用: 现有 `src/services/skillLearning/evolution.ts`
   - 扩展: 多次录制同一任务 → 提取通用模式 → 优化 Skill
   - 集成: `checkPromotion()` 机制自动提升技能置信度

**交付物**:
- 参数化 Skill（用户输入变量后自动执行）
- 跨会话操作记忆
- 自适应回放引擎

---

## 五、关键设计原则

### 5.1 数据流设计

```
录制阶段:
用户操作 → RawActionEvent[] → WorkflowScript → Skill (SKILL.md + .workflow.js)

回放阶段:
Skill → WorkflowScript → workflow-engine → computer-use-mcp → 桌面/浏览器操作 → Verification
```

### 5.2 与现有架构的集成点

| 集成点 | 现有模块 | 集成方式 |
|--------|----------|----------|
| 录制启动 | CLI entrypoint (`src/entrypoints/cli.tsx`) | 新增 `record` subcommand |
| 事件捕获 | `computer-use-mcp` executor | 增加反向监听模式 |
| 事件存储 | `skillLearning/observationStore.ts` | 扩展 StoredSkillObservation 类型 |
| 工作流生成 | `workflow-engine/script.ts` | 新增 Script 生成器 |
| 技能注册 | `skills/bundledSkills.ts` | 复用 registerBundledSkill |
| 回放执行 | `workflow-engine/runWorkflow.ts` | 新增 Replay AgentRunner |
| 操作执行 | `computer-use-mcp/toolCalls.ts` | 复用 dispatchAction |
| 结果验证 | `computer-use-mcp/pixelCompare.ts` | 扩展语义验证 |
| Feature Gate | `feature('RECORDER')` | 新增 feature flag |

### 5.3 安全设计

- 录制前必须获得用户明确授权（复用 `request_access` 的权限模型）
- 录制数据本地存储，不上传（复用 `getClaudeConfigHomeDir()` 路径）
- 敏感信息自动脱敏（密码输入不录制明文）
- 回放前二次确认（复用 permissions UI）

### 5.4 错误处理

- 录制中断: 保存已录制片段，支持续录
- 回放失败: Journal 记录失败点，支持从断点恢复（已有机制）
- 元素定位失败: 降级策略链（精确坐标 → 视觉匹配 → Claude Vision → 用户干预）

---

## 六、技术风险与缓解

| 风险 | 概率 | 影响 | 缓解措施 |
|------|------|------|----------|
| 跨平台桌面事件捕获兼容性 | 高 | 高 | 优先实现 Windows（已有 UI Automation），逐步扩展 |
| 回放时UI布局变化导致失败 | 高 | 中 | 多策略回退（坐标→视觉→AI→人工） |
| 录制事件量大影响性能 | 中 | 中 | 采用 OpenAdapt 的多进程架构 |
| 变量抽象不准确 | 中 | 低 | 支持用户手动标注变量 |
| 复杂应用状态难以验证 | 中 | 中 | 截图对比 + 语义验证双重保障 |

---

## 七、验收标准

### 第一阶段验收
- [ ] 用户在浏览器中执行"搜索→筛选→导出"流程，系统完整录制
- [ ] 录制生成的 Skill 可在 `.claude/skills/` 中查看
- [ ] 执行回放命令可精确重现操作序列
- [ ] 回放后验证结果与录制一致

### 第二阶段验收
- [ ] 支持录制 Windows 桌面应用操作
- [ ] 支持录制 Office/ERP 类应用的表单操作
- [ ] 回放可适应窗口位置/大小变化

### 第三阶段验收
- [ ] 录制的操作可参数化（如"搜索手机"→"搜索{keyword}"）
- [ ] 多次录制同一任务可自动优化 Skill
- [ ] 回放异常时可自动修复并继续
