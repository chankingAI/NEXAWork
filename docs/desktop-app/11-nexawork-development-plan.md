# NexaWork 桌面应用 — 完整开发计划

> 基于 WorkBuddy UI + Codex 功能 + Record/Replay + 现有 claude-code 后端
> 目标：10-60岁用户可用，苹果级审美，白底黑字，企业级稳定

---

## 一、开发阶段总览（6阶段 / 12周）

| 阶段 | 周期 | 核心交付 | 里程碑 |
|------|------|---------|--------|
| Phase 1 | Week 1-2 | Electron 基础 + 对话核心 | 能发消息、收回复 |
| Phase 2 | Week 3-4 | 导航系统 + 多场景 + 多模型 | 完整主界面 |
| Phase 3 | Week 5-6 | 专家系统 + 技能市场 + 权限 | WorkBuddy 功能对齐 |
| Phase 4 | Week 7-8 | 自动化 + 项目管理 + 设置 | 办公功能完整 |
| Phase 5 | Week 9-10 | Record/Replay UI + 代码开发模式 | 差异化功能 |
| Phase 6 | Week 11-12 | 安全中心 + 打包 + E2E测试 | 发布就绪 |

---

## 二、Phase 1 — Electron 基础 + AI 对话（Week 1-2）

### 目标
让用户能打开桌面应用，输入问题，收到 AI 流式回复。

### 交付物
- Electron 窗口 + React 19 渲染
- IPC 通信层（Main ↔ Renderer）
- 对话界面（ChatView + 流式输出）
- 后端 QueryEngine 接入
- 基础主题（白底黑字）

### 技术决策
- Electron 33+ (Chromium 130+)
- React 19 + Vite 6 + Tailwind CSS 4
- electron-vite 构建工具
- SQLite (better-sqlite3) 会话存储
- Zustand 状态管理

### Prompt 编号
- N1: Electron 脚手架
- N2: IPC 通信层
- N3: 对话界面
- N4: QueryEngine 集成
- N5: 主题系统基础

---

## 三、Phase 2 — 导航系统 + 多场景 + 多模型（Week 3-4）

### 目标
实现完整主界面布局，支持场景切换和多模型选择。

### 交付物
- 左侧导航栏（新建任务/助理/项目/专家/自动化/更多）
- 场景切换 Tabs（日常办公/代码开发/设计创意/Record）
- 模式选择器（Craft/Ask/Plan）
- 多模型选择面板（7个 provider）
- 多会话管理（SQLite 持久化）
- 欢迎页 + 品牌展示

### 技术决策
- Radix UI 组件库（Dropdown/Tabs/Dialog）
- React Router 路由管理
- 会话列表 + 空间分组
- 模型能力标签 + 延迟指标

### Prompt 编号
- N6: 左侧导航栏
- N7: 场景切换 Tabs
- N8: 模式选择器（Craft/Ask/Plan）
- N9: 多模型选择面板
- N10: 多会话管理
- N11: 欢迎页

---

## 四、Phase 3 — 专家系统 + 技能市场 + 权限（Week 5-6）

### 目标
实现 AI 专家人格系统、技能搜索/安装、权限控制。

### 交付物
- 专家列表页（分类/搜索/精选场景）
- 专家团队详情（能力/成员/召唤）
- 底部输入栏专家选择器
- 技能搜索面板
- 技能安装/导入/启用
- 权限控制（默认/完全访问）

### 技术决策
- Agent System (Swarm 包) 对接前端
- Skill 系统加载 + 动态启用
- 权限分级（沙箱/标准/完全）
- 专家配置存储（本地 JSON）

### Prompt 编号
- N12: 专家列表页
- N13: 专家团队详情
- N14: 专家选择器（输入栏集成）
- N15: 技能搜索面板
- N16: 技能管理（安装/导入/启用）
- N17: 权限控制 UI

---

## 五、Phase 4 — 自动化 + 项目管理 + 设置（Week 7-8）

### 目标
实现定时任务自动化、项目管理、完整设置系统。

### 交付物
- 自动化列表（已安排/已完成/执行记录）
- 添加自动化表单（名称/提示词/频率/连接器）
- 项目列表 + 模板
- 项目新建向导
- 系统设置全面板（10个分类）
- 数据管理（导入/导出/清理）

### 技术决策
- Cron 工具（CronCreate/Delete/List）对接 UI
- MCP 连接器选择
- 设置持久化（settings.json + SQLite）
- 项目模板系统

### Prompt 编号
- N18: 自动化列表面板
- N19: 添加自动化表单
- N20: 项目管理页
- N21: 系统设置面板
- N22: 智能体/助理/记忆设置
- N23: 数据管理

---

## 六、Phase 5 — Record/Replay UI + 代码开发模式（Week 9-10）

### 目标
集成 Record/Replay 前端、代码开发工具面板。

### 交付物
- 录制按钮 + 状态指示器
- 录制配置面板（浏览器/桌面/选择）
- 回放面板（进度/步骤/自愈状态）
- 技能管理面板（生成的 Skill 列表）
- 代码编辑器（Monaco Editor）
- 终端面板（xterm.js）
- 文件浏览器
- Git 状态面板 + Diff 查看

### 技术决策
- computer-use-recorder 对接 Electron IPC
- Monaco Editor 嵌入
- xterm.js + node-pty 终端
- Git 集成（diff/commit/push）

### Prompt 编号
- N24: 录制按钮 + 状态
- N25: 录制配置面板
- N26: 回放面板
- N27: 技能管理面板（Skill CRUD）
- N28: Monaco 代码编辑器
- N29: 终端面板
- N30: 文件浏览器
- N31: Git 面板 + Diff

---

## 七、Phase 6 — 安全中心 + 打包 + E2E 测试（Week 11-12）

### 目标
实现企业级安全控制、跨平台打包、完整测试覆盖。

### 交付物
- 安全中心面板（沙箱/数据安全/审计）
- 文件安全/命令安全/网络安全配置
- 内置运行时管理（Python/Node.js/Git）
- 审计中心（日志导出）
- 自动更新系统（electron-updater）
- 跨平台打包（DMG/NSIS/AppImage）
- E2E 测试（Playwright 50+ 用例）
- 启动性能优化（<2s）
- 内存优化（<200MB）

### 技术决策
- 沙箱策略（sandbox-runtime 对接）
- electron-updater + GitHub Releases
- electron-builder 多平台
- Playwright + Electron 测试

### Prompt 编号
- N32: 安全中心面板
- N33: 沙箱/文件/命令/网络安全
- N34: 内置运行时管理
- N35: 审计中心
- N36: 自动更新系统
- N37: 跨平台打包
- N38: E2E 测试套件
- N39: 性能优化
- N40: 新用户引导流程

---

## 八、依赖关系图

```
N1 (Electron) → N2 (IPC) → N3 (对话) → N4 (QueryEngine) → N5 (主题)
                                ↓
N6 (导航) → N7 (场景) → N8 (模式) → N9 (模型) → N10 (会话) → N11 (欢迎)
                                ↓
N12 (专家列表) → N13 (团队详情) → N14 (专家选择器)
N15 (技能搜索) → N16 (技能管理) → N17 (权限)
                                ↓
N18 (自动化列表) → N19 (添加自动化)
N20 (项目) → N21 (设置) → N22 (智能体设置) → N23 (数据管理)
                                ↓
N24 (录制按钮) → N25 (录制配置) → N26 (回放面板) → N27 (技能面板)
N28 (Monaco) → N29 (终端) → N30 (文件) → N31 (Git)
                                ↓
N32 (安全中心) → N33 (安全配置) → N34 (运行时) → N35 (审计)
N36 (更新) → N37 (打包) → N38 (测试) → N39 (性能) → N40 (引导)
```

---

## 九、人力与工期评估

| 角色 | 人数 | 负责阶段 |
|------|------|---------|
| 前端开发 (Electron + React) | 2人 | Phase 1-6 |
| 后端开发 (IPC + 集成) | 1人 | Phase 1, 4, 5 |
| UI/UX 设计师 | 1人 | 全程 |
| QA 测试 | 1人 | Phase 5-6 |

**1人开发模式**: 12周（按 Prompt N1-N40 顺序执行）
**2人并行模式**: 8周（前端/后端并行）
**4人团队模式**: 6周（模块并行开发）

---

## 十、质量门禁（每个 Prompt 完成后必须通过）

1. `bunx tsc --noEmit` — TypeScript 零错误
2. `bun run lint` — Lint 零警告
3. `bun test` — 全部测试通过
4. 新功能附带单元测试（覆盖率 >80%）
5. Electron 应用可正常启动
6. 响应延迟 <500ms（UI 交互）
7. 内存增长 <10MB/小时（无泄漏）
