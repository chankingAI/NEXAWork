# Phase 4 开发提示词 — 产品化打磨

> 自动更新、安装包、性能优化、用户引导、测试。

---

## Prompt D22 — 自动更新系统

```
任务：实现应用自动更新功能。

技术方案：
- electron-updater + GitHub Releases

要求：
1. 更新检测：
   - 启动时自动检查（非阻塞）
   - 菜单 Help → Check for Updates 手动检查
   - 后台下载（不打断用户工作）
2. 更新流程：
   - 检测到新版本 → 后台下载 → 通知"新版本已就绪"
   - 用户点击"重启并更新" → 关闭App → 安装 → 重新启动
   - 支持"稍后提醒"
3. 发布流程：
   - git tag v1.0.0 → GitHub Actions 自动构建 → 上传 Release
   - 三平台自动构建（macOS/Windows/Linux）
   - 代码签名（macOS + Windows）

验收：发布新版本 → App检测到更新 → 下载 → 重启更新成功

集成约束：
- 更新源：GitHub Releases（公开）或自建服务器（私有）
- macOS：DMG + Universal Binary（Intel + Apple Silicon）
- Windows：NSIS installer + 静默更新
- Linux：AppImage（自包含）
```

---

## Prompt D23 — 安装包构建

```
任务：配置跨平台安装包构建流程。

技术方案：
- electron-builder

要求：
1. macOS 构建：
   - 输出 .dmg（拖拽安装界面）
   - Universal Binary（x64 + arm64）
   - Apple Developer 代码签名
   - Notarization（公证）
   - 应用图标（.icns，1024x1024）
2. Windows 构建：
   - 输出 .exe（NSIS installer）
   - 代码签名
   - 开始菜单 + 桌面快捷方式
   - 应用图标（.ico，多尺寸）
3. Linux 构建：
   - 输出 .AppImage + .deb + .rpm
   - 应用图标（.png，多尺寸）
   - .desktop 文件（应用菜单注册）
4. CI/CD 配置：
   - GitHub Actions workflow
   - 三平台并行构建
   - 自动上传到 Releases

验收：CI 自动构建 → 三平台安装包可下载 → 安装运行正常

集成约束：
- electron-builder.yml 配置文件
- 包内不含源码（仅 dist/）
- 排除 node_modules 中的测试文件
- 最终包体积 macOS <150MB, Windows <120MB
```

---

## Prompt D24 — 启动性能优化

```
任务：冷启动时间优化到 2 秒以内。

要求：
1. 首屏优化：
   - 骨架屏（启动瞬间显示白色窗口+灰色占位）
   - 核心UI优先加载，非首屏延迟加载
   - React.lazy + Suspense 按路由拆分
2. 后端预加载：
   - Main Process 启动时预初始化 API 客户端
   - SQLite 连接池预热
   - MCP 客户端后台连接
3. V8 快照：
   - 预编译常用模块
   - electron --v8-cache-options
4. 资源优化：
   - 图片资源压缩
   - CSS tree-shaking
   - JS bundle 分块（vendor/app/lazy）

验收：冷启动测量 <2s（从点击图标到首屏可交互）

集成约束：
- 使用 Vite 的 code splitting
- 监控启动时间指标
- 不为启动速度牺牲功能完整性
```

---

## Prompt D25 — 内存优化

```
任务：空闲时内存控制在 200MB 以内。

要求：
1. 进程分离：
   - AI 推理在独立 Worker
   - 录制/回放在独立 Worker
   - 文件监控在独立进程
2. 未激活标签冻结：
   - 非活跃编辑器标签释放 DOM
   - 非活跃终端暂停渲染
3. 内存泄漏防护：
   - 对话历史分页（一次只渲染最近50条）
   - 大文件编辑器虚拟化
   - IPC 消息及时清理
4. 监控：
   - 开发模式显示内存使用
   - 超过阈值自动 GC 提示

验收：打开3个文件 + 1个终端 + 对话 → 空闲5分钟 → 内存 <200MB

集成约束：
- 使用 process.memoryUsage() 监控
- Worker 通过 MessageChannel 通信
- Electron BrowserWindow webPreferences.backgroundThrottling = true
```

---

## Prompt D26 — 新用户引导

```
任务：首次启动时的用户引导流程。

要求：
1. 欢迎页面：
   - 应用Logo + 简介
   - "开始使用" 按钮
2. API Key 配置：
   - 引导输入 Anthropic API Key
   - 或选择其他模型（OpenAI/Gemini/本地）
   - 测试连接按钮
3. 项目设置：
   - 打开已有项目 / 创建新项目
   - 设置默认终端
4. 功能介绍：
   - 3-5步快速导览（对话/录制/技能）
   - 每步有截图或动画示意
   - 可跳过
5. 完成：
   - 进入主界面
   - 首次显示快捷键提示

验收：全新安装 → 启动 → 按引导完成配置 → 可正常使用

集成约束：
- 引导状态存储（不重复显示）
- 可从设置中重新触发引导
- 引导步骤不超过5步
```

---

## Prompt D27 — 错误追踪与遥测

```
任务：集成错误追踪和匿名使用统计。

现有代码参考：
- 项目中已有 Sentry 和 OpenTelemetry 依赖

要求：
1. 错误追踪（Sentry）：
   - 未捕获异常自动上报
   - 用户可在设置中关闭
   - 不上传用户代码/对话内容
   - 只上报：错误栈、系统信息、功能使用路径
2. 匿名遥测：
   - 功能使用频率（哪些功能最常用）
   - 性能指标（启动时间、内存峰值）
   - 默认开启，设置中可关闭
   - 遵循 do-not-track 浏览器设置
3. 崩溃恢复：
   - 异常退出检测
   - 重启后恢复上次会话
   - 自动保存对话草稿

验收：触发一个错误 → Sentry dashboard 看到上报 → 用户无感知

集成约束：
- 复用项目已有的 Sentry 配置
- 遵循 GDPR（欧盟用户可完全关闭）
- 首次启动征求遥测同意
```

---

## Prompt D28 — 端到端测试

```
任务：编写关键路径的 E2E 测试。

技术方案：
- Playwright + electron-playwright

要求：
1. 测试用例覆盖：
   - 启动并显示主界面
   - 发送消息并收到回复
   - 创建/切换/删除会话
   - 打开项目并浏览文件
   - 编辑文件并保存
   - 执行终端命令
   - 开始/停止录制
   - 运行 Skill
   - 切换主题
   - 窗口调整大小
2. CI 集成：
   - GitHub Actions 中自动运行
   - 三平台分别测试
   - 失败时截图上传 Artifacts
3. 性能基准测试：
   - 启动时间测量
   - 内存峰值测量
   - 消息响应延迟

验收：CI 中所有 E2E 测试通过 → 性能指标在阈值内

集成约束：
- 使用 Playwright 的 electron 支持
- 测试不依赖真实 API（mock responses）
- 测试文件放在 packages/desktop/tests/e2e/
```
