# NexaWork API 接口开发提示词

> IPC 通信层完整 API 设计 — Main Process 暴露给 Renderer 的全部接口

---

## 一、IPC 接口总览

### 通信模式

| 模式 | 方向 | 用途 | 实现 |
|------|------|------|------|
| Request-Response | Renderer → Main → Renderer | 一次性查询 | ipcMain.handle() |
| Stream | Main → Renderer | AI 流式输出 | webContents.send() |
| Event | Main → Renderer | 状态变更通知 | webContents.send() |
| Bidirectional | 双向 | 权限确认/用户输入 | 组合使用 |

---

## 二、Chat API（对话核心）

### chat:send
```
输入: { sessionId: string, message: string, model?: string, mode?: 'craft'|'ask'|'plan' }
输出: { messageId: string, content: string, toolCalls?: ToolCall[] }
说明: 发送消息并等待完整回复（非流式）
后端对接: QueryEngine.query()
```

### chat:stream
```
输入: { sessionId: string, message: string, model?: string }
输出: 流式事件序列:
  - { type: 'token', data: string } — 文本 token
  - { type: 'tool_start', data: { name: string, input: object } } — 工具开始
  - { type: 'tool_result', data: { name: string, output: string } } — 工具结果
  - { type: 'done', data: { totalTokens: number } } — 完成
  - { type: 'error', data: { code: string, message: string } } — 错误
说明: 流式对话（主要使用模式）
后端对接: QueryEngine.query() + stream adapter
```

### chat:stop
```
输入: { sessionId: string }
输出: { success: boolean }
说明: 取消当前正在进行的对话
后端对接: AbortController.abort()
```

### chat:history
```
输入: { sessionId: string, limit?: number, before?: string }
输出: { messages: Message[], hasMore: boolean }
说明: 获取会话历史消息（分页）
后端对接: SQLite messages 表查询
```

### chat:regenerate
```
输入: { sessionId: string, messageId: string }
输出: 同 chat:stream
说明: 重新生成某条 AI 回复
```

---

## 三、Session API（会话管理）

### session:create
```
输入: { title?: string, scene?: string, model?: string, expertId?: string }
输出: { id: string, title: string, createdAt: string }
后端对接: SQLite sessions 表 INSERT
```

### session:list
```
输入: { workspaceId?: string, scene?: string, limit?: number }
输出: { sessions: Session[], total: number }
```

### session:get
```
输入: { id: string }
输出: Session（含完整配置）
```

### session:update
```
输入: { id: string, title?: string, model?: string, expertId?: string }
输出: { success: boolean }
```

### session:delete
```
输入: { id: string }
输出: { success: boolean }
```

### session:search
```
输入: { query: string, limit?: number }
输出: { sessions: Session[] }
说明: 全文搜索会话标题和消息内容
```

---

## 四、Model API（模型管理）

### model:list
```
输入: {}
输出: { models: ModelInfo[] }
ModelInfo: { id, name, provider, capability: 'high'|'medium', speed: number, available: boolean }
后端对接: 遍历 7 个 API Provider 的可用模型
```

### model:set
```
输入: { sessionId: string, modelId: string }
输出: { success: boolean }
```

### model:test
```
输入: { provider: string, apiKey: string, baseUrl?: string }
输出: { success: boolean, latencyMs: number, error?: string }
说明: 测试模型连接（发送 "hi" 验证）
```

### model:configure
```
输入: { provider: string, apiKey: string, baseUrl?: string, modelName?: string }
输出: { success: boolean }
说明: 配置自定义模型端点
后端对接: Electron safeStorage 加密存储 API Key
```

---

## 五、Expert API（专家系统）

### expert:list
```
输入: { category?: string, search?: string }
输出: { experts: Expert[], teams: ExpertTeam[] }
Expert: { id, name, role, avatar, description, tags[], category, usageCount }
```

### expert:get
```
输入: { id: string }
输出: Expert（含完整 system prompt）
```

### expert:summon
```
输入: { sessionId: string, expertId: string }
输出: { success: boolean, greeting: string }
说明: 在当前会话中激活专家
后端对接: 设置 QueryEngine 的 system prompt 为专家配置
```

### expert:create
```
输入: { name, role, description, systemPrompt, avatar?, tags[] }
输出: { id: string }
说明: 用户创建自定义专家
```

### expert:recent
```
输入: { limit?: number }
输出: { experts: Expert[] }
说明: 最近使用的专家列表
```

---

## 六、Skill API（技能系统）

### skill:list
```
输入: { category?: 'builtin'|'installed'|'created'|'recorded', search?: string }
输出: { skills: Skill[] }
Skill: { id, name, description, source, enabled, lastUsed?, usageCount }
```

### skill:install
```
输入: { source: 'file'|'url'|'marketplace', path: string }
输出: { id: string, name: string }
```

### skill:enable / skill:disable
```
输入: { id: string }
输出: { success: boolean }
```

### skill:execute
```
输入: { id: string, params?: Record<string, any> }
输出: 同 chat:stream（技能执行结果流式输出）
```

### skill:delete
```
输入: { id: string }
输出: { success: boolean }
```

---

## 七、Automation API（自动化）

### automation:list
```
输入: { status?: 'scheduled'|'completed'|'all' }
输出: { automations: Automation[] }
Automation: { id, name, workspace, prompt, schedule, validFrom, validTo, status, lastRun, nextRun }
```

### automation:create
```
输入: { name, workspace?, prompt, schedule: CronExpression, validFrom?, validTo?, connectors? }
输出: { id: string }
后端对接: CronCreateTool
```

### automation:update
```
输入: { id, name?, prompt?, schedule?, status?: 'active'|'paused' }
输出: { success: boolean }
```

### automation:delete
```
输入: { id: string }
输出: { success: boolean }
后端对接: CronDeleteTool
```

### automation:history
```
输入: { id: string, limit?: number }
输出: { runs: AutomationRun[] }
AutomationRun: { id, automationId, startedAt, finishedAt, status: 'success'|'failed', result? }
```

---

## 八、Recorder API（录制回放）

### recorder:start
```
输入: { mode: 'cdp'|'desktop'|'mixed', options?: RecordOptions }
输出: { recordingId: string }
后端对接: CdpRecorder.start() / DesktopRecorder.start()
RecordOptions: { screenshotInterval, passwordRedact, mouseTrack, elementCapture }
```

### recorder:stop
```
输入: { recordingId: string }
输出: { path: string, eventCount: number, duration: number }
```

### recorder:pause / recorder:resume
```
输入: { recordingId: string }
输出: { success: boolean }
```

### recorder:status（事件流）
```
输出: 实时事件:
  - { type: 'event_count', count: number }
  - { type: 'duration', seconds: number }
  - { type: 'screenshot', path: string }
```

### recorder:generateSkill
```
输入: { recordingId: string, name: string, description?: string }
输出: { skillId: string, variables: Variable[] }
后端对接: SkillGenerator.generate() + VariableAbstraction.detect()
```

### replay:start
```
输入: { skillId: string, params?: Record<string, any>, mode?: 'direct'|'adaptive' }
输出: { replayId: string }
后端对接: AdaptiveReplayEngine.execute()
```

### replay:status（事件流）
```
输出: 实时事件:
  - { type: 'step_start', step: number, description: string }
  - { type: 'step_complete', step: number, success: boolean }
  - { type: 'recovery', step: number, strategy: string }
  - { type: 'complete', report: ReplayReport }
```

### replay:stop
```
输入: { replayId: string }
输出: { success: boolean }
```

---

## 九、Project API（项目管理）

### project:list
```
输出: { projects: Project[] }
```

### project:create
```
输入: { name, description?, template?, path: string }
输出: { id: string }
```

### project:open
```
输入: { id: string }
输出: { path: string, gitBranch?: string }
说明: 设置当前工作目录
```

### project:delete
```
输入: { id: string }
输出: { success: boolean }
```

---

## 十、File API（文件操作）

### file:read
```
输入: { path: string }
输出: { content: string, language: string }
后端对接: FileReadTool
```

### file:write
```
输入: { path: string, content: string }
输出: { success: boolean }
后端对接: FileWriteTool
```

### file:tree
```
输入: { root: string, depth?: number }
输出: { tree: FileNode[] }
FileNode: { name, path, type: 'file'|'directory', children?: FileNode[] }
```

### file:search
```
输入: { root: string, pattern: string }
输出: { files: string[] }
后端对接: GlobTool / GrepTool
```

### file:watch（事件流）
```
输入: { path: string }
输出: 文件变更事件
```

---

## 十一、Git API

### git:status
```
输入: { path: string }
输出: { branch: string, changes: FileChange[], staged: FileChange[] }
```

### git:diff
```
输入: { path: string, file?: string }
输出: { diffs: DiffHunk[] }
```

### git:stage
```
输入: { path: string, files: string[] }
输出: { success: boolean }
```

### git:commit
```
输入: { path: string, message: string }
输出: { hash: string }
```

### git:push
```
输入: { path: string, remote?: string, branch?: string }
输出: { success: boolean }
```

### git:branches
```
输入: { path: string }
输出: { current: string, branches: string[] }
```

---

## 十二、Settings API

### settings:get
```
输入: { key?: string }
输出: Record<string, any>（全部设置或指定 key）
```

### settings:set
```
输入: { key: string, value: any }
输出: { success: boolean }
```

### settings:reset
```
输入: {}
输出: { success: boolean }
说明: 恢复默认设置
```

---

## 十三、Security API

### security:sandbox
```
输入: { enabled: boolean }
输出: { success: boolean }
```

### security:fileRules
```
输入: { whitelist?: string[], blacklist?: string[] }
输出: { success: boolean }
```

### security:auditLog
```
输入: { limit?: number, from?: string, to?: string }
输出: { logs: AuditEntry[] }
AuditEntry: { timestamp, action, resource, result: 'allowed'|'blocked', reason? }
```

### security:exportLogs
```
输入: { format: 'json'|'csv', from?: string, to?: string }
输出: { path: string }
```

---

## 十四、Terminal API

### terminal:create
```
输入: { shell?: 'bash'|'zsh'|'powershell', cwd?: string }
输出: { id: string }
```

### terminal:write
```
输入: { id: string, data: string }
输出: { success: boolean }
```

### terminal:output（事件流）
```
输出: { id: string, data: string }
```

### terminal:resize
```
输入: { id: string, cols: number, rows: number }
输出: { success: boolean }
```

### terminal:close
```
输入: { id: string }
输出: { success: boolean }
```

---

## 十五、接口总数统计

| 模块 | 接口数 | 说明 |
|------|--------|------|
| Chat | 5 | 核心对话 |
| Session | 6 | 会话管理 |
| Model | 4 | 模型配置 |
| Expert | 5 | 专家系统 |
| Skill | 5 | 技能管理 |
| Automation | 5 | 自动化 |
| Recorder | 5 | 录制控制 |
| Replay | 3 | 回放控制 |
| Project | 4 | 项目管理 |
| File | 5 | 文件操作 |
| Git | 5 | Git 操作 |
| Settings | 3 | 设置 |
| Security | 4 | 安全 |
| Terminal | 4 | 终端 |
| **总计** | **63** | **完整 IPC API** |

---

## 十六、错误处理统一格式

```
所有接口错误返回：
{
  error: {
    code: string,       // 'AUTH_REQUIRED' | 'MODEL_UNAVAILABLE' | 'PERMISSION_DENIED' | ...
    message: string,    // 用户可读错误信息
    details?: object    // 调试信息（仅开发模式）
  }
}

常见错误码：
- AUTH_REQUIRED — 需要 API Key
- MODEL_UNAVAILABLE — 模型不可用
- PERMISSION_DENIED — 权限不足
- SESSION_NOT_FOUND — 会话不存在
- NETWORK_ERROR — 网络连接失败
- RATE_LIMITED — API 请求频率限制
- STORAGE_FULL — 本地存储已满
```
