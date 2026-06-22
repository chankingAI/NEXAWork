# UI 设计规范 — Apple 级桌面 AI 办公应用

> 白底黑字、极简克制、功能即界面。对标 Apple 原生应用的设计质量。

---

## 一、设计原则

| 原则 | 说明 | 反面案例 |
|------|------|----------|
| 内容优先 | 界面服务于内容，装饰最少 | 多余的渐变、阴影、边框 |
| 信息密度 | 每个像素都有信息价值 | 大量留白、过大的间距 |
| 即时反馈 | 操作后 <100ms 有视觉响应 | 点击无反应、加载无指示 |
| 一致性 | 相同功能相同呈现 | 按钮样式不统一 |
| 可预测 | 用户能预期操作结果 | 意外弹窗、布局跳动 |

---

## 二、色彩系统

### 浅色模式（默认）

| Token | 值 | 用途 |
|-------|------|------|
| --bg-primary | #FFFFFF | 主背景 |
| --bg-secondary | #F8F9FA | 次级背景（侧边栏） |
| --bg-tertiary | #F1F3F5 | 第三级背景（输入框） |
| --text-primary | #1A1A1A | 主文字 |
| --text-secondary | #6B7280 | 次级文字 |
| --text-tertiary | #9CA3AF | 占位/禁用文字 |
| --border | #E5E7EB | 边框/分隔线 |
| --accent | #2563EB | 强调色（按钮/链接） |
| --accent-hover | #1D4ED8 | 强调色 hover |
| --success | #059669 | 成功状态 |
| --warning | #D97706 | 警告状态 |
| --error | #DC2626 | 错误状态 |
| --recording | #EF4444 | 录制中 |

### 深色模式

| Token | 值 | 用途 |
|-------|------|------|
| --bg-primary | #1A1A1A | 主背景 |
| --bg-secondary | #222222 | 次级背景 |
| --bg-tertiary | #2A2A2A | 第三级背景 |
| --text-primary | #FAFAFA | 主文字 |
| --text-secondary | #A1A1AA | 次级文字 |
| --border | #333333 | 边框 |
| --accent | #60A5FA | 强调色 |

---

## 三、排版系统

### 字体

```
--font-sans: system-ui, -apple-system, "Segoe UI", "Ubuntu", sans-serif
--font-mono: "JetBrains Mono", "Fira Code", "SF Mono", "Menlo", monospace
```

### 字号层级

| 级别 | 大小 | 行高 | 用途 |
|------|------|------|------|
| title-lg | 20px | 28px | 页面标题 |
| title | 16px | 24px | 区域标题 |
| body | 14px | 20px | 正文 |
| body-sm | 13px | 18px | 次级正文 |
| caption | 12px | 16px | 辅助说明 |
| code | 13px | 20px | 代码（等宽字体） |

### 字重

| 用途 | 字重 |
|------|------|
| 正文 | 400 (Regular) |
| 强调 | 500 (Medium) |
| 标题 | 600 (Semibold) |

---

## 四、间距系统（8px 网格）

| Token | 值 | 用途 |
|-------|------|------|
| space-1 | 4px | 图标与文字间距 |
| space-2 | 8px | 组件内间距 |
| space-3 | 12px | 相关元素间距 |
| space-4 | 16px | 区域内间距 |
| space-5 | 20px | 区域间间距 |
| space-6 | 24px | 面板间距 |
| space-8 | 32px | 大分区间距 |

---

## 五、组件规范

### 按钮

| 类型 | 样式 | 用途 |
|------|------|------|
| Primary | 蓝底白字，圆角6px | 主要操作 |
| Secondary | 灰底黑字，圆角6px | 次要操作 |
| Ghost | 透明，hover灰底 | 工具栏/图标按钮 |
| Danger | 红底白字 | 危险操作 |
| Recording | 红色圆形，脉冲动画 | 录制按钮 |

### 输入框

- 边框：1px solid --border
- 圆角：6px
- 高度：36px
- focus：边框变为 --accent
- 占位文字：--text-tertiary

### 对话消息

- 用户消息：右对齐，浅蓝背景(#EFF6FF)
- AI消息：左对齐，无背景
- 代码块：灰色背景(#F8F9FA)，等宽字体
- 工具调用：折叠面板，灰色标签

### 侧边栏

- 宽度：240px（可调整，最小180px，最大400px）
- 背景：--bg-secondary
- 选中项：--accent 左边框 + 浅蓝背景

### 状态栏

- 高度：24px
- 背景：--bg-secondary
- 字号：12px
- 内容：当前分支 / 模型 / 语言 / 行列号

---

## 六、动效规范

| 场景 | 动画 | 时长 | 曲线 |
|------|------|------|------|
| 面板展开/折叠 | 高度变化 | 200ms | ease-out |
| 消息出现 | 淡入 + 上滑 | 150ms | ease-out |
| 按钮 hover | 背景色变化 | 100ms | ease |
| 主题切换 | 全局颜色过渡 | 300ms | ease-in-out |
| 录制脉冲 | 透明度循环 | 1000ms | ease-in-out |
| 加载指示 | shimmer | 1500ms | linear |

**原则**: 动效是功能反馈，不是装饰。用户不应该"等待动画完成"。

---

## 七、布局断点

| 窗口宽度 | 布局变化 |
|----------|----------|
| ≥1280px | 三栏：文件树 + 编辑器 + 侧面板 |
| 900-1279px | 两栏：文件树 + 编辑器 |
| <900px | 单栏：编辑器（文件树折叠为按钮） |

---

## 八、无障碍要求

- 对比度：文字/背景 ≥ 4.5:1（WCAG AA）
- 焦点指示：所有可交互元素有清晰 focus ring
- 键盘导航：Tab 遍历所有操作
- 屏幕阅读器：关键区域有 ARIA 标签
- 字号可调：支持 Cmd+/- 缩放

---

## 九、图标系统

使用 Lucide React（已有依赖），风格：
- 线条：1.5px 粗细
- 尺寸：16px（正文内）/ 20px（按钮内）/ 24px（标题级）
- 颜色：跟随文字颜色

关键图标映射：
- 录制：Circle（红色填充 + 脉冲）
- 停止：Square（红色填充）
- 回放：Play（绿色）
- 暂停：Pause
- 技能：Sparkles
- 文件夹：Folder/FolderOpen
- 终端：Terminal
- Git：GitBranch
- 设置：Settings
- 搜索：Search
