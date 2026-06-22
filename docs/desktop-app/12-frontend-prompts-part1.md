# NexaWork 前端开发提示词 — Part 1（N1-N11）

> Phase 1 + Phase 2：Electron 基础 + 导航 + 多场景 + 多模型

---

## Prompt N1 — Electron 脚手架搭建

```
任务：创建 NexaWork Electron 桌面应用基础框架。

现有代码参考：
- packages/remote-control-server/web/ — React 19 + Vite 6 项目结构
- packages/remote-control-server/web/vite.config.ts — Vite 配置参考
- packages/remote-control-server/package.json — React 19 + Tailwind 4 依赖声明

要求：
1. 在 packages/desktop/ 创建新 workspace package
2. 使用 electron-vite 构建工具（Electron + Vite 一体化）
3. 目录结构：
   - src/main/ — Electron Main Process
   - src/renderer/ — React 19 渲染进程
   - src/preload/ — Preload 脚本（contextBridge）
   - src/shared/ — 共享类型定义
4. Main Process 入口：创建 BrowserWindow（1280x800 默认）
5. 配置 Tailwind CSS 4 + PostCSS
6. 配置 TypeScript strict mode
7. package.json 中声明 workspace:* 引用

技术规格：
- Electron 33+（Chromium 130+）
- React 19 + ReactDOM 19
- Vite 6 (通过 electron-vite)
- Tailwind CSS 4
- TypeScript 5.7+ strict

验收标准：
- `bun install` 成功（workspace 解析正确）
- `bun run dev:desktop` 启动 Electron 窗口
- 窗口显示 "NexaWork" 文字（白底黑字）
- `bunx tsc --noEmit` 零错误
```

---

## Prompt N2 — IPC 通信层

```
任务：实现 Electron Main ↔ Renderer 的类型安全 IPC 通信。

现有代码参考：
- src/services/api/claude.ts — API 调用模式
- packages/remote-control-server/web/src/hooks/ — React hooks 模式

开源参考：
- Codex 架构：70-method 集中 handler 注册（每个 handler 对应一个 IPC channel）

要求：
1. 创建 src/shared/ipc-channels.ts：
   - 定义所有 IPC channel 名称（类型安全枚举）
   - 初始 channels：chat:send, chat:stream, session:create, session:list,
     model:list, model:set, skill:list, expert:list, settings:get, settings:set
2. 创建 src/main/ipc-handlers.ts：
   - 集中注册所有 ipcMain.handle() 处理器
   - 每个 handler 有明确的输入/输出类型
3. 创建 src/preload/index.ts：
   - contextBridge.exposeInMainWorld('nexawork', api)
   - api 对象包含所有可调用方法
4. 创建 src/renderer/hooks/useIPC.ts：
   - React Hook 封装 IPC 调用
   - 自动处理 loading/error 状态
5. 流式通信：
   - chat:stream 使用 ipcRenderer.on 接收流式 token
   - 支持取消（AbortController 模式）

集成约束：
- preload 脚本必须在 sandbox: true 环境下工作
- 所有 IPC 方法有 TypeScript 类型约束（输入+输出）
- 错误统一格式：{ code: string, message: string }

验收标准：
- Renderer 调用 window.nexawork.chat.send(msg) 可收到响应
- 流式消息逐 token 到达 Renderer
- TypeScript 类型完整（误调用编译期报错）
```

---

## Prompt N3 — AI 对话界面

```
任务：实现核心对话界面（消息列表 + 输入框 + 流式输出）。

现有代码参考：
- packages/remote-control-server/web/components/chat/ChatView.tsx — 对话视图
- packages/remote-control-server/web/components/chat/ChatInput.tsx — 输入框
- packages/remote-control-server/web/components/chat/MessageBubble.tsx — 消息气泡

要求：
1. ChatView 组件：
   - 消息列表（用户消息右对齐，AI消息左对齐）
   - 支持 Markdown 渲染（代码块、链接、列表）
   - 流式输出动画（逐字显示 + 光标闪烁）
   - 自动滚动到底部
   - "已完成" 状态标记（参考 WorkBuddy 截图6）
2. ChatInput 组件：
   - 多行输入（Shift+Enter 换行，Enter 发送）
   - 占位文字："今天帮你做些什么？"
   - 发送按钮（黑色圆形，右下角）
   - 支持引用对话文件（@ 提及）
3. MessageBubble 组件：
   - 用户消息：灰底圆角
   - AI 消息：白底 + 左侧品牌图标
   - 操作按钮：复制/点赞/朗读/更多
4. 参考资料链接嵌入（如 WorkBuddy 截图6中的配套阅读链接）

技术规格：
- react-markdown + remark-gfm（Markdown 渲染）
- prism-react-renderer（代码高亮）
- Radix UI ScrollArea（滚动区域）
- CSS animation（流式光标）

验收标准：
- 输入消息 → AI 流式回复 → 完整显示
- Markdown 正确渲染（代码块、表格、链接）
- 消息操作按钮可用
- 超长消息不卡顿（虚拟滚动）
```

---

## Prompt N4 — QueryEngine 后端集成

```
任务：将 claude-code 的 QueryEngine 接入 Electron IPC 层。

现有代码参考：
- src/QueryEngine.ts — 核心查询引擎（对话状态、compaction、工具调用）
- src/query.ts — API 查询函数（流式响应）
- src/services/api/claude.ts — API 客户端

要求：
1. 创建 src/main/backend/engine.ts：
   - 封装 QueryEngine 初始化（单例模式）
   - 配置 API Provider（从设置读取）
   - 管理工具注册（59个内置工具）
2. IPC handler 实现：
   - chat:send — 调用 QueryEngine.query()，返回完整响应
   - chat:stream — 流式输出每个 token（通过 event emitter）
   - chat:stop — 取消当前请求
   - chat:history — 获取会话历史
3. 工具调用处理：
   - 工具执行结果实时推送到 Renderer
   - 工具权限确认通过 IPC 询问用户
4. 错误处理：
   - API Key 无效 → 提示配置
   - 网络超时 → 自动重试（3次）
   - Token 超限 → 自动 compaction

集成约束：
- QueryEngine 运行在 Main Process（非 Worker）
- 复用现有 services/api/ 全部 provider
- 复用现有 tools.ts 工具注册逻辑
- 不修改 QueryEngine 本身代码

验收标准：
- 发送 "hello" → 收到 Claude 流式回复
- 工具调用正确执行（如文件读取）
- 会话历史持久化到 SQLite
- 切换模型后下次对话使用新模型
```

---

## Prompt N5 — 主题系统基础

```
任务：实现白底黑字的苹果级主题系统。

现有代码参考：
- packages/remote-control-server/web/src/index.css — Tailwind 配置
- docs/desktop-app/07-ui-design-spec.md — UI 设计规格

要求：
1. 创建 src/renderer/styles/theme.css：
   - CSS 变量定义（颜色/字体/间距/阴影/圆角）
   - Light 主题（默认）：白底(#FFFFFF)、黑字(#1A1A1A)
   - Dark 主题：深灰底(#1A1A1A)、白字(#F9FAFB)
2. 颜色系统：
   - 背景：primary(#FFFFFF) / secondary(#F9FAFB) / tertiary(#F3F4F6)
   - 文字：primary(#1A1A1A) / secondary(#6B7280) / tertiary(#9CA3AF)
   - 强调：accent(#1A1A1A) / green(#10B981) / red(#EF4444) / orange(#F59E0B)
   - 边框：default(#E5E7EB) / focus(#1A1A1A)
3. 字体系统：
   - 系统字体栈：-apple-system, "SF Pro Text", "Inter", sans-serif
   - 代码字体：JetBrains Mono, Menlo, monospace
   - 大小：12/13/14/16/20/24/32px
4. 间距系统：4px 基准（4/8/12/16/20/24/32/48/64）
5. 圆角系统：sm(4px) / md(8px) / lg(12px) / xl(16px) / full(9999px)
6. 阴影系统：sm/md/lg/xl（参考 Apple HIG）
7. 动效系统：
   - 时长：fast(150ms) / normal(250ms) / slow(350ms)
   - 缓动：ease-out（进入）/ ease-in（退出）

集成约束：
- 通过 Tailwind CSS 4 自定义主题扩展
- 支持 prefers-color-scheme 自动切换
- 所有颜色通过 CSS 变量引用（不硬编码）

验收标准：
- 默认白底黑字，干净清爽
- 切换暗色主题流畅（无闪烁）
- 所有组件颜色一致
- 对比度满足 WCAG AA 标准（4.5:1）
```

---

## Prompt N6 — 左侧导航栏

```
任务：实现主界面左侧导航栏（对应 WorkBuddy 截图1左侧）。

现有代码参考：
- packages/remote-control-server/web/components/ — React 组件模式

UI 参考（WorkBuddy 截图1）：
- 顶部：品牌 logo + 搜索 + 筛选图标
- 主导航：新建任务 / 助理 / 项目 / 专家 / 自动化 / 更多
- 中部：任务列表（最近任务）
- 下部：空间列表（分组折叠）
- 底部：用户头像 + 通知 + 帮助

要求：
1. Sidebar 组件（固定宽度 200px，可折叠到 52px）：
   - 顶部区域：NexaWork logo + 搜索按钮 + 筛选按钮
   - 主导航项：图标 + 文字（活跃态高亮）
     - 新建任务（+ 图标）
     - 助理（对话图标）
     - 项目（文件夹图标）
     - 专家（用户组图标）
     - 自动化（闪电图标）
     - 更多（网格图标）→ 展开子菜单（资料库/灵感）
   - 分隔线
   - 任务列表区域：最近4-5个任务（标题截断 + 时间）
   - 空间列表区域：可折叠分组（展开显示子空间）
   - 底部：用户头像 + 通知铃铛 + 帮助图标
2. 导航项交互：
   - 点击切换主内容区
   - 活跃态：左侧 3px 黑色竖线 + 文字加粗
   - 悬浮态：背景色 #F3F4F6
3. 折叠模式：
   - 仅显示图标（hover 显示 tooltip）
   - 通过顶部按钮切换

技术规格：
- Lucide React 图标库
- Radix UI Tooltip（折叠态提示）
- CSS transition 折叠动画

验收标准：
- 导航项切换正确
- 折叠/展开流畅（250ms 过渡）
- 任务列表实时更新
- 响应式（窗口缩小时自动折叠）
```

---

## Prompt N7 — 场景切换 Tabs

```
任务：实现主内容区顶部的场景切换标签页（对应 WorkBuddy 截图1中央 tabs）。

UI 参考：
- WorkBuddy 截图1：日常办公 / 代码开发(选中态黑底白字) / 设计创意
- 每个场景切换后，底部输入栏的工具选项会变化

要求：
1. SceneTabs 组件：
   - 4个场景标签：
     - 日常办公（文档图标）— 对话 + 文档 + 搜索
     - 代码开发（代码图标，选中态黑底白字圆角按钮）— 编辑器 + 终端 + Git
     - 设计创意（画笔图标）— 图片生成 + 设计工具
     - Record/Replay（录制图标，红色圆点）— 录制 + 回放 + 技能
   - 选中态：黑底白字圆角按钮（border-radius: 20px）
   - 未选中态：透明背景灰色文字
2. 场景切换效果：
   - 切换场景 → 工具栏选项变化
   - 切换场景 → 侧边面板内容变化
   - 切换场景 → 快捷指令变化
3. 场景下方的快捷标签：
   - 日常办公：日常开发 / 网站开发 / Agent 应用 / 更多
   - 代码开发：前端 / 后端 / 数据库 / DevOps
   - Record/Replay：浏览器录制 / 桌面录制 / 技能回放

验收标准：
- 点击标签切换场景（无页面刷新）
- 选中态视觉明确（黑底白字）
- 切换动画流畅（150ms）
- 场景状态独立保持
```

---

## Prompt N8 — 模式选择器（Craft/Ask/Plan）

```
任务：实现对话模式下拉选择器（对应 WorkBuddy 截图2）。

UI 参考（WorkBuddy 截图2）：
- 底部输入栏左侧 "Craft v" 下拉按钮
- 下拉面板：Craft(选中) / Ask / Plan / 召唤专家(箭头展开)
- 每个选项有图标 + 说明文字

要求：
1. ModeSelector 组件：
   - 触发器：当前模式名 + 下箭头（如 "Craft ▾"）
   - 下拉面板选项：
     - Craft（笔图标）— "深度创作与开发" — 完整工具调用
     - Ask（问号图标）— "快速问答" — 仅文本回复
     - Plan（文档图标）— "任务规划" — 生成计划不执行
     - 召唤专家（用户图标 + 右箭头）— 展开专家子菜单
   - 选中项显示勾号
2. 模式切换逻辑：
   - Craft → QueryEngine 完整模式（tools 全开）
   - Ask → QueryEngine 仅回答模式（tools 关闭）
   - Plan → QueryEngine 规划模式（EnterPlanModeTool）
   - 召唤专家 → 打开专家选择面板
3. 模式持久化：记住用户上次选择

验收标准：
- 下拉菜单显示正确
- 模式切换影响 AI 行为
- Ask 模式不触发工具调用
- Plan 模式生成步骤列表但不执行
```

---

## Prompt N9 — 多模型选择面板

```
任务：实现模型选择下拉面板（对应 WorkBuddy 截图3）。

UI 参考（WorkBuddy 截图3）：
- 顶部 "Max 模式" 开关
- "内置模型" 分组标题
- 模型列表：图标 + 名称 + 能力标签(High/Medium) + 速度倍率
- 选中项显示绿色勾号
- 底部 "+ 配置自定义模型"

要求：
1. ModelSelector 组件：
   - 触发器：底部输入栏的模型图标按钮
   - 面板结构：
     - Max 模式开关（Extended Thinking）
     - 内置模型列表：
       - Auto（自动选择最佳模型）— High — 绿色勾号
       - Claude Sonnet — High
       - Claude Haiku — Medium — 速度快
       - GPT-4o — High
       - DeepSeek-V3 — High — 最快
       - Gemini 2.0 — Medium
       - 本地模型 — Medium（如已配置）
     - 每项：品牌图标 + 名称 + 能力标签 + 速度指标
   - 底部 "+ 配置自定义模型" 链接
2. 能力标签颜色：
   - High: 绿色背景
   - Medium: 灰色背景
3. 速度指标：相对于 Auto 的倍率（0.1x - 2.0x）
4. Max 模式：
   - 开启 → 使用 Extended Thinking（更深推理）
   - 关闭 → 标准模式

集成约束：
- 对接 src/services/api/ 的 7 个 provider
- 模型选择存储到会话配置
- 切换模型不丢失对话历史

验收标准：
- 模型列表正确显示
- 切换模型后下次回复使用新模型
- Max 模式切换影响推理深度
- 自定义模型配置流程完整
```

---

## Prompt N10 — 多会话管理

```
任务：实现多会话管理（创建/切换/删除/搜索）。

UI 参考：
- WorkBuddy 截图1左侧"任务(4)"区域
- 每个任务显示标题 + 时间

要求：
1. SessionList 组件（左侧导航栏内）：
   - 会话列表：标题 + 相对时间（"11天前"）
   - 搜索框：模糊搜索会话标题和内容
   - 新建按钮：创建新会话
   - 右键菜单：重命名/删除/置顶/归档
2. 会话数据结构：
   - id: UUID
   - title: string（自动从第一条消息生成）
   - scene: 'office' | 'code' | 'design' | 'record'
   - model: string
   - messages: Message[]
   - createdAt: Date
   - updatedAt: Date
3. SQLite 持久化：
   - sessions 表：id, title, scene, model, created_at, updated_at
   - messages 表：id, session_id, role, content, created_at
4. 空间分组（对应 WorkBuddy 的"空间"概念）：
   - 用户可创建空间（项目分组）
   - 会话可归属到空间

验收标准：
- 创建新会话 → 自动切换
- 切换会话 → 加载历史消息
- 删除会话 → 确认后永久删除
- 搜索 → 实时过滤结果
```

---

## Prompt N11 — 欢迎页

```
任务：实现应用启动时的欢迎页面（对应 WorkBuddy 截图1中央区域）。

UI 参考（WorkBuddy 截图1）：
- 品牌名大字："NexaWork"
- 副标题："你的开发超能力"
- 场景 Tabs（日常办公/代码开发/设计创意）
- 快捷标签行（日常开发/网站开发/Agent应用/更多）
- 吉祥物图片（右侧）
- 底部输入框

要求：
1. WelcomePage 组件：
   - 品牌标题：NexaWork（32px 粗体，居中）
   - 副标题："AI 全能办公助手"（16px 灰色）
   - 场景 Tabs（复用 N7 的 SceneTabs）
   - 快捷标签行（可点击跳转对应场景）
   - 右侧品牌图标/吉祥物区域
2. 快捷入口：
   - 根据场景显示不同快捷标签
   - 点击快捷标签 → 预填输入框
3. 首次使用引导：
   - 检测是否首次打开
   - 首次显示简单引导（3步）

验收标准：
- 无会话时显示欢迎页
- 有会话时直接进入对话
- 快捷标签可点击
- 品牌展示清晰美观
```
