# 代码分析总结 — 现有系统能力精确评估

> 基于对 5 个仓库的实际代码阅读，精确记录每个模块的实现状态和可复用程度。

---

## 一、claude-code 关键文件实现状态

### src/services/skillLearning/ — 技能学习系统

| 文件 | 行数 | 状态 | 可复用度 |
|------|------|------|---------|
| `types.ts` | 109 | 完整 | 直接复用 — SkillObservation/Instinct/LearnedSkillDraft 类型 |
| `skillGenerator.ts` | 231 | 完整 | 扩展 — 增加 WorkflowScript→Skill 路径 |
| `runtimeObserver.ts` | 386 | 完整 | 参考 — 后采样钩子模式可用于录制后处理 |
| `toolEventObserver.ts` | 312 | 完整 | 扩展 — 增加桌面操作事件类型 |
| `observationStore.ts` | - | 完整 | 扩展 — 增加 recorded_action 类型 |
| `instinctStore.ts` | - | 完整 | 直接复用 — 置信度/证据管理 |
| `evolution.ts` | - | 完整 | 直接复用 — 技能演化逻辑 |
| `skillLifecycle.ts` | - | 完整 | 直接复用 — 生命周期管理 |

**核心发现**:
- `toolEventObserver.ts` 中 `runToolCallWithSkillLearningHooks<T>()` 已实现 tool_start/tool_complete/tool_error 的记录，但注释标明 "TODO: currently not wired up" — 需要在 Tool.ts dispatch 中接入
- `runtimeObserver.ts` 中 `runSkillLearningPostSampling()` 有 LLM 调用节流机制（H5约束）：最少观察数、每会话调用上限、冷却间隔 — 录制场景也需要类似机制
- Instinct 到 Skill 的演化已完整：gather instincts → cluster → generate draft → dedup → write

### packages/workflow-engine/ — 工作流引擎

| 文件 | 行数 | 关键能力 |
|------|------|---------|
| `types.ts` | 130 | WorkflowMeta/AgentRunParams/JournalEntry/ProgressEvent |
| `ports.ts` | 149 | AgentRunner/WorkflowPorts — 依赖注入接口 |
| `engine/runWorkflow.ts` | 156 | 主执行器 — 解析脚本→恢复Journal→执行→事件 |
| `engine/hooks.ts` | 300 | agent()/phase()/workflow() hooks — Script API |
| `engine/journal.ts` | - | 断点恢复 — 完整的 replay-from-journal 实现 |
| `engine/script.ts` | - | JS 模块解析器 — parseScript() |
| `engine/concurrency.ts` | - | 并发控制 — semaphore 模式 |
| `engine/budget.ts` | - | Token 预算管理 |

**核心发现**:
- `runWorkflow.ts` 的 `resume` 选项已支持断点恢复（加载 Journal → 跳过已完成步骤）— 回放引擎可直接利用
- `hooks.ts` 的 `agent()` 函数包含 Journal 命中检测：如果 journal 中有缓存结果，直接返回不执行 — 这正是"确定性回放"所需的机制
- AgentRunner 是纯接口，替换为 ReplayAgentRunner 零侵入

### packages/@ant/computer-use-mcp/ — 计算机操作

| 文件 | 行数 | 关键能力 |
|------|------|---------|
| `tools.ts` | 1127 | 工具定义 — 含 teach_step/teach_batch/computer_batch |
| `toolCalls.ts` | 4474 | 操作分发 — dispatchAction + 安全门控 |
| `executor.ts` | - | 平台操作执行器 |
| `pixelCompare.ts` | - | 截图对比验证 |
| `types.ts` | - | CoordinateMode/AppGrant/TeachStepRequest |

**核心发现**:
- `teach_step`/`teach_batch` 已实现"展示操作步骤"模式 — 与"录制用户操作"互补（teach是系统→用户，record是用户→系统）
- `computer_batch` 的 BATCH_ACTION_ITEM_SCHEMA 已是标准化操作格式 — 录制器输出直接对齐此格式即可回放
- `dispatchAction()` 是所有操作的统一入口 — 回放只需调用此函数
- 安全门控（allowlist、frontmost检查、pixel validation）对回放同样适用

---

## 二、OpenAdapt 关键实现总结

### 录制架构（record.py — 1653行）

**多进程模型**:
```
主进程（协调）
  ├── screen 进程: 定时截图 + av 视频编码
  ├── action 进程: pynput keyboard.Listener + mouse.Listener
  ├── window 进程: 窗口焦点/标题变化
  └── browser 进程: WebSocket 接收浏览器事件
```

**事件格式**: `Event = namedtuple("Event", ("timestamp", "type", "data"))`

**事件类型**: screen, action, window, browser

**关键技术**:
- pynput 实现跨平台键鼠监听
- multiprocessing.Queue 进程间通信
- STOP_SEQUENCES 停止录制检测
- 内存统计和性能监控

### 数据模型（models.py — 1217行）

**Recording**:
- timestamp, monitor_width/height, platform, task_description
- 关联: action_events, screenshots, window_events, browser_events

**ActionEvent**:
- name (click/type/scroll/press/release)
- mouse_x, mouse_y, mouse_button
- key_char, key_vk (虚拟键码)
- timestamp
- 关联: screenshot, window_event, recording

### 回放策略（strategies/）

| 策略 | 文件 | 特点 |
|------|------|------|
| naive | naive.py | 直接按时间戳回放原始坐标 |
| visual | visual.py | 截图模板匹配 + 坐标偏移 |
| stateful | stateful.py | 状态机 + 当前状态决策 |
| visual_browser | visual_browser.py | 专门的浏览器视觉回放 |
| demo | demo.py | 演示用基础策略 |

---

## 三、Browser Use 关键实现总结

### CDP 录制（recording_watchdog.py — 223行）

**核心机制**:
- `Page.startScreencast(format, quality, maxWidth, maxHeight, everyNthFrame)` 启动帧捕获
- `on_screencastFrame(event)` 接收帧数据（base64 PNG）
- `Page.screencastFrameAck` 确认帧
- `VideoRecorderService` 编码为视频文件
- Tab 切换时自动切换 screencast 目标（`on_AgentFocusChangedEvent`）

### HAR 录制（har_recording_watchdog.py — 779行）

**CDP 域使用**:
- Network.enable → requestWillBeSent/responseReceived/dataReceived/loadingFinished/loadingFailed
- Page.enable → lifecycleEvent/frameNavigated
- 输出标准 HAR 1.2 JSON（含请求/响应头、body、timing）

### 操作模型（tools/views.py — 181行）

- ClickElementAction: index(DOM元素索引) + coordinate_x/y
- InputTextAction: index + text + clear(是否清空)
- NavigateAction: url + new_tab
- SearchAction: query + engine(duckduckgo/google/bing)
- ScrollAction: direction + amount（隐含在 service.py）

---

## 四、UI-TARS 关键实现总结

### 操作执行器（operator.ts — 105行）

**NutJSElectronOperator 继承 NutJSOperator**:
- screenshot(): Electron desktopCapturer.getSources → resize → base64
- 继承的操作方法: click/type/scroll/drag/hotkey 等

**ACTION_SPACES**:
- click(start_box='[x1,y1,x2,y2]') — 边界框模式
- type(content) — 输入
- scroll(start_box, direction) — 滚动
- hotkey(key) — 快捷键
- drag(start_box, end_box) — 拖拽
- wait() — 等待
- finished() — 任务完成
- call_user() — 请求帮助

**坐标系统**: [x1,y1,x2,y2] 边界框，取中心点执行

---

## 五、Mem0 关键实现总结

### Memory 核心（memory/main.py — 3537行）

**主要接口**:
- `add(messages, user_id, metadata)` — 从消息中提取并存储记忆
- `search(query, user_id, limit)` — 混合检索（向量 + BM25 + 重排序）
- `update(memory_id, data)` — 更新记忆
- `delete(memory_id)` — 删除
- `get_all(user_id)` — 获取所有记忆

**技术架构**:
- 向量存储: 支持 Qdrant/ChromaDB/Pinecone/Milvus 等
- 本地存储: SQLiteManager
- 实体抽取: LLM 驱动
- 评分: BM25 + 向量相似度 + entity boost + 重排序

**配置**: MemoryConfig (Pydantic) — LLM/Embedder/VectorStore/Reranker 均可配置

---

## 六、关键技术结论

### 可以直接复用（无需修改）
1. workflow-engine 的整个执行流程（runWorkflow + Journal + Progress）
2. computer-use-mcp 的 dispatchAction 操作执行
3. skillLearning 的 Instinct 存储和演化机制
4. BATCH_ACTION_ITEM_SCHEMA 操作格式
5. feature flag 门控系统

### 需要扩展（在现有代码上添加功能）
1. toolEventObserver — 增加桌面操作事件类型
2. skillGenerator — 增加 WorkflowScript→Skill 路径
3. CLI entrypoint — 增加 record/replay 命令
4. observationStore — 增加 recorded_action 事件

### 需要新建（参考开源实现）
1. CDP 事件监听器（参考 browser-use recording_watchdog）
2. 桌面事件监听器（参考 OpenAdapt record.py）
3. 事件合并器（参考 OpenAdapt events.py）
4. 工作流脚本生成器（输出 workflow-engine 格式）
5. 回放 AgentRunner（替换 LLM 调用为直接执行）
6. 验证引擎（扩展 pixelCompare）
7. 变量抽象引擎（Claude API 驱动）
