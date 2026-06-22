# Record/Replay 桌面端集成 — 改进计划与开发提示词

> 从"引擎完成"到"桌面应用一键可用"的完整集成路径

---

## 一、当前状态与差距

### 已完成（后端引擎）

| 模块 | 文件 | 状态 | 测试 |
|------|------|------|------|
| 类型系统 | src/types.ts | 完成 | 通过 |
| CDP录制器 | src/cdpRecorder.ts | 完成 | 通过 |
| 桌面录制器 | src/desktopRecorder.ts | 完成 | 通过 |
| 元素捕获 | src/elementCapture.ts | 完成 | 通过 |
| 事件合并 | src/eventMerger.ts | 完成 | 通过 |
| 工作流构建 | src/workflowBuilder.ts | 完成 | 通过 |
| 技能生成 | src/skillGenerator.ts | 完成 | 通过 |
| 回放引擎 | src/replayEngine.ts | 完成 | 通过 |
| 视觉匹配 | src/visualMatcher.ts | 完成 | 通过 |
| 自愈恢复 | src/replayRecovery.ts | 完成 | 通过 |
| 变量抽象 | src/variableAbstraction.ts | 完成 | 通过 |
| 操作记忆 | src/operationMemory.ts | 完成 | 通过 |
| CLI入口 | src/cli.ts | 完成 | 通过 |

### 未完成（集成层）

| 缺失项 | 影响 | 优先级 |
|--------|------|--------|
| CLI 命令未注册到主程序 | 用户无法使用 claude record | P0 |
| CDP 连接未桥接 | 录制器无法连 Chrome | P0 |
| Feature Flag 未创建 | 无法门控功能 | P1 |
| 回放前权限确认 | 安全合规缺失 | P1 |
| 前端 UI 组件 | 桌面应用无录制入口 | P2 |
| MCP Tool 未暴露 | 外部 Agent 无法调用 | P3 |

---

## 二、桌面端集成 Prompt（IR1-IR8）

### Prompt IR1 — CLI 命令注册

```
任务：将 recorder CLI 命令注册到 claude-code 主程序。

现有代码参考：
- src/main.tsx 第1276行 — 已有 '--replay-user-messages' 选项
- src/main.tsx — Commander.js 子命令注册模式
- packages/@ant/computer-use-recorder/src/cli.ts — 已定义命令

要求：
1. 在 src/main.tsx 注册子命令：
   - `claude record [--mode cdp|desktop|mixed]` — 启动录制
   - `claude replay <recording-or-skill>` — 回放
   - `claude generate <recording>` — 生成技能
2. 通过 feature('RECORDER') 门控
3. 使用 lazy import（动态加载 @ant/computer-use-recorder）
4. 命令帮助信息清晰（中英双语）

验收标准：
- `claude record --help` 显示帮助
- `claude record --mode cdp` 开始录制
- feature flag 关闭时命令不存在
```

### Prompt IR2 — Feature Flag + 环境变量

```
任务：创建 RECORDER feature flag。

现有代码参考：
- scripts/defines.ts — feature flag 定义
- build.ts — 默认启用列表

要求：
1. 添加 'RECORDER' 到 scripts/defines.ts
2. 添加到 build.ts 默认 features 列表
3. 环境变量 FEATURE_RECORDER=0 可禁用
4. 所有 recorder import 通过 feature() 包裹

验收标准：
- FEATURE_RECORDER=1 时功能可用
- FEATURE_RECORDER=0 时零开销
```

### Prompt IR3 — CDP 连接桥接

```
任务：连接录制器到 Chrome CDP 实例。

现有代码参考：
- packages/@ant/computer-use-mcp/src/executor.ts — CDP 连接
- packages/@ant/computer-use-recorder/src/cdpRecorder.ts — CdpClient 接口

要求：
1. 创建 cdpBridge.ts：
   - 获取 computer-use-mcp 的 CDP WebSocket URL
   - 适配为 CdpRecorder 需要的 CdpClient 接口
   - 提供 screenshot 回调
2. 自动启动 Chrome（如未运行）
3. 连接失败清晰提示

验收标准：
- 录制器成功连接 Chrome
- 截图正常获取
- Chrome 未运行时自动启动
```

### Prompt IR4 — IPC 录制控制（Electron 集成）

```
任务：通过 Electron IPC 暴露录制/回放控制给 Renderer。

要求：
1. IPC handlers（Main Process）：
   - recorder:start → 调用 CdpRecorder/DesktopRecorder
   - recorder:stop → 停止并保存
   - recorder:pause/resume → 暂停/恢复
   - recorder:status → 事件流（计数/时长/截图）
   - replay:start → 调用 AdaptiveReplayEngine
   - replay:status → 步骤进度流
   - replay:stop → 停止回放
   - skill:generate → 从录制生成
2. 事件推送：
   - 录制中每秒推送状态
   - 回放每步推送进度
3. 错误处理：
   - 录制失败 → 保存已有数据 + 通知用户
   - 回放失败 → 触发自愈 + 通知状态

验收标准：
- Renderer 可启动/停止录制
- 实时状态到达前端
- 回放进度正确推送
```

### Prompt IR5 — 回放权限确认

```
任务：回放前展示操作摘要并要求确认。

现有代码参考：
- src/components/permissions/ — 权限 UI 模式

要求：
1. 回放前弹出确认对话框：
   - 操作列表摘要（将执行什么）
   - 危险操作红色高亮（删除/支付/提交）
   - 按钮：确认执行 / 取消
2. 权限等级：
   - 安全操作（点击/输入/导航）→ 自动执行
   - 危险操作（删除/修改系统设置）→ 单独确认
3. --yes 参数跳过确认

验收标准：
- 危险操作需确认
- 安全操作自动通过
- 确认后正常执行
```

### Prompt IR6 — 录制 UI 组件（React）

```
任务：实现桌面应用中的录制 UI。

要求：
1. RecordButton — 红色圆形，脉冲动画
2. RecordingStatusBar — 顶部状态（REC + 时间 + 事件数）
3. RecordConfigPanel — 模式选择 + 配置项
4. RecordCompleteDialog — 完成后（生成技能/保存/丢弃）

集成约束：
- 通过 IPC 调用 IR4 的 handler
- 状态用 Zustand store 管理
- 动画用 CSS animation（不用 JS）

验收标准：
- 按钮状态正确切换
- 脉冲动画流畅
- 配置面板完整
```

### Prompt IR7 — 回放 UI 组件（React）

```
任务：实现桌面应用中的回放 UI。

要求：
1. ReplayPanel — 步骤列表 + 进度条 + 操作按钮
2. ReplayStepItem — 单步状态（待执行/执行中/成功/失败/恢复中）
3. ReplayReport — 完成报告（评分/统计/失败详情）
4. VariableInputForm — 动态参数表单（从 Zod schema 生成）

集成约束：
- 步骤状态实时从 IPC 事件流获取
- 表单从 variableAbstraction 的 schema 动态生成
- 报告可导出 JSON/PDF

验收标准：
- 进度实时更新
- 自愈恢复可视化
- 参数表单正确生成
- 报告信息完整
```

### Prompt IR8 — 技能系统对接

```
任务：让录制生成的技能融入桌面应用 Skill 系统。

要求：
1. 录制生成的 SKILL.md 存储到 .claude/skills/recorded/
2. 技能列表页显示录制生成的技能（特殊图标标记）
3. 点击"执行"→ 弹出变量表单 → 开始回放
4. 技能可编辑（步骤重排/删除/修改参数）
5. 技能可导出分享（打包为 .skill.zip）

集成约束：
- 复用 bundledSkills.ts 加载机制
- SKILL.md frontmatter 格式兼容
- 导出包含：SKILL.md + workflow.js + recording.json + screenshots/

验收标准：
- 生成的技能出现在列表
- 执行后正确回放
- 编辑保存后再次执行正确
- 导出/导入完整
```

---

## 三、完整用户流程（桌面端）

### 流程1：浏览器操作录制

```
用户操作步骤（10岁小孩也能做）：
1. 打开 NexaWork 桌面应用
2. 点击"Record/Replay"场景标签
3. 点击红色"录制"按钮
4. 选择"浏览器录制" → 点击"开始录制"
5. （3秒倒计时）
6. 在 Chrome 中执行操作（点击/输入/导航）
7. 回到 NexaWork，点击"停止录制"
8. 弹出完成对话框：
   - 检测到变量：日期、搜索词
   - 输入技能名称："下载月报"
   - 点击"生成技能"
9. 技能生成完成！出现在技能列表中
```

### 流程2：技能回放

```
用户操作步骤：
1. 打开 NexaWork → Record/Replay 场景
2. 在技能列表中找到"下载月报"
3. 点击"执行"
4. 弹出参数表单：
   - 月份：[2026-07]（下拉选择）
   - 报表类型：[销售报表]（文本输入）
5. 点击"确认执行"
6. 权限确认对话框（如有危险操作）
7. 观看回放进度：
   - 步骤1 ✓ 打开网站
   - 步骤2 ✓ 登录
   - 步骤3 ⟳ 正在恢复...（元素位置变了，视觉匹配重定位）
   - 步骤4 ✓ 选择月份
   - ...
8. 完成！质量评分：95/100
```

### 流程3：桌面操作录制

```
用户操作步骤：
1. 打开 NexaWork → 录制 → "桌面录制"
2. 选择要录制的窗口（下拉列表）
3. 开始录制
4. 在 Excel/ERP/邮件等应用中操作
5. 回到 NexaWork 停止录制
6. 生成技能（含窗口切换步骤）
7. 下次执行：自动打开对应应用 + 重复操作
```

---

## 四、性能要求

| 指标 | 要求 | 测量方式 |
|------|------|---------|
| 录制启动延迟 | <500ms | 从点击到第一个事件被捕获 |
| 事件处理延迟 | <10ms | 事件发生到存储 |
| 截图延迟 | <200ms | 从触发到截图完成 |
| 回放步骤延迟 | <100ms | 指令发出到操作执行 |
| 技能生成时间 | <3s | 从录制到 SKILL.md 生成 |
| UI 状态更新 | <16ms (60fps) | 进度条/计数器刷新 |

---

## 五、安全要求

| 场景 | 处理方式 |
|------|---------|
| 密码框输入 | 自动替换为 [PASSWORD_REDACTED] |
| 银行/支付页面 | 回放前强制确认 |
| 系统设置修改 | 回放前强制确认 |
| 文件删除操作 | 回放前强制确认 |
| 录制数据存储 | 仅本地，不上传 |
| 技能分享 | 导出前检查敏感信息 |
