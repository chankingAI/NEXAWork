# NexaWork 完整功能规格书

> 基于 WorkBuddy UI 分析 + Codex 功能对标 + 现有 claude-code 代码资产
> 产品定位：世界级 AI 办公桌面软件（10-60岁用户，白底黑字，苹果级审美）

---

## 一、产品概述

**产品名称**: NexaWork
**产品定位**: AI 全能办公桌面软件（对标 Codex + WorkBuddy + Cursor）
**目标用户**: 10-60岁，技术人员和非技术人员均可使用
**核心差异**: 代码开发 + 日常办公 + 操作录制回放，三位一体

---

## 二、功能模块全景图（基于 WorkBuddy 截图分析）

### 模块A：主界面与导航（对应截图 1）

| 功能点 | WorkBuddy 实现 | NexaWork 实现方案 | 现有代码支撑 |
|--------|---------------|-----------------|-------------|
| 左侧导航栏 | 新建任务/助理/项目/专家/自动化/更多 | 同样结构 + Record/Replay 入口 | RCS Web UI Sidebar 组件 |
| 中央欢迎区 | 品牌名 + 场景切换 tabs | NexaWork 品牌 + 4场景 | 新建 |
| 底部输入框 | 对话输入 + 功能工具栏 | 复用 ChatInput 组件 | RCS ChatInput |
| 场景切换 | 日常办公/代码开发/设计创意 | + Record/Replay 场景 | 新建 |
| 吉祥物/品牌 | 猫形象 | 自定义品牌形象 | 新建 |

### 模块B：对话模式选择器（对应截图 2）

| 功能点 | WorkBuddy 实现 | NexaWork 对应 | 现有代码支撑 |
|--------|---------------|-------------|-------------|
| Craft 模式 | 深度开发/创作 | 对应 Codex 的完整任务模式 | QueryEngine 完整模式 |
| Ask 模式 | 快速问答 | 轻量对话（无工具调用） | QueryEngine ask-only |
| Plan 模式 | 任务规划 | 生成计划但不执行 | Workflow Engine plan |
| 召唤专家 | 选择AI专家人格 | Agent/专家系统 | Swarm/Agent 系统 |

### 模块C：多模型选择（对应截图 3）

| 功能点 | WorkBuddy 实现 | NexaWork 对应 | 现有代码支撑 |
|--------|---------------|-------------|-------------|
| Auto 模式 | 自动选最佳模型 | 智能路由 | services/api/ 多 provider |
| 模型列表 | GLM/Kimi/DeepSeek 等 | Claude/GPT/DeepSeek/本地 | 7个 API Provider |
| 能力标签 | High/Medium | 按任务类型推荐 | 新建路由逻辑 |
| 速度倍率 | 0.04x-1.06x | 延迟指标展示 | 新建 |
| Max 模式 | 切换推理深度 | Extended thinking | Claude API 已有 |
| 自定义模型 | + 配置自定义模型 | 自定义端点配置 | API Provider 架构已支持 |

### 模块D：技能系统（对应截图 4）

| 功能点 | WorkBuddy 实现 | NexaWork 对应 | 现有代码支撑 |
|--------|---------------|-------------|-------------|
| 技能搜索 | 搜索框过滤 | 同样搜索 | Skills 系统 |
| 内置技能 | 技能创建指南/self-improving-agent | 代码+办公+录制技能 | bundledSkills.ts |
| MCP 技能 | Brave Search MCP 等 | MCP Tool 集成 | MCP Client/Server |
| 导入技能 | 从市场导入 | 从市场/文件/URL 导入 | Skill 加载系统 |
| 技能自动使用 | 根据上下文自动调用 | 同样实现 | Skill 匹配逻辑 |

### 模块E：权限控制（对应截图 5）

| 功能点 | WorkBuddy 实现 | NexaWork 对应 | 现有代码支撑 |
|--------|---------------|-------------|-------------|
| 默认权限 | 有限文件/命令访问 | 沙箱内默认权限 | permissions 系统 |
| 完全访问权限 | 完整系统权限 | 用户确认后提升 | permissions/PermissionGate |

### 模块F：AI 对话界面（对应截图 6）

| 功能点 | WorkBuddy 实现 | NexaWork 对应 | 现有代码支撑 |
|--------|---------------|-------------|-------------|
| 专家人格 | "一人公司专家团" | 自定义 Agent 人格 | Swarm Agent System |
| 流式输出 | 逐字显示 | 同样实现 | Streaming 已有 |
| 参考资料链接 | 嵌入 URL | Markdown 渲染 | MessageBubble 组件 |
| 已完成标记 | "已完成 >" | 任务状态指示 | 新建 |
| 交互式问答 | 提问+选项 | 同样实现 | ChatView 组件 |

### 模块G：项目管理（对应截图 7）

| 功能点 | WorkBuddy 实现 | NexaWork 对应 | 现有代码支撑 |
|--------|---------------|-------------|-------------|
| 项目列表 | 我的项目 + 模板 | Git 项目 + 工作区 | Git 工具系统 |
| 项目模板 | 产品需求/市场调研/知识库/Bug追踪 | 开发+办公模板 | 新建 |
| 新建项目 | + 新建项目按钮 | 向导式创建 | 新建 |
| 项目成员 | 多人协同 | 团队协作 | ACP 协议 |

### 模块H：专家系统（对应截图 8/9/10）

| 功能点 | WorkBuddy 实现 | NexaWork 对应 | 现有代码支撑 |
|--------|---------------|-------------|-------------|
| 专家分类 | 内容创作/投资分析/法律咨询/小微企业/电商运营/数据分析 | 通用 + 自定义分类 | Agent System |
| 专家团队 | 交易分析团队（13角色） | 多 Agent 协作 | Swarm 包 |
| 精选场景 | 热门场景卡片 | 场景推荐 | 新建 |
| 最近召唤 | 最近使用的专家 | 历史记录 | observationStore |
| 团队详情 | 能力介绍/擅长领域/团队成员 | Agent 配置页 | 新建 |
| 召唤专家 | 底部工具栏一键召唤 | 同样交互 | 新建 UI |

### 模块I：自动化系统（对应截图 11/12）

| 功能点 | WorkBuddy 实现 | NexaWork 对应 | 现有代码支撑 |
|--------|---------------|-------------|-------------|
| 已安排列表 | 任务名/空间/频率/生效期 | 同样结构 | CronCreate/Delete/List |
| 已完成列表 | 执行记录（成功/失败） | 历史记录 | 新建 |
| 添加自动化 | 名称/工作空间/提示词/连接器/频率 | 同样表单 | Cron 工具 |
| 执行频率 | 周期/按间隔/单次 | cron 表达式 | Cron 工具 |
| 生效日期 | 起止日期 | 同样实现 | 新建 |
| 连接器 | 选择连接器 | MCP/Plugin 选择 | MCP Client |

### 模块J：系统设置（对应截图 13）

| 功能点 | WorkBuddy 实现 | NexaWork 对应 |
|--------|---------------|-------------|
| 账户管理 | 账号信息 | 用户资料 |
| 系统设置 | 语言/字体/阅读模式/发送键 | 同样实现 |
| 智能体设置 | AI 行为配置 | Agent 人格/温度/工具 |
| 记忆 | 跨会话记忆 | operationMemory 集成 |
| 模型 | 模型选择/配置 | API Provider 配置 |
| 助理设置 | 助手行为 | System Prompt 编辑 |
| 个性化 | 主题/外观 | 主题系统 |
| 数据管理 | 数据导入/导出/清理 | 本地数据管理 |
| 安全中心 | 沙箱/加密/审计 | 独立安全面板 |
| 帮助与反馈 | 文档/反馈渠道 | 帮助系统 |

### 模块K：安全中心（对应截图 14/15）

| 功能点 | WorkBuddy 实现 | NexaWork 对应 | 现有代码支撑 |
|--------|---------------|-------------|-------------|
| 沙箱安全 | 文件安全/命令安全/网络安全 | 分级隔离 | sandbox-runtime 包 |
| 数据安全 | 安全网关 + 传输加密 | HTTPS + 本地加密 | 新建 |
| 系统级工具 | WSL/wmic 等控制 | 系统工具开关 | permissions 系统 |
| 内置运行时 | Python/Node.js/Git Bash | Bun + Python + Git | 已有 |
| 审计中心 | 拦截/放行记录/日志导出 | 操作审计日志 | 新建 |
| 实验功能 | 版本管理/删除保护 | Feature Flag UI | feature 系统 |

### 模块L：Record/Replay 系统（NexaWork 独有）

| 功能点 | 说明 | 现有代码支撑 |
|--------|------|-------------|
| 录制按钮 | 主界面录制入口（红色圆点） | computer-use-recorder |
| 浏览器录制 | CDP 事件捕获 | cdpRecorder.ts |
| 桌面录制 | 跨平台操作捕获 | desktopRecorder.ts |
| 元素识别 | UI Automation 辅助信息 | elementCapture.ts |
| 视觉匹配 | 4级回放策略 | visualMatcher.ts |
| 自愈恢复 | 失败自动恢复 | replayRecovery.ts |
| 技能生成 | 录制→Skill 转换 | skillGenerator.ts |
| 变量参数化 | 检测可变参数 | variableAbstraction.ts |
| 操作记忆 | 跨会话习惯学习 | operationMemory.ts |

---

## 三、Codex 功能全面对标

| Codex 功能 | NexaWork 对应 | 实现方案 |
|-----------|-------------|---------|
| 多线程并行 | 多任务标签页 | Electron 多 WebView |
| Worktree 隔离 | Git Worktree UI | EnterWorktreeTool + UI |
| Local/Cloud 模式 | 本地/远程切换 | 新建 |
| Diff 面板 | Git Diff 查看 | Monaco DiffEditor |
| Inline 评论 | 代码内评论 | Monaco 评论 API |
| 自动化 (Automation) | 自动化面板 (对齐 WorkBuddy) | Cron 系统 + UI |
| Skills 管理 | 技能系统 (对齐 WorkBuddy) | Skill 系统 + UI |
| Plugins 目录 | 连接器/插件市场 | MCP + Plugin 系统 |
| Chrome 插件集成 | 内置浏览器控制 | chrome-mcp + CDP |
| IDE 同步 | VS Code 扩展 | 新建（P3） |
| 环境设置 | 运行时配置 | 安全中心 UI |
| Run 控制 | 执行/停止按钮 | Workflow Engine |
| Sidebar artifacts | 侧边栏产物预览 | 新建 |

---

## 四、界面布局规格

### 主界面三栏结构

```
┌──────────────────────────────────────────────────────────┐
│ 标题栏 (系统菜单 / 搜索 / 用户头像 / 成长积分)            │
├──────────┬───────────────────────────────────┬───────────┤
│          │                                   │           │
│ 导航栏    │        主内容区                     │ 侧边面板  │
│ (200px)  │    (自适应宽度)                     │ (300px)  │
│          │                                   │           │
│ 新建任务  │  场景: 日常办公 / 代码开发 / 设计创意  │ 文件树    │
│ 助理     │                                   │ Git状态   │
│ 项目     │  [对话内容 / 项目页 / 专家页]        │ 终端      │
│ 专家     │                                   │ 录制状态  │
│ 自动化   │                                   │           │
│ 更多     │                                   │           │
│          ├───────────────────────────────────┤           │
│ 任务列表  │  输入栏                            │           │
│ 空间列表  │  [模式选择][模型][技能][专家][权限]   │           │
│          │                                   │           │
├──────────┴───────────────────────────────────┴───────────┤
│ 状态栏 (录制状态 / 连接状态 / 版本信息)                     │
└──────────────────────────────────────────────────────────┘
```

### 颜色系统（苹果级白底黑字）

```
背景层:
  --bg-primary: #FFFFFF      (主背景)
  --bg-secondary: #F9FAFB    (次级背景/侧栏)
  --bg-tertiary: #F3F4F6     (卡片/悬浮)
  --bg-hover: #F0F0F0        (悬浮状态)

文字层:
  --text-primary: #1A1A1A    (主文字)
  --text-secondary: #6B7280  (次级文字)
  --text-tertiary: #9CA3AF   (辅助文字)

强调色:
  --accent: #1A1A1A          (主按钮/选中态，纯黑)
  --accent-green: #10B981    (成功/安全/已开启)
  --accent-red: #EF4444      (录制/错误/危险)
  --accent-orange: #F59E0B   (警告/限时)
  --accent-blue: #3B82F6     (链接/信息)

边框:
  --border: #E5E7EB          (分隔线)
  --border-focus: #1A1A1A    (聚焦态)
```

### 字体规格

```
标题 H1: 32px / 700 / line-height 1.2
标题 H2: 24px / 600 / line-height 1.3
正文: 14px / 400 / line-height 1.6
辅助: 12px / 400 / line-height 1.5
代码: 13px / JetBrains Mono / line-height 1.5

字体栈: -apple-system, BlinkMacSystemFont, "SF Pro Text", "Inter", sans-serif
```

---

## 五、技术架构总结

```
┌─ Electron Main Process ─────────────────────┐
│  窗口管理 / IPC Hub / 系统菜单 / 自动更新      │
│  沙箱策略 / 文件安全 / 命令安全 / 网络安全      │
│  Tray 图标 / 全局快捷键 / 原生通知             │
└──────────────────────────────────────────────┘
        ↕ IPC (contextBridge)
┌─ Renderer Process (React 19 + Vite) ────────┐
│  Sidebar / ChatView / ExpertPanel            │
│  AutomationPanel / ProjectPanel              │
│  SettingsPanel / SecurityCenter              │
│  RecordPanel / ReplayPanel / SkillPanel      │
│  Monaco Editor / xterm.js / File Browser     │
└──────────────────────────────────────────────┘
        ↕ IPC
┌─ Backend Process (Bun + claude-code) ────────┐
│  QueryEngine / API Providers (7个)            │
│  Tools (59个) / MCP Client+Server            │
│  Workflow Engine / Skill System               │
│  Recorder / Replayer / OperationMemory       │
│  Swarm Agent / ACP Protocol                  │
│  Sandbox Runtime / Permission System         │
└──────────────────────────────────────────────┘
```

---

## 六、与竞品差异化总结

| 维度 | Codex | WorkBuddy | Cursor | NexaWork |
|------|-------|-----------|--------|----------|
| 目标用户 | 开发者 | 办公用户 | 开发者 | 全部用户 |
| 核心能力 | 代码Agent | AI对话+专家 | 代码编辑 | 代码+办公+录制 |
| 操作录制 | 无 | 无 | 无 | 有（独有） |
| 专家系统 | 无 | 有 | 无 | 有 |
| 自动化 | 有 | 有 | 无 | 有 |
| 多模型 | 仅GPT | 国产模型 | Claude+GPT | 7个provider |
| 项目管理 | Worktree | 项目模板 | 无 | 两者结合 |
| 安全中心 | 基础 | 完整 | 基础 | 企业级 |
| 技能市场 | Plugin目录 | 技能搜索 | 无 | 两者结合 |
| 离线能力 | 无 | 无 | 部分 | 本地模型 |
