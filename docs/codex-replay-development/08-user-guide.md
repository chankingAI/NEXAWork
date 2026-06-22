# Computer Use Recorder — 使用指南

> 本指南面向所有用户（无需编程经验），一步步教你如何启用和使用 Record/Replay 功能。

---

## 第一部分：这是什么？

简单说：**你在电脑上操作一遍，系统自动记住，下次帮你重复做。**

举例：
- 你每天打开浏览器 → 登录公司系统 → 下载报表 → 发邮件
- 录制一次后，以后只需说"执行这个技能"，系统自动帮你完成

---

## 第二部分：安装准备

### 步骤 1：安装 Bun（程序运行环境）

打开终端（Terminal），复制粘贴以下命令：

**Mac / Linux:**
```bash
curl -fsSL https://bun.sh/install | bash
```

**Windows:**
```powershell
powershell -c "irm bun.sh/install.ps1 | iex"
```

安装完成后关闭终端，重新打开一个新终端。

### 步骤 2：下载项目代码

```bash
git clone https://github.com/chankingAI/claude-code.git
cd claude-code
```

### 步骤 3：安装依赖

```bash
bun install
```

等待完成即可（约 1-2 分钟）。

### 步骤 4：验证安装成功

```bash
bun test packages/@ant/computer-use-recorder/
```

看到 `253 pass, 0 fail` 表示安装成功。

---

## 第三部分：当前可用的使用方式

### 方式 A：运行测试（验证功能正常）

```bash
# 运行全部测试
bun test packages/@ant/computer-use-recorder/

# 运行特定模块测试
bun test packages/@ant/computer-use-recorder/src/__tests__/replayEngine.test.ts
bun test packages/@ant/computer-use-recorder/src/__tests__/operationMemory.test.ts
```

### 方式 B：通过代码调用（开发者）

创建一个测试脚本 `test-recorder.ts`：

```typescript
import {
  mergeEvents,
  buildWorkflowScript,
  generateSkill,
  ReplayEngine,
  OperationMemoryStore,
} from './packages/@ant/computer-use-recorder/src/index.ts'

// 模拟录制的事件
const events = [
  { action: 'left_click', coordinate: [100, 200], timestamp: 1000, screenshot_before: null, screenshot_after: null, window_context: { app_name: 'Chrome', window_title: '淘宝' } },
  { action: 'type', text: '手机', timestamp: 2000, screenshot_before: null, screenshot_after: null, window_context: { app_name: 'Chrome', window_title: '淘宝' } },
  { action: 'key', text: 'Return', timestamp: 3000, screenshot_before: null, screenshot_after: null, window_context: { app_name: 'Chrome', window_title: '淘宝' } },
]

// 1. 合并事件
const merged = mergeEvents(events)
console.log('合并后事件数:', merged.length)

// 2. 生成工作流脚本
const script = buildWorkflowScript(merged)
console.log('生成的工作流:\n', script)

// 3. 生成技能包
const skill = generateSkill(events, { name: 'taobao-search', description: '淘宝搜索商品' })
console.log('技能路径:', skill.skillDir)
console.log('包含文件:', Object.keys(skill.files))

// 4. 操作记忆
const memory = new OperationMemoryStore()
memory.recordSkillUsage('taobao-search', { success: true, durationMs: 5000 })
memory.recordParamValue('keyword', '手机')
console.log('技能使用记录:', memory.getTopSkills(5))
```

运行：
```bash
bun run test-recorder.ts
```

### 方式 C：使用 Claude Code 主程序的现有功能

claude-code 本身已经可以运行：

```bash
# 启动 claude-code（需要 Anthropic API Key）
bun run dev

# 进入交互模式后，输入任何编程任务
```

---

## 第四部分：功能模块说明（通俗版）

### 模块 1：录制器 — "摄像机"

就像用摄像机录下你的操作，但记录的不是视频，而是每一个动作：
- 鼠标点了哪里
- 键盘输入了什么
- 打开了什么窗口
- 滚动了多少

### 模块 2：事件合并 — "编辑师"

把零散的动作整理成连贯的步骤：
- 一个字一个字打 → 合并为"输入了一句话"
- 快速点两下 → 合并为"双击"
- 连续滚动 → 合并为"向下滚动3格"

### 模块 3：工作流生成 — "剧本作家"

把整理好的动作写成一个可执行的脚本（像电影剧本一样）。

### 模块 4：技能生成 — "教练"

把剧本变成一个"技能包"，包含：
- SKILL.md — 这个技能的说明书
- workflow.js — 可执行的脚本
- recording.json — 原始录制数据（备份用）

### 模块 5：回放引擎 — "演员"

按照剧本执行操作。两种模式：
- **直接模式**: 精确重复坐标和操作（快但不灵活）
- **自适应模式**: 如果界面有变化，自动找到正确位置（慢但可靠）

### 模块 6：视觉匹配 — "眼睛"

当目标位置变了，按这个顺序找：
1. 先通过元素名称找（最快）
2. 按比例位置找（较快）
3. 通过截图对比找（较慢）
4. 问 AI 在哪里（最慢但最聪明）

### 模块 7：变量抽象 — "聪明人"

发现操作中哪些值是可以变的：
- 搜索"手机" → 下次可以搜索任何东西
- 日期"2026-01-01" → 下次自动用当前日期

### 模块 8：操作记忆 — "记忆"

记住你的习惯：
- 哪些操作经常一起做
- 每天几点做什么
- 最常搜索什么关键词

### 模块 9：自愈回放 — "应急方案"

回放出错时自动修复：
- 找不到按钮 → 用眼睛重新找
- 页面没加载 → 等一会再试
- 弹出提示框 → 自动关闭继续

---

## 第五部分：项目文件在哪里

```
claude-code/
├── packages/@ant/computer-use-recorder/  ← 录制/回放核心代码
│   ├── src/
│   │   ├── types.ts              — 数据格式定义
│   │   ├── cdpRecorder.ts        — 浏览器录制
│   │   ├── desktopRecorder.ts    — 桌面录制
│   │   ├── elementCapture.ts     — 元素识别
│   │   ├── eventMerger.ts        — 事件合并
│   │   ├── workflowBuilder.ts    — 工作流生成
│   │   ├── skillGenerator.ts     — 技能生成
│   │   ├── replayEngine.ts       — 回放引擎
│   │   ├── visualMatcher.ts      — 视觉匹配
│   │   ├── variableAbstraction.ts — 变量抽象
│   │   ├── operationMemory.ts    — 操作记忆
│   │   ├── replayRecovery.ts     — 自愈回放
│   │   ├── cli.ts                — 命令行接口
│   │   └── __tests__/            — 253个测试文件
│   └── package.json
├── docs/codex-replay-development/        ← 所有文档
│   ├── 01-development-plan.md    — 开发计划
│   ├── 02-development-prompts.md — 开发提示词
│   ├── 03-opensource-reference.md — 开源参考
│   ├── 04-architecture-integration.md — 架构设计
│   ├── 05-code-analysis-summary.md — 代码分析
│   ├── 06-test-report.md         — 测试报告
│   ├── 07-project-status-analysis.md — 现状分析
│   ├── 08-user-guide.md          — 本使用指南
│   └── 09-improvement-plan.md    — 改进计划（见下文）
└── src/                                   ← claude-code 主程序
```

---

## 第六部分：常见问题

### Q: 我不会编程，能用吗？
A: 目前需要基本的终端操作知识。完成集成开发后（见改进计划），将可以直接在 claude-code 中输入 `claude record` 开始录制。

### Q: 支持什么操作系统？
A: Linux、macOS、Windows 全部支持。

### Q: 录制的数据安全吗？
A: 所有数据只存在你的电脑本地，不会上传到任何服务器。密码输入会自动脱敏为 [PASSWORD_REDACTED]。

### Q: 录制浏览器操作需要什么？
A: 需要 Chrome 浏览器，且通过 CDP（Chrome DevTools Protocol）连接。

### Q: 回放会100%准确吗？
A: 直接模式下，如果界面没变化则100%准确。自适应模式下，即使界面有轻微变化也能自动适应。自愈模式下，遇到异常会自动尝试恢复。

### Q: 和 RPA 工具（如 UiPath）有什么区别？
A: 
- RPA 需要手动编写流程，本系统自动从操作录制生成
- RPA 通常只支持固定坐标，本系统有 4 级自适应定位
- 本系统与 AI 深度集成，可以理解操作意图并参数化
