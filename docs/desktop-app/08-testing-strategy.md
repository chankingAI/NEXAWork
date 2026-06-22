# 测试策略 — 桌面应用质量保障

> 确保百分之百准确，企业级稳定性。

---

## 一、测试金字塔

```
            /\
           /  \     E2E 测试（Playwright）
          /    \    — 完整用户流程
         /──────\   — 跨进程通信验证
        /        \
       /  集成测试  \  — IPC 通信正确性
      /            \  — 组件组合交互
     /──────────────\  — 后端模块协作
    /                \
   /    单元测试       \  — 每个函数/组件
  /                    \  — 类型安全
 /──────────────────────\  — 边界条件
```

| 层级 | 数量 | 框架 | 运行时间 |
|------|------|------|----------|
| 单元测试 | 500+ | bun:test | <30s |
| 集成测试 | 100+ | bun:test | <60s |
| E2E测试 | 50+ | Playwright | <5min |

---

## 二、测试范围

### 2.1 Main Process 测试

| 模块 | 测试重点 |
|------|----------|
| IPC Registry | handler注册/调用/错误处理 |
| Window Manager | 窗口创建/关闭/状态保存 |
| File Operations | 读写/权限/大文件/编码 |
| Terminal Manager | PTY创建/输入输出/关闭 |
| Update Checker | 版本比较/下载/安装 |
| Auth/Keychain | 密钥存取/加密解密 |
| CDP Manager | 连接/断开/重连 |
| Recorder Bridge | 开始/停止/数据传输 |

### 2.2 Renderer 组件测试

| 组件 | 测试重点 |
|------|----------|
| ChatView | 消息渲染/流式/工具调用 |
| ChatInput | 输入/发送/快捷键/Markdown |
| FileTree | 展开折叠/搜索/大目录 |
| MonacoEditor | 打开/编辑/保存/语法高亮 |
| Terminal | 输入输出/颜色/滚动 |
| RecordButton | 状态切换/动画/计数 |
| ReplayPanel | 列表/预览/执行/进度 |
| SkillManager | CRUD/运行/参数 |
| CommandPalette | 搜索/选择/执行 |
| ThemeProvider | 切换/持久化/系统跟随 |

### 2.3 E2E 关键路径

| 路径编号 | 描述 | 步骤 |
|----------|------|------|
| E2E-01 | 首次启动引导 | 安装→启动→配置Key→完成 |
| E2E-02 | AI对话基本流 | 发送消息→等待回复→显示完整 |
| E2E-03 | 多会话管理 | 新建→切换→删除→验证独立 |
| E2E-04 | 文件编辑流 | 打开项目→浏览→编辑→保存 |
| E2E-05 | 终端使用 | 打开终端→执行命令→查看输出 |
| E2E-06 | 录制流程 | 开始录制→操作→停止→查看结果 |
| E2E-07 | 回放流程 | 选择录制→设参数→回放→查看报告 |
| E2E-08 | 技能生成 | 录制→生成Skill→运行Skill |
| E2E-09 | Git工作流 | 修改→暂存→提交→查看历史 |
| E2E-10 | 跨平台兼容 | 三平台分别运行全流程 |

---

## 三、性能测试基准

| 指标 | 目标 | 告警阈值 |
|------|------|----------|
| 冷启动时间 | <2s | >3s |
| 空闲内存 | <200MB | >300MB |
| 消息首字节延迟 | <500ms | >1s |
| 文件打开时间（1MB） | <100ms | >500ms |
| 终端输入延迟 | <50ms | >100ms |
| 录制事件延迟 | <10ms | >50ms |
| 主题切换时间 | <300ms | >500ms |

---

## 四、安全测试

| 检查项 | 验证方式 |
|--------|----------|
| API Key 不明文存储 | 检查文件系统 + 内存dump |
| IPC 不泄露 Node API | 渲染进程尝试 require('fs') 失败 |
| CSP 策略正确 | 注入外部脚本失败 |
| 录制不含密码 | 密码框输入后检查录制数据 |
| 自动更新签名验证 | 篡改更新包后拒绝安装 |

---

## 五、兼容性测试矩阵

| 平台 | 版本 | 测试方式 |
|------|------|----------|
| macOS | 12 (Monterey) + | CI + 手动 |
| macOS | Apple Silicon | CI |
| Windows | 10 21H2+ | CI + 手动 |
| Windows | 11 | CI |
| Ubuntu | 22.04 LTS | CI |
| Ubuntu | 24.04 LTS | CI |

---

## 六、持续集成配置

```
GitHub Actions Workflow:
├── lint-and-typecheck (每次push)
│   ├── bunx tsc --noEmit
│   └── bun run lint
├── unit-tests (每次push)
│   ├── bun test packages/desktop/src/
│   └── bun test packages/@ant/computer-use-recorder/
├── integration-tests (每次PR)
│   └── bun test --filter integration
├── e2e-tests (每次PR到main)
│   ├── macOS runner → Playwright
│   ├── Windows runner → Playwright
│   └── Linux runner → Playwright
├── build (每次release tag)
│   ├── macOS: electron-builder --mac
│   ├── Windows: electron-builder --win
│   └── Linux: electron-builder --linux
└── performance (每周定时)
    └── 基准测试 + 历史对比
```

---

## 七、质量门禁（合并 PR 前必须全部通过）

| 门禁 | 条件 |
|------|------|
| TypeScript | `bunx tsc --noEmit` 零错误 |
| Lint | `bun run lint` 零警告 |
| 单元测试 | 100% 通过 |
| 集成测试 | 100% 通过 |
| 覆盖率 | 核心模块 >80% |
| 包体积 | 不超过上个版本 +10% |
| 性能基准 | 不超过阈值 |
