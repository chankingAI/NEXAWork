# NexaWork 前端开发提示词 — Part 3（N24-N40）

> Phase 5 + Phase 6：Record/Replay + 代码模式 + 安全中心 + 打包

---

## Prompt N24 — 录制按钮 + 状态指示器

```
任务：在主界面添加操作录制入口和实时状态显示。

现有代码参考：
- packages/@ant/computer-use-recorder/src/cdpRecorder.ts — CDP 录制器
- packages/@ant/computer-use-recorder/src/desktopRecorder.ts — 桌面录制器
- packages/@ant/computer-use-recorder/src/types.ts — 事件类型

要求：
1. RecordButton 组件（主界面右上角或场景 Tab 内）：
   - 未录制态：红色圆形按钮 + "录制" 文字
   - 录制中：红色脉冲动画 + 计时器 + 事件计数
   - 暂停态：灰色暂停图标
   - 点击开始/停止录制
2. RecordingStatusBar 组件（顶部状态栏）：
   - 录制中显示：● REC | 00:32 | 14 events | [暂停] [停止]
   - 脉冲动画（红色圆点 0.5s 闪烁）
3. 录制完成对话框：
   - "录制完成！是否生成技能？"
   - 选项：生成技能 / 保存录制 / 丢弃

集成约束：
- 通过 IPC 调用 CdpRecorder.start()/stop()
- 事件计数实时更新（每秒推送）
- 录制数据存储到本地 JSON

验收标准：
- 按钮状态切换正确
- 脉冲动画流畅
- 计时器精确
- 停止后弹出完成对话框
```

---

## Prompt N25 — 录制配置面板

```
任务：实现录制前的配置选项面板。

要求：
1. RecordConfigPanel 组件（点击录制按钮后展开）：
   - 录制模式选择：
     - 浏览器录制（CDP）— 录制 Chrome 操作
     - 桌面录制 — 录制任意桌面操作
     - 混合录制 — 同时录制两者
   - 选项配置：
     - 截图频率：操作时/每3秒/每5秒
     - 密码保护：自动脱敏密码框输入
     - 窗口过滤：选择要录制的窗口/应用
     - 鼠标轨迹：是否录制 mouse_move
   - 高级选项（可折叠）：
     - 元素捕获：开启 UI Automation 元素识别
     - 操作合并：自动合并连续按键/滚动
     - 最大时长：自动停止阈值
2. 开始按钮（配置完成后）：
   - "开始录制" 黑色大按钮
   - 3秒倒计时后开始

验收标准：
- 配置项正确保存
- 不同模式对应不同录制器
- 密码自动脱敏工作
- 倒计时后开始录制
```

---

## Prompt N26 — 回放面板

```
任务：实现录制回放的完整面板。

现有代码参考：
- packages/@ant/computer-use-recorder/src/replayEngine.ts — 回放引擎
- packages/@ant/computer-use-recorder/src/replayRecovery.ts — 自愈恢复
- packages/@ant/computer-use-recorder/src/visualMatcher.ts — 视觉匹配

要求：
1. ReplayPanel 组件：
   - 步骤列表（左侧）：
     - 每步：序号 + 操作类型图标 + 描述 + 状态(待执行/执行中/成功/失败/跳过)
     - 当前步骤高亮
     - 失败步骤红色 + 恢复策略标签
   - 进度区域（顶部）：
     - 进度条（总进度百分比）
     - 执行时间 + 预计剩余时间
   - 操作按钮：
     - 播放/暂停/停止/单步执行
     - 速度选择：0.5x / 1x / 2x / 5x
   - 截图预览（右侧）：
     - 当前步骤截图
     - 对比：录制时 vs 当前
2. 回放状态显示：
   - 正常执行：绿色进度
   - 自愈恢复：橙色 + "正在恢复..." + 策略名称
   - 失败：红色 + 错误描述
3. 回放完成报告：
   - 总步骤 / 成功 / 失败 / 恢复
   - 质量评分（0-100）
   - 耗时统计

集成约束：
- IPC 调用 AdaptiveReplayEngine
- 实时状态推送（每步完成后更新）
- 截图通过 IPC 传输（base64 或文件路径）

验收标准：
- 步骤列表实时更新
- 进度条准确
- 自愈恢复可视化
- 完成报告信息完整
```

---

## Prompt N27 — 技能管理面板（Skill CRUD）

```
任务：实现录制生成的技能管理面板。

要求：
1. RecordedSkillPanel 组件：
   - 技能列表：
     - 每项：图标 + 名称 + 描述 + 步骤数 + 最后使用时间
     - 右键菜单：执行/编辑/复制/导出/删除
   - 技能详情（点击展开）：
     - 步骤列表预览
     - 变量参数列表
     - 执行历史
     - 成功率统计
2. 执行技能：
   - 点击"执行" → 弹出参数填写表单
   - 参数表单由 variableAbstraction 的 Zod schema 动态生成
   - 填写完成 → 开始回放
3. 编辑技能：
   - 步骤重排序（拖拽）
   - 删除步骤
   - 修改步骤参数
   - 添加等待步骤
4. 从录制生成技能：
   - 录制完成后弹出
   - 显示检测到的变量
   - 用户确认/修改变量名和默认值
   - 生成 SKILL.md + workflow.js

集成约束：
- 对接 skillGenerator.ts 生成逻辑
- 对接 variableAbstraction.ts 变量检测
- 对接 Skill 系统存储（.claude/skills/）

验收标准：
- 技能列表正确
- 参数表单动态生成
- 执行后正确回放
- 编辑后保存正确
```

---

## Prompt N28 — Monaco 代码编辑器

```
任务：集成 Monaco Editor 实现代码编辑功能。

要求：
1. CodeEditor 组件：
   - Monaco Editor 嵌入（全功能）
   - 多 Tab 支持（同时打开多文件）
   - 语法高亮（自动检测语言）
   - 自动补全（基本 + AI 增强）
   - 文件保存（Ctrl+S → 写入磁盘）
   - 主题跟随系统（light/dark）
2. Diff 查看器：
   - Monaco DiffEditor 模式
   - Git 变更文件 diff 预览
   - 行内评论功能
3. 编辑器配置：
   - 字体：JetBrains Mono 13px
   - Tab 大小：2 spaces
   - 自动保存：延迟 1s
   - minimap：默认关闭
4. 与 AI 对话集成：
   - AI 修改文件后自动在编辑器中高亮变更
   - 选中代码 → 右键 "Ask AI about this"

集成约束：
- @monaco-editor/react 封装
- 文件读写通过 IPC（FileReadTool/FileWriteTool）
- Tab 状态持久化

验收标准：
- 打开文件正确显示
- 语法高亮正确
- 保存写入磁盘
- Diff 查看清晰
```

---

## Prompt N29 — 终端面板

```
任务：集成 xterm.js 实现内置终端。

要求：
1. TerminalPanel 组件：
   - xterm.js 终端嵌入
   - 多 Tab 支持（多个终端实例）
   - 新建/关闭终端标签
   - 终端尺寸自适应面板大小
2. PTY 后端：
   - Main Process 创建 node-pty 实例
   - 通过 IPC 双向通信（stdin/stdout）
   - 支持 bash/zsh/PowerShell
3. 终端样式：
   - 字体：JetBrains Mono 13px
   - 背景：#1A1A1A（暗色）
   - 文字：#F9FAFB
   - 支持 ANSI 颜色
4. 与 AI 集成：
   - AI 执行命令时在终端显示
   - 用户可在终端手动执行命令

集成约束：
- xterm.js + @xterm/addon-fit + @xterm/addon-web-links
- node-pty（Electron Main Process）
- 复用 BashTool 的 shell 管理

验收标准：
- 终端可执行命令
- 输出正确显示（含颜色）
- 多 Tab 独立
- resize 自适应
```

---

## Prompt N30 — 文件浏览器

```
任务：实现项目文件树浏览器。

要求：
1. FileBrowser 组件（侧边面板）：
   - 树形结构（递归展开/折叠）
   - 文件图标（按扩展名着色）
   - 搜索框（模糊搜索文件名）
   - 右键菜单：新建文件/文件夹、重命名、删除、复制路径
2. 文件操作：
   - 点击文件 → 在 Monaco 编辑器中打开
   - 双击文件夹 → 展开/折叠
   - 拖拽移动文件
3. 过滤规则：
   - 默认隐藏 .git/node_modules/.DS_Store
   - 尊重 .gitignore
4. 实时监听：
   - 文件系统变更实时更新树
   - 通过 fs.watch 或 chokidar

集成约束：
- 文件操作通过 IPC（Main Process 执行）
- 大目录懒加载（>100项时分批）
- 使用 Lucide React 文件图标

验收标准：
- 文件树正确显示
- 搜索实时过滤
- 新建/删除操作成功
- 外部变更实时同步
```

---

## Prompt N31 — Git 面板 + Diff

```
任务：实现 Git 状态面板和 Diff 查看器。

要求：
1. GitPanel 组件（侧边面板 Tab）：
   - 当前分支名 + 切换分支下拉
   - 变更文件列表：
     - 状态图标：M(修改)/A(新增)/D(删除)/R(重命名)
     - 文件路径
     - 点击查看 diff
   - 暂存区：
     - 暂存/取消暂存（单个/全部）
     - 已暂存文件列表
   - 提交区域：
     - 提交信息输入框
     - "提交" 按钮
     - "提交并推送" 按钮
2. DiffView（点击变更文件后）：
   - Monaco DiffEditor（左旧右新）
   - 行内 +/- 高亮
   - 可逐 hunk 暂存
3. 分支操作：
   - 新建分支
   - 切换分支
   - 合并分支
   - Pull/Push

集成约束：
- Git 操作通过 IPC 调用 simple-git 库
- Diff 数据通过 git diff 命令获取
- 复用 EnterWorktreeTool 的 worktree 概念

验收标准：
- 变更文件列表实时更新
- Diff 显示正确
- 提交 + Push 成功
- 分支切换正确
```

---

## Prompt N32 — 安全中心面板

```
任务：实现安全中心（对应 WorkBuddy 截图14/15）。

UI 参考（WorkBuddy 截图14）：
- 标题 "安全中心" + "安全能力由本地运行时提供" 标签
- 沙箱安全（开关 + 子配置）：文件安全/命令安全/网络安全
- 数据安全：安全网关(已开启) + 传输加密(已开启)
- 系统级工具：禁用/启用下拉
- 内置运行时（开关）：Python/Node.js/Git Bash 各有独立开关
- 审计中心：导出日志/清空记录
- 实验功能：版本管理/删除保护

要求：
1. SecurityCenterPage 组件：
   - 沙箱安全卡片：
     - 总开关（绿色）
     - 子项：文件安全 → / 命令安全 → / 网络安全 →（点击进入子页）
   - 数据安全卡片：
     - 安全网关状态（已开启/标签）
     - 传输加密状态（已开启/标签）
   - 系统级工具：下拉选择（禁用/仅读取/完全启用）
   - 内置运行时：
     - 总开关
     - Python: 开关 + 版本
     - Node.js: 开关 + 版本
     - Git Bash: 开关
   - 审计中心：
     - 拦截/放行记录列表
     - "导出日志" 按钮 + "清空记录" 按钮
   - 实验功能：
     - 版本管理：开关（文件版本追踪）
     - 删除保护：开关（删除进回收站）

集成约束：
- 对接 sandbox-runtime 包
- 对接 permissions 系统
- 审计日志存储到 SQLite

验收标准：
- 所有开关可切换
- 沙箱策略实际生效
- 审计日志完整记录
- 导出日志为 JSON 文件
```

---

## Prompt N33-N35 — 安全子页面（文件/命令/网络 + 运行时 + 审计）

```
（简略版，具体细节参考 N32）

N33: 文件安全白名单/黑名单 + 命令安全白名单 + 网络域名规则
N34: 内置运行时版本管理 + 安装/卸载
N35: 审计中心详情页 + 日志过滤 + 时间范围 + 导出格式选择
```

---

## Prompt N36 — 自动更新系统

```
任务：实现 Electron 应用自动更新。

要求：
1. 使用 electron-updater + GitHub Releases
2. 更新检查：启动时 + 每6小时
3. 更新流程：
   - 检测到新版本 → 显示更新对话框
   - 用户确认 → 后台下载
   - 下载完成 → "重启更新" 按钮
4. 增量更新（delta update）优先
5. 更新失败回滚机制

验收标准：
- 检测到新版本正确提示
- 下载进度显示
- 重启后版本更新
- 更新失败不影响当前版本
```

---

## Prompt N37 — 跨平台打包

```
任务：配置 electron-builder 构建跨平台安装包。

要求：
1. macOS: DMG + 签名 + 公证
2. Windows: NSIS 安装包 + EV 签名
3. Linux: AppImage + deb + rpm
4. 自动图标生成（1024x1024 → 各平台尺寸）
5. CI/CD：GitHub Actions 自动构建发布

验收标准：
- 三平台安装包可正常安装
- macOS 无 Gatekeeper 警告
- Windows 无 SmartScreen 警告
- 安装后正常启动
```

---

## Prompt N38 — E2E 测试套件

```
任务：创建完整的端到端测试。

要求：
1. Playwright + Electron 测试框架
2. 核心路径测试（50+用例）：
   - 启动应用 / 新建会话 / 发送消息 / 接收回复
   - 切换模型 / 切换模式 / 切换场景
   - 专家选择 / 技能安装 / 权限确认
   - 自动化创建 / 项目创建
   - 录制启动/停止 / 回放执行
   - 设置修改 / 主题切换
   - 文件打开/编辑/保存
   - 终端命令执行
   - Git 提交/推送
3. 性能测试：
   - 冷启动 <2s
   - 消息延迟 <500ms
   - 内存 <200MB

验收标准：
- 50+ E2E 测试全通过
- 性能基准满足
- CI 自动执行
```

---

## Prompt N39 — 性能优化

```
任务：确保应用性能达到企业级标准。

要求：
1. 冷启动优化（<2s）：
   - 延迟加载非核心模块
   - Preload 脚本最小化
   - V8 snapshot 预编译
2. 内存优化（<200MB 空闲）：
   - 虚拟滚动（长消息列表）
   - 图片懒加载 + 缓存
   - 关闭标签页释放内存
3. 渲染优化：
   - React.memo 减少重渲染
   - Web Worker 处理重计算
   - requestAnimationFrame 动画
4. 网络优化：
   - API 请求缓存
   - 流式传输（不等完整响应）
   - 断线重连

验收标准：
- 启动时间 <2s（冷启动）
- 内存 <200MB（空闲）
- 消息延迟 <500ms
- 100条消息滚动 60fps
```

---

## Prompt N40 — 新用户引导流程

```
任务：实现首次启动的新用户引导。

要求：
1. 5步引导流程：
   - Step 1: 欢迎页（品牌+简介+"开始"按钮）
   - Step 2: 选择使用场景（日常办公/代码开发/全部）
   - Step 3: 配置 AI 模型（输入 API Key 或选择本地模型）
   - Step 4: 选择语言和主题
   - Step 5: 完成！开始第一次对话
2. 引导样式：
   - 全屏遮罩 + 居中卡片
   - 进度指示器（5个点）
   - 可跳过（"跳过引导" 链接）
3. API Key 配置：
   - 支持 Anthropic / OpenAI / DeepSeek / 本地
   - 输入后测试连接
   - 加密存储

验收标准：
- 首次打开显示引导
- 可跳过任意步骤
- API Key 配置后可正常对话
- 再次打开不重复显示
```
