# 开源项目参考索引

> 每个项目的实际仓库地址、核心文件路径、关键实现机制、以及它在本项目中的具体应用点。

---

## 1. OpenAdapt — 用户示教学习框架

### 基本信息
- **仓库**: https://github.com/OpenAdaptAI/OpenAdapt
- **许可证**: MIT
- **Stars**: 1.6K+
- **定位**: 用户演示一次 → AI 学习 → 自动重复执行

### 核心文件及其作用

| 文件路径 | 作用 | 对本项目的参考价值 |
|----------|------|-------------------|
| `legacy/openadapt/record.py` | 多进程录制主逻辑 | 录制架构设计（独立进程处理 screen/action/window/browser 事件）|
| `legacy/openadapt/models.py` | SQLAlchemy 数据模型 | Recording/ActionEvent/Screenshot/WindowEvent 数据结构设计 |
| `legacy/openadapt/replay.py` | 策略化回放框架 | Strategy Pattern 回放架构 |
| `legacy/openadapt/events.py` | 事件处理和合并 | 原始事件→语义事件的转换逻辑 |
| `legacy/openadapt/strategies/base.py` | 回放策略基类 | 策略接口定义 |
| `legacy/openadapt/strategies/naive.py` | 直接坐标回放 | 最基础的回放实现 |
| `legacy/openadapt/strategies/visual.py` | 视觉匹配回放 | 截图模板匹配定位 |
| `legacy/openadapt/strategies/stateful.py` | 状态感知回放 | 状态验证和自适应回放 |
| `legacy/openadapt/capture/` | 平台特定捕获 | Windows/macOS/Linux 事件捕获方式 |

### 关键实现机制

**多进程录制架构**:
- 主进程: 协调控制 + 用户交互
- screen 进程: 定时截图 + 视频录制（av 库）
- action 进程: pynput 键盘/鼠标监听
- window 进程: 窗口焦点变化监听
- browser 进程: WebSocket 接收浏览器事件

**事件数据模型**:
- Event = namedtuple("Event", ("timestamp", "type", "data"))
- ActionEvent: 包含 name(click/type/scroll)、mouse_x/y、key_char、window_event 关联
- Screenshot: 包含 timestamp、image_data、recording_id
- WindowEvent: 包含 title、left/top/width/height

**回放策略模式**:
- base.py 定义 Strategy 接口: get_next_action_event(screenshot) → ActionEvent
- naive.py: 直接按时间戳顺序回放原始事件
- visual.py: 截图匹配 + 坐标偏移校正
- stateful.py: 维护状态机，根据当前状态决定下一步

### 在本项目中的应用

| OpenAdapt 概念 | 本项目对应 | 实现方式 |
|----------------|-----------|----------|
| Record 多进程 | computer-use-recorder | Bun Worker Threads（非 Python multiprocessing）|
| ActionEvent | RawActionEvent | 对齐 BATCH_ACTION_ITEM_SCHEMA 格式 |
| Strategy | ReplayEngine strategies | 定位策略链（accessibility→coordinate→visual→AI）|
| Recording 模型 | RecordingSession 类型 | TypeScript 类型定义 |

---

## 2. Browser Use — AI 浏览器自动化

### 基本信息
- **仓库**: https://github.com/browser-use/browser-use
- **许可证**: MIT
- **Stars**: 55K+
- **定位**: LLM 驱动的浏览器自动化

### 核心文件及其作用

| 文件路径 | 作用 | 对本项目的参考价值 |
|----------|------|-------------------|
| `browser_use/browser/watchdogs/recording_watchdog.py` | CDP 视频录制 | CDP screencastFrame 录制模式 |
| `browser_use/browser/watchdogs/har_recording_watchdog.py` | HAR 网络录制 | CDP Network/Page 域事件捕获完整实现 |
| `browser_use/browser/video_recorder.py` | 视频编码 | ffmpeg 帧写入 |
| `browser_use/tools/views.py` | 操作模型定义 | Pydantic 结构化 Action 定义 |
| `browser_use/tools/service.py` | 工具注册和执行 | Action → 浏览器操作的映射 |
| `browser_use/dom/service.py` | DOM 处理 | DOM 快照提取和元素定位 |
| `browser_use/agent/service.py` | Agent 编排 | LLM → Action → 执行循环 |
| `browser_use/browser/session.py` | CDP 管理 | CDP 连接和会话管理 |

### 关键实现机制

**事件驱动架构（Watchdog 模式）**:
- BrowserSession 通过 bubus EventBus 协调多个 Watchdog
- 每个 Watchdog 声明 LISTENS_TO 和 EMITS 事件类型
- CDP 事件通过 cdp_client.register 注册回调

**CDP 录制实现**:
- Page.startScreencast(format, quality, maxWidth, maxHeight, everyNthFrame)
- 注册 Page.screencastFrame 回调接收帧
- Page.screencastFrameAck 确认帧已处理
- Page.stopScreencast 停止

**HAR 录制实现**:
- Network.requestWillBeSent → 记录请求
- Network.responseReceived → 记录响应头
- Network.dataReceived → 累积响应体
- Network.loadingFinished → 通过 Network.getResponseBody 获取完整响应
- 输出标准 HAR 1.2 格式

**结构化 Action 模型**:
- ClickElementAction: index（DOM 元素索引）+ coordinate_x/y
- InputTextAction: index + text + clear
- NavigateAction: url + new_tab
- SearchAction: query + engine
- ExtractAction: query + extract_links + output_schema

### 在本项目中的应用

| Browser Use 概念 | 本项目对应 | 实现方式 |
|-----------------|-----------|----------|
| RecordingWatchdog | cdpRecorder | 复用 CDP screencast 机制 |
| HarRecordingWatchdog | 网络层录制 | 复用 CDP Network 域监听 |
| Watchdog 事件模式 | 录制器事件分发 | TypeScript EventEmitter |
| Action 模型 | RawActionEvent | 对齐已有 BATCH_ACTION_ITEM_SCHEMA |
| DOM element index | element_context | 扩展为 accessible_name/role |

---

## 3. UI-TARS Desktop — 多模态桌面 Agent

### 基本信息
- **仓库**: https://github.com/bytedance/UI-TARS-desktop
- **许可证**: Apache-2.0
- **Stars**: 13K+
- **定位**: 字节跳动开源的多模态 GUI Agent

### 核心文件及其作用

| 文件路径 | 作用 | 对本项目的参考价值 |
|----------|------|-------------------|
| `apps/ui-tars/src/main/agent/operator.ts` | 桌面操作执行器 | NutJS + Electron 桌面操作模式 |
| `apps/ui-tars/src/main/agent/prompts.ts` | Agent 提示词 | 操作指令格式化 |
| `apps/ui-tars/src/main/utils/screen.ts` | 屏幕信息 | 分辨率/缩放因子获取 |

### 关键实现机制

**ACTION_SPACES 定义**:
- click(start_box='[x1, y1, x2, y2]') — 边界框点击
- left_double(start_box) — 双击
- right_single(start_box) — 右键
- drag(start_box, end_box) — 拖拽
- hotkey(key) — 快捷键
- type(content) — 输入（\n 提交）
- scroll(start_box, direction) — 滚动
- wait() — 等待
- finished() — 完成
- call_user() — 请求帮助

**截图实现（Electron desktopCapturer）**:
- desktopCapturer.getSources({types: ['screen'], thumbnailSize})
- 按 display_id 匹配主显示器
- resize 到物理分辨率
- 输出 base64 PNG

**坐标系统（边界框模式）**:
- 使用 [x1, y1, x2, y2] 相对坐标（0-1000 归一化）
- 比绝对像素更鲁棒（分辨率无关）
- 点击目标为边界框中心

### 在本项目中的应用

| UI-TARS 概念 | 本项目对应 | 实现方式 |
|-------------|-----------|----------|
| ACTION_SPACES | BATCH_ACTION_ITEM_SCHEMA | 已有更完整的 action 枚举 |
| 边界框坐标 | element_context.bounding_box | 录制时捕获元素边界框 |
| desktopCapturer | computer-use-mcp screenshot | 已有实现 |
| NutJS | computer-use-input | 已有跨平台键鼠模拟 |

---

## 4. Playwright — 浏览器测试自动化

### 基本信息
- **仓库**: https://github.com/microsoft/playwright
- **许可证**: Apache-2.0
- **Stars**: 70K+
- **定位**: 微软开源的端到端浏览器测试框架

### 核心能力与参考价值

| 能力 | 实现方式 | 对本项目的参考价值 |
|------|----------|-------------------|
| codegen 录制 | CDP + 代理服务器拦截 | 浏览器操作录制的参考实现 |
| 选择器策略 | role > text > testId > css > xpath | 元素定位优先级设计 |
| HAR 录制 | CDP Network 域 | 网络层录制（browser-use 已实现类似功能）|
| Trace Viewer | 操作+截图+DOM 序列化 | 录制结果可视化 |
| auto-wait | 智能等待元素可操作 | 回放时的等待策略 |
| 重试机制 | actionability checks | 操作前验证元素状态 |

### 选择器优先级（直接可用于本项目的元素定位策略）:
1. role（ARIA 角色 + accessible name）— 最稳定
2. text（可见文本内容）— 语义明确
3. testId（data-testid 属性）— 开发者意图
4. css（CSS 选择器）— 结构化
5. xpath（XPath）— 最灵活但最脆弱

### 在本项目中的应用

| Playwright 概念 | 本项目对应 | 实现方式 |
|----------------|-----------|----------|
| codegen | cdpRecorder | 本项目需实现类似机制 |
| 选择器优先级 | 定位策略链 | accessibility → text → coordinate → visual |
| auto-wait | 回放等待逻辑 | 操作前等待元素可见/可交互 |
| Trace | 录制结果存储 | RecordingSession + 截图序列 |

---

## 5. Mem0 — AI 记忆层

### 基本信息
- **仓库**: https://github.com/mem0ai/mem0
- **许可证**: Apache-2.0
- **Stars**: 28K+
- **定位**: AI 应用的长期记忆管理

### 核心文件及其作用

| 文件路径 | 作用 | 对本项目的参考价值 |
|----------|------|-------------------|
| `mem0/memory/main.py` | Memory 核心类 | add/search/update/delete 接口设计 |
| `mem0/memory/storage.py` | SQLite 持久化 | 本地存储方案 |
| `mem0/memory/utils.py` | 工具函数 | JSON 提取、消息解析 |
| `mem0/configs/base.py` | 配置管理 | MemoryConfig/MemoryItem 模型 |

### 关键实现机制

**Memory 接口**:
- add(messages, user_id, metadata) → 提取并存储记忆
- search(query, user_id, limit) → 向量+BM25 混合检索
- update(memory_id, data) → 更新记忆内容
- delete(memory_id) → 删除记忆

**存储架构**:
- 向量存储: Qdrant/ChromaDB/Pinecone 等
- 元数据: SQLite 本地存储
- 实体图谱: Neo4j（可选）

**记忆提取**:
- 使用 LLM 从对话中提取关键记忆点
- 分类: 事实型/偏好型/过程型
- 去重: 向量相似度 + BM25 + 重排序

### 在本项目中的应用

| Mem0 概念 | 本项目对应 | 实现方式 |
|-----------|-----------|----------|
| Memory.add | observationStore.appendObservation | 已有，需扩展操作模式 |
| Memory.search | 技能检索 | 复用 skillSearch 模块 |
| SQLite 存储 | JSON 文件存储 | 保持与现有 observationStore 一致（JSON Lines）|
| 实体提取 | 操作模式提取 | 利用现有 skillLearning 的 Instinct 机制 |

---

## 6. 补充参考项目

### Robot Framework（桌面 RPA）
- **仓库**: https://github.com/robotframework/robotframework
- **作用**: 关键字驱动的自动化测试框架
- **参考价值**: 关键字（Keyword）抽象概念 → 对应本项目的 Skill 抽象

### pyautogui（Python 桌面自动化）
- **仓库**: https://github.com/asweigart/pyautogui
- **作用**: 跨平台 GUI 自动化
- **参考价值**: locateOnScreen() 视觉模板匹配 API 设计

### Sikuli/SikuliX（视觉自动化）
- **仓库**: https://github.com/RaiMan/SikuliX1
- **作用**: 基于图像识别的 GUI 自动化
- **参考价值**: 截图模板匹配定位的成熟实现

---

## 总结：各项目能力矩阵与本项目缺口对应

| 能力维度 | 本项目现状 | 首选参考 | 备选参考 |
|----------|-----------|----------|----------|
| 浏览器操作录制 | 无 | Browser Use (CDP Watchdog) | Playwright (codegen) |
| 桌面操作录制 | 无 | OpenAdapt (pynput多进程) | UI-TARS (NutJS) |
| 结构化 Action | 已有(BATCH_ACTION_ITEM_SCHEMA) | Browser Use (Pydantic模型) | - |
| 操作执行 | 已有(computer-use-mcp) | - | - |
| 工作流编排 | 已有(workflow-engine) | - | - |
| 技能生成 | 已有(skillGenerator) | - | - |
| 回放策略 | 无 | OpenAdapt (Strategy Pattern) | Playwright (selector策略) |
| 视觉匹配 | 部分(pixelCompare) | OpenAdapt (visual strategy) | pyautogui |
| 操作记忆 | 部分(observationStore) | Mem0 (Memory接口) | - |
| 状态验证 | 部分(pixelCompare) | Browser Use (DOM snapshot) | Playwright (assertions) |
