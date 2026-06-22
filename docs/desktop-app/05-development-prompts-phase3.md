# Phase 3 开发提示词 — Record/Replay 集成

> 将 computer-use-recorder 引擎接入桌面App前端，实现一键录制回放。

---

## Prompt D15 — 录制按钮与状态指示

```
任务：在桌面App中实现可视化的录制控制界面。

现有代码参考：
- packages/@ant/computer-use-recorder/src/cli.ts — handleRecordCommand 接口
- packages/@ant/computer-use-recorder/src/types.ts — RecordingSession/RecordingStatus 类型

要求：
1. RecordButton 组件：
   - 大红色圆形按钮（工具栏固定位置）
   - 三个状态：idle（灰色）、recording（红色脉冲动画）、paused（黄色）
   - 点击切换：idle→recording→pause/stop
   - 长按停止录制
2. RecordingIndicator 组件：
   - 顶部状态条：● Recording — 00:32 — 14 events
   - 经过时间实时更新
   - 事件计数实时更新
   - 最近操作预览（最后3个action的简短描述）
3. IPC handlers：
   - recorder.start — 开始录制（返回 sessionId）
   - recorder.pause — 暂停
   - recorder.resume — 恢复
   - recorder.stop — 停止并保存（返回文件路径）
   - recorder.status — 返回当前录制状态

验收：点击红色按钮 → 状态切换为录制中 → 显示时间和事件数 → 点击停止 → 保存

集成约束：
- 按钮位置不遮挡其他操作（右上角或浮动按钮）
- 录制状态全局可见（即使切换了标签页）
- 使用 motion 库做脉冲动画
```

---

## Prompt D16 — CDP 浏览器录制桥接

```
任务：桌面App中连接 Chrome CDP 进行浏览器操作录制。

现有代码参考：
- packages/@ant/computer-use-recorder/src/cdpRecorder.ts — CdpRecorder 类
- packages/@ant/computer-use-mcp/src/executor.ts — CDP 连接管理
- packages/@ant/computer-use-mcp/src/tools.ts — Chrome 启动逻辑

要求：
1. Chrome 连接管理：
   - 检测正在运行的 Chrome（ws://127.0.0.1:9222）
   - 如未运行，引导用户以 --remote-debugging-port 启动
   - 或自动启动 Chrome（带调试端口）
2. 录制流程：
   - recorder.start → 连接CDP → 注入事件监听 → 开始捕获
   - 实时将捕获到的事件通过 IPC 发送到 Renderer 更新计数
   - recorder.stop → 停止监听 → 合并事件 → 保存 JSON
3. 截图策略：
   - 操作时截图（action_before/action_after）
   - 空闲时低频截图（每5秒）
   - 截图保存为 base64 在 JSON 中

验收：打开Chrome → 开始录制 → 在浏览器中操作 → 停止 → 查看录制文件包含所有操作

集成约束：
- CDP 连接在 Main Process 中（不在 Renderer）
- 复用 CdpRecorder 的 CdpClient 接口
- 连接失败时给出清晰错误提示（弹窗）
```

---

## Prompt D17 — 桌面录制连接

```
任务：录制非浏览器的桌面操作（任意应用）。

现有代码参考：
- packages/@ant/computer-use-recorder/src/desktopRecorder.ts — DesktopRecorder 类
- packages/@ant/computer-use-recorder/src/elementCapture.ts — ElementCaptureService
- packages/@ant/computer-use-input/src/ — 平台 dispatcher

要求：
1. 桌面事件捕获启动：
   - Linux: 启动 xinput 监听进程
   - macOS: 启动 CGEvent tap 监听
   - Windows: 启动 SetWindowsHookEx 监听
2. 窗口上下文采集：
   - 每个事件附带当前活跃窗口信息（app_name, window_title）
   - 窗口切换事件记录
3. 录制选项UI：
   - 选择录制模式：仅浏览器 / 仅桌面 / 全部
   - 选择是否记录鼠标移动（减少噪声）
   - 选择截图频率

验收：选择"桌面录制" → 打开记事本 → 输入文字 → 停止录制 → 文件包含操作

集成约束：
- 复用 DesktopRecorder 的 loadCaptureBackend()
- 桌面录制需要系统权限（辅助功能/输入监控）
- 首次使用提示用户授权
```

---

## Prompt D18 — 回放面板

```
任务：实现录制会话的浏览、预览和回放执行界面。

现有代码参考：
- packages/@ant/computer-use-recorder/src/cli.ts — handleReplayCommand
- packages/@ant/computer-use-recorder/src/replayEngine.ts — ReplayEngine
- packages/@ant/computer-use-recorder/src/replayRecovery.ts — AdaptiveReplayEngine

要求：
1. 录制列表组件：
   - 显示所有已保存的录制（时间、描述、步骤数）
   - 缩略图预览（首屏截图）
   - 搜索/排序/删除
2. 步骤预览组件：
   - 时间线视图（每步一张缩略图）
   - 点击某步查看详细信息（操作类型、坐标、文本）
   - 可编辑步骤参数
3. 回放执行控制：
   - 开始回放按钮
   - 模式选择：直接 / 自适应 / 自愈
   - 速度调节（0.5x / 1x / 2x / 5x）
   - 暂停/继续/跳过当前步骤
4. IPC handlers：
   - recorder.listRecordings — 列出所有录制
   - recorder.getRecording — 获取单个录制详情
   - recorder.replay — 执行回放
   - recorder.cancelReplay — 取消回放

验收：选择一个录制 → 预览步骤 → 点击回放 → 看到操作自动执行

集成约束：
- 复用 ReplayEngine 和 AdaptiveReplayEngine
- 回放时最小化桌面App窗口（不遮挡操作区域）
- 回放完成后恢复窗口并显示报告
```

---

## Prompt D19 — 技能管理界面

```
任务：管理从录制生成的 Skill（创建/编辑/删除/运行）。

现有代码参考：
- packages/@ant/computer-use-recorder/src/skillGenerator.ts — generateSkill
- packages/@ant/computer-use-recorder/src/cli.ts — handleGenerateCommand
- .claude/skills/ — Skill 存储位置

要求：
1. Skill 列表页面：
   - 卡片网格布局
   - 每张卡片：名称、描述、最后运行时间、成功率
   - 搜索/标签筛选
2. Skill 详情页面：
   - SKILL.md 内容渲染（Markdown）
   - workflow.js 预览（代码高亮）
   - 运行历史（每次运行的状态/耗时）
   - 编辑描述/标签
3. 从录制生成 Skill：
   - 录制完成后提示"保存为技能？"
   - 输入技能名称/描述
   - 自动调用 generateSkill → 保存
4. 运行 Skill：
   - 点击"运行" → 填入变量参数 → 执行回放
   - 显示实时进度

验收：录制一次操作 → 生成为Skill → 在列表中看到 → 点击运行 → 自动执行

集成约束：
- 复用 skillGenerator 的输出格式
- Skill 存储在 .claude/skills/[name]/ 目录
- 技能可导入/导出（JSON文件）
```

---

## Prompt D20 — 变量参数化 UI

```
任务：回放前让用户填入可变参数（如搜索关键词、日期等）。

现有代码参考：
- packages/@ant/computer-use-recorder/src/variableAbstraction.ts — detectVariables, generateSchema
- packages/workflow-engine/src/tool/schema.ts — workflowInputSchema

要求：
1. 变量检测展示：
   - 显示检测到的变量列表（名称/类型/默认值/来源步骤）
   - 用户可勾选哪些保留为变量、哪些固定
2. 参数输入表单：
   - 根据 Schema 自动生成表单
   - 文本输入 / 数字输入 / 日期选择 / 下拉选项
   - 显示默认值（上次使用的值）
   - 必填验证
3. 运行时参数注入：
   - 表单填写完成 → 传入 replayEngine → 替换脚本中变量

验收：一个搜索操作技能 → 运行时弹出参数输入 → 填入新关键词 → 回放使用新值

集成约束：
- 表单组件复用 Radix UI 的 input/select/label
- 参数历史记录（OperationMemoryStore.getFrequentValues）
- Schema 兼容 Zod 格式
```

---

## Prompt D21 — 回放进度与自愈状态

```
任务：回放执行时实时显示进度和自愈恢复状态。

现有代码参考：
- packages/@ant/computer-use-recorder/src/replayRecovery.ts — ReplayReport/StepReport
- packages/remote-control-server/web/components/chat/PlanView.tsx — 进度展示

要求：
1. 回放进度面板：
   - 步骤列表（编号/描述/状态图标）
   - 当前步骤高亮 + 展开详情
   - 进度条（已完成/总数）
   - 预估剩余时间
2. 自愈状态展示：
   - 恢复中显示：🔄 重试中... (element_not_found → visual match)
   - 恢复成功：✓ 已恢复（策略名称）
   - 恢复失败：✗ 无法恢复（需人工干预）
3. 回放报告（完成后）：
   - 总体评分（0-100）
   - 每步耗时图表
   - 恢复次数统计
   - 失败步骤高亮

验收：执行回放 → 实时看到步骤进度 → 遇到问题看到恢复过程 → 完成后看到报告

集成约束：
- 复用 PlanView 的进度条样式
- 通过 IPC 流式推送进度事件
- 报告可导出为 Markdown
```
