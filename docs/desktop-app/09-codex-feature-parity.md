# Codex 功能对标分析 — 100% 功能对齐

> 逐项分析 OpenAI Codex Desktop 功能，映射到现有代码资产，确定实现路径。

---

## 一、Codex 核心功能与对标状态

| # | Codex 功能 | 现有代码支撑 | 差距 | 实现难度 |
|---|-----------|-------------|------|----------|
| 1 | 多项目并行 Agent | QueryEngine 多实例 | 需 Electron 多窗口管理 | 中 |
| 2 | Worktree 工作树 | EnterWorktreeTool 已有 | 需前端UI | 低 |
| 3 | 内置终端 | BashTool/PowerShellTool | 需 xterm.js 集成 | 中 |
| 4 | 代码编辑器 | FileEdit/Read/Write 工具 | 需 Monaco 集成 | 中 |
| 5 | 自动化/Cron | CronCreate/Delete/List 工具 | 需前端管理UI | 低 |
| 6 | Skill/Plugin | Skill 系统 + Plugin 系统 | 需市场UI | 低 |
| 7 | Git 深度集成 | git 相关工具 | 需前端 diff/commit UI | 中 |
| 8 | 沙箱执行 | sandbox-runtime 包 | 已有，需前端开关 | 低 |
| 9 | OAuth 认证 | auth 模块 + 多 provider | 需 Electron OAuth flow | 中 |
| 10 | 操作录制回放 | computer-use-recorder 完整 | 需前端UI（Phase 3） | 中 |
| 11 | 70-method IPC | 无 | 需全新设计 | 高 |
| 12 | Fetch Proxy Auth | 无 | 需 Main Process 代理 | 中 |
| 13 | ProseMirror 编辑器 | 无（用 Monaco 替代） | Monaco 更强 | - |
| 14 | SQLite 持久化 | JSON 文件 | 需迁移到 SQLite | 中 |
| 15 | 自动更新 | 无 | electron-updater | 低 |

---

## 二、超越 Codex 的差异化功能

### 我们有而 Codex 没有的

| 功能 | 说明 | 代码位置 |
|------|------|----------|
| 桌面操作录制 | 录制任意桌面应用操作（非仅浏览器） | computer-use-recorder/desktopRecorder |
| 视觉匹配回放 | 4级降级策略保证回放成功 | computer-use-recorder/visualMatcher |
| 自适应自愈 | 回放失败自动恢复 | computer-use-recorder/replayRecovery |
| 操作记忆 | 跨会话学习用户习惯 | computer-use-recorder/operationMemory |
| 变量参数化 | 自动检测可变参数+Zod schema | computer-use-recorder/variableAbstraction |
| Computer Use MCP | 完整桌面控制（截图/键鼠/剪贴板） | @ant/computer-use-mcp |
| Chrome 浏览器控制 | 原生 Chrome MCP 集成 | @ant/claude-for-chrome-mcp |
| Workflow Engine | 确定性任务编排（Journal 断点恢复） | workflow-engine 包 |
| 多模型支持 | 7个 provider（含本地/DeepSeek） | services/api/ |
| 语音输入 | Push-to-Talk 语音 | voice mode |
| Swarm/Agent 系统 | 多 Agent 协作 | packages/swarm |
| ACP 协议 | Agent-to-Agent 通信 | services/acp |

### 竞争优势总结

```
Codex = AI编程助手（仅代码场景）
我们 = AI办公全能助手（代码 + 浏览器 + 桌面 + 自动化）

核心差异：
1. 操作域更广 — 不限代码编辑，任何桌面操作都能录制和回放
2. 学习能力更强 — 自动从录制中学习技能，跨会话记忆
3. 回放更智能 — 4级视觉匹配 + 自愈恢复
4. 模型更灵活 — 7个 provider，支持本地私有模型
5. 自动化更深 — Workflow 确定性编排，不是纯 LLM 猜测
```

---

## 三、功能实现优先级排列

### P0 — 必须有（最小可用产品）

1. AI 对话界面（流式输出）
2. 多会话管理
3. 系统菜单和快捷键
4. 主题系统（白底黑字）
5. API Key 配置

### P1 — 核心体验（对标 Codex 基础功能）

6. 文件浏览器
7. 代码编辑器（Monaco）
8. 终端面板
9. 分面板布局
10. 工具权限确认
11. 命令面板
12. Git 状态面板

### P2 — 差异化能力（超越 Codex）

13. 录制按钮 + 状态
14. CDP 浏览器录制
15. 桌面事件录制
16. 回放面板 + 执行
17. 技能管理
18. 变量参数化 UI
19. 回放进度 + 自愈

### P3 — 产品化（发布品质）

20. 自动更新
21. 安装包构建
22. 启动优化
23. 内存优化
24. 新用户引导
25. 错误追踪
26. E2E 测试

---

## 四、用户场景对比

### 场景1：程序员写代码

| 步骤 | Codex | 我们的桌面App |
|------|-------|-------------|
| 1 | 打开 Codex，选择项目 | 打开App，选择项目 |
| 2 | 描述需求 | 描述需求 |
| 3 | AI生成代码 | AI生成代码 |
| 4 | 在编辑器中预览 | 在 Monaco 编辑器中预览 |
| 5 | 运行终端命令 | 在内置终端运行 |
| 6 | Git 提交 | Git 面板一键提交 |

**结论**: 功能对等，体验一致。

### 场景2：非技术人员做重复操作（我们独有）

| 步骤 | Codex | 我们的桌面App |
|------|-------|-------------|
| 1 | 不支持 | 点击"录制"按钮 |
| 2 | - | 在浏览器/桌面执行一次操作 |
| 3 | - | 点击"停止"，自动生成技能 |
| 4 | - | 下次点击"回放"，填入新参数 |
| 5 | - | 自动执行（视觉匹配+自愈） |

**结论**: 我们覆盖非技术用户场景，Codex 不能。

### 场景3：数据录入/表格操作（我们独有）

| 步骤 | 说明 |
|------|------|
| 1 | 录制一次"从 Excel 复制数据 → 粘贴到 ERP 系统"流程 |
| 2 | 生成技能（自动检测变量：行号、数据内容） |
| 3 | 批量回放（循环执行，每次不同行数据） |
| 4 | 出错自动恢复（弹窗关闭、页面刷新后继续） |

---

## 五、技术实现路径图

```
Week 1-2: Electron 基础 + 对话
  ├── 窗口框架
  ├── IPC 通信
  ├── 对话界面
  └── API 集成

Week 3-4: 核心功能（对齐 Codex）
  ├── 文件浏览 + 编辑器
  ├── 终端
  ├── Git
  └── 命令面板

Week 5-6: 差异化（超越 Codex）
  ├── 录制 UI
  ├── 回放 UI
  ├── 技能管理
  └── 变量参数化

Week 7-8: 产品化
  ├── 自动更新 + 安装包
  ├── 性能优化
  ├── E2E 测试
  └── 发布准备
```
