/**
 * NexaWork i18n (N21)
 * ===================
 * A tiny, dependency-free internationalization layer. The active language is
 * driven by the persisted `language` setting and switching it updates the
 * whole UI live via a subscribable singleton (same pattern as the theme hook).
 *
 * The zh-CN dictionary is the source of truth for the set of message keys;
 * `en` and `ja` are type-checked to provide every key, so a missing
 * translation is a compile error rather than a runtime surprise.
 */
import type { LanguageCode } from '../../shared/settings'

const zhCN = {
  // App / settings shell
  'settings.title': '设置',
  'common.comingSoon': '即将推出',
  'common.resetAll': '恢复默认',

  // Left navigation (10 items)
  'nav.account': '账户管理',
  'nav.system': '系统设置',
  'nav.agent': '智能体设置',
  'nav.memory': '记忆',
  'nav.model': '模型',
  'nav.assistant': '助理设置',
  'nav.personalization': '个性化',
  'nav.data': '数据管理',
  'nav.security': '安全中心',
  'nav.help': '帮助与反馈',

  // System settings tab
  'system.title': '系统设置',
  'system.language.label': '显示语言',
  'system.language.desc': '切换整个界面的显示语言。',
  'system.fontSize.label': '字体大小',
  'system.fontSize.desc': '调整界面的基础字号。',
  'system.fontSize.small': '小',
  'system.fontSize.large': '大',
  'system.readingMode.label': '阅读模式',
  'system.readingMode.desc': '对话界面以纯文本显示，关闭富文本渲染。',
  'system.sendKey.label': '发送消息',
  'system.sendKey.desc': '选择发送消息的快捷键。',
  'system.skillAutoUpdate.label': '技能自动更新',
  'system.skillAutoUpdate.desc': '有新版本时自动更新已安装的技能。',
  'system.skillAutoInstall.label': '非高风险技能自动安装',
  'system.skillAutoInstall.desc': '自动安装非高风险技能，无需逐个确认。',
  'system.lockScreenRemote.label': '锁屏远程',
  'system.lockScreenRemote.desc': '允许在锁屏状态下进行远程控制。',
  'system.confirmDefaultStorage.label': '默认工作空间存储确认',
  'system.confirmDefaultStorage.desc': '写入默认存储路径前进行确认。',

  // Language option labels
  'lang.zh-CN': '中文（简体）',
  'lang.en': '英文',
  'lang.ja': '日文',

  // Send-key option labels
  'sendKey.Enter': 'Enter',
  'sendKey.Ctrl+Enter': 'Ctrl+Enter',

  // Personalization tab
  'personalization.theme.label': '主题',
  'personalization.theme.desc': '选择浅色、深色或跟随系统。',
  'theme.light': '浅色',
  'theme.dark': '深色',
  'theme.system': '跟随系统',

  // Common (N22)
  'common.save': '保存',
  'common.cancel': '取消',
  'common.delete': '删除',

  // Agent settings tab (N22)
  'agent.title': '智能体设置',
  'agent.systemPrompt.label': 'System Prompt',
  'agent.systemPrompt.desc':
    '定义智能体的角色与行为，支持 Markdown，修改后即时生效。',
  'agent.temperature.label': '温度',
  'agent.temperature.desc': '控制回复的随机性，越低越稳定，越高越发散。',
  'agent.maxTokens.label': '最大 Token',
  'agent.maxTokens.desc': '限制单次回复的最大长度。',
  'agent.enabledTools.label': '启用的工具',
  'agent.enabledTools.desc': '勾选允许智能体调用的工具。',

  // Assistant settings tab (N22)
  'assistant.title': '助理设置',
  'assistant.name.label': '助理名称',
  'assistant.name.desc': '自定义助理在对话中显示的名称。',
  'assistant.avatar.label': '助理头像',
  'assistant.avatar.desc': '从预设中选择一个头像。',
  'assistant.greeting.label': '问候语',
  'assistant.greeting.desc': '开启新对话时助理的第一句话。',
  'assistant.replyStyle.label': '回复风格',
  'assistant.replyStyle.desc': '设置助理回复的整体语气。',
  'replyStyle.professional': '专业',
  'replyStyle.friendly': '友好',
  'replyStyle.concise': '简洁',

  // Memory settings tab (N22)
  'memory.title': '记忆',
  'memory.enabled.label': '记忆总开关',
  'memory.enabled.desc': '开启后，助理会记录并利用操作记忆。',
  'memory.frequency.label': '记忆频率',
  'memory.frequency.desc': '设置操作记忆的记录频率。',
  'memoryFreq.always': '总是',
  'memoryFreq.smart': '智能',
  'memoryFreq.manual': '手动',
  'memory.retention.label': '保留时长（天）',
  'memory.retention.desc': '超过该天数的记忆会被自动清理。',
  'memory.list.label': '记忆内容',
  'memory.empty': '暂无记忆记录。',
  'memory.clearAll': '清空所有记忆',
  'memory.clearConfirm': '确定要清空所有记忆吗？此操作不可撤销。',
  'memory.category': '分类',
  'memory.createdAt': '时间',

  // Model settings tab (N22)
  'model.title': '模型',
  'model.default.label': '默认模型',
  'model.default.desc': '选择新对话默认使用的模型。',
  'model.apiKey.label': 'API Key',
  'model.apiKey.desc': '各服务商的 API Key 通过系统加密存储。',
  'model.apiKey.placeholder': '输入 API Key',
  'model.apiKey.configured': '已配置',
  'model.apiKey.notConfigured': '未配置',
  'model.customEndpoint.label': '自定义端点',
  'model.customEndpoint.desc': '覆盖默认服务商地址（可选）。',
  'model.test.label': '连接测试',
  'model.test.desc': '发送测试请求验证模型是否可用。',
  'model.test.button': '测试连接',
  'model.test.testing': '测试中…',
  'model.test.success': '连接成功',
  'model.test.failure': '连接失败，请检查 API Key 与端点',
  'model.encryption.unavailable': '系统加密不可用，将以本地编码降级保存。',
} as const

export type MessageKey = keyof typeof zhCN
type Messages = Record<MessageKey, string>

const en: Messages = {
  'settings.title': 'Settings',
  'common.comingSoon': 'Coming soon',
  'common.resetAll': 'Restore defaults',

  'nav.account': 'Account',
  'nav.system': 'System',
  'nav.agent': 'Agent',
  'nav.memory': 'Memory',
  'nav.model': 'Models',
  'nav.assistant': 'Assistant',
  'nav.personalization': 'Personalization',
  'nav.data': 'Data',
  'nav.security': 'Security',
  'nav.help': 'Help & Feedback',

  'system.title': 'System',
  'system.language.label': 'Display language',
  'system.language.desc': 'Switch the language of the entire interface.',
  'system.fontSize.label': 'Font size',
  'system.fontSize.desc': 'Adjust the base font size of the interface.',
  'system.fontSize.small': 'Small',
  'system.fontSize.large': 'Large',
  'system.readingMode.label': 'Reading mode',
  'system.readingMode.desc': 'Show chat messages as plain text (no markdown).',
  'system.sendKey.label': 'Send message',
  'system.sendKey.desc': 'Choose the shortcut that sends a message.',
  'system.skillAutoUpdate.label': 'Auto-update skills',
  'system.skillAutoUpdate.desc':
    'Automatically update installed skills when a new version is available.',
  'system.skillAutoInstall.label': 'Auto-install non-risky skills',
  'system.skillAutoInstall.desc':
    'Install non-high-risk skills automatically without confirmation.',
  'system.lockScreenRemote.label': 'Lock-screen remote',
  'system.lockScreenRemote.desc':
    'Allow remote control while the screen is locked.',
  'system.confirmDefaultStorage.label': 'Confirm default workspace storage',
  'system.confirmDefaultStorage.desc':
    'Ask for confirmation before writing to the default storage path.',

  'lang.zh-CN': 'Chinese (Simplified)',
  'lang.en': 'English',
  'lang.ja': 'Japanese',

  'sendKey.Enter': 'Enter',
  'sendKey.Ctrl+Enter': 'Ctrl+Enter',

  'personalization.theme.label': 'Theme',
  'personalization.theme.desc': 'Choose light, dark, or follow the system.',
  'theme.light': 'Light',
  'theme.dark': 'Dark',
  'theme.system': 'System',

  'common.save': 'Save',
  'common.cancel': 'Cancel',
  'common.delete': 'Delete',

  'agent.title': 'Agent',
  'agent.systemPrompt.label': 'System Prompt',
  'agent.systemPrompt.desc':
    'Define the agent role and behaviour. Markdown supported; changes apply immediately.',
  'agent.temperature.label': 'Temperature',
  'agent.temperature.desc':
    'Controls reply randomness — lower is more focused, higher is more creative.',
  'agent.maxTokens.label': 'Max tokens',
  'agent.maxTokens.desc': 'Limit the maximum length of a single reply.',
  'agent.enabledTools.label': 'Enabled tools',
  'agent.enabledTools.desc': 'Select which tools the agent may use.',

  'assistant.title': 'Assistant',
  'assistant.name.label': 'Assistant name',
  'assistant.name.desc': 'Customise the name shown for the assistant.',
  'assistant.avatar.label': 'Assistant avatar',
  'assistant.avatar.desc': 'Pick an avatar from the presets.',
  'assistant.greeting.label': 'Greeting',
  'assistant.greeting.desc': 'The first message shown in a new conversation.',
  'assistant.replyStyle.label': 'Reply style',
  'assistant.replyStyle.desc': 'Set the overall tone of replies.',
  'replyStyle.professional': 'Professional',
  'replyStyle.friendly': 'Friendly',
  'replyStyle.concise': 'Concise',

  'memory.title': 'Memory',
  'memory.enabled.label': 'Memory master switch',
  'memory.enabled.desc':
    'When on, the assistant records and uses operation memories.',
  'memory.frequency.label': 'Memory frequency',
  'memory.frequency.desc': 'How often operation memories are recorded.',
  'memoryFreq.always': 'Always',
  'memoryFreq.smart': 'Smart',
  'memoryFreq.manual': 'Manual',
  'memory.retention.label': 'Retention (days)',
  'memory.retention.desc': 'Memories older than this are pruned automatically.',
  'memory.list.label': 'Memory entries',
  'memory.empty': 'No memories yet.',
  'memory.clearAll': 'Clear all memories',
  'memory.clearConfirm': 'Clear all memories? This action cannot be undone.',
  'memory.category': 'Category',
  'memory.createdAt': 'Time',

  'model.title': 'Models',
  'model.default.label': 'Default model',
  'model.default.desc':
    'Choose the model used by default for new conversations.',
  'model.apiKey.label': 'API key',
  'model.apiKey.desc': 'API keys per provider are stored encrypted by the OS.',
  'model.apiKey.placeholder': 'Enter API key',
  'model.apiKey.configured': 'Configured',
  'model.apiKey.notConfigured': 'Not configured',
  'model.customEndpoint.label': 'Custom endpoint',
  'model.customEndpoint.desc': 'Override the default provider URL (optional).',
  'model.test.label': 'Connection test',
  'model.test.desc': 'Send a test request to verify the model is reachable.',
  'model.test.button': 'Test connection',
  'model.test.testing': 'Testing…',
  'model.test.success': 'Connection successful',
  'model.test.failure': 'Connection failed — check the API key and endpoint',
  'model.encryption.unavailable':
    'OS encryption unavailable; keys will be saved with a local fallback.',
}

const ja: Messages = {
  'settings.title': '設定',
  'common.comingSoon': '近日公開',
  'common.resetAll': 'デフォルトに戻す',

  'nav.account': 'アカウント',
  'nav.system': 'システム設定',
  'nav.agent': 'エージェント設定',
  'nav.memory': 'メモリ',
  'nav.model': 'モデル',
  'nav.assistant': 'アシスタント設定',
  'nav.personalization': 'パーソナライズ',
  'nav.data': 'データ管理',
  'nav.security': 'セキュリティ',
  'nav.help': 'ヘルプとフィードバック',

  'system.title': 'システム設定',
  'system.language.label': '表示言語',
  'system.language.desc': 'インターフェース全体の表示言語を切り替えます。',
  'system.fontSize.label': '文字サイズ',
  'system.fontSize.desc': 'インターフェースの基本文字サイズを調整します。',
  'system.fontSize.small': '小',
  'system.fontSize.large': '大',
  'system.readingMode.label': '読書モード',
  'system.readingMode.desc':
    'チャットをプレーンテキストで表示します（マークダウン無効）。',
  'system.sendKey.label': 'メッセージ送信',
  'system.sendKey.desc': 'メッセージを送信するショートカットを選択します。',
  'system.skillAutoUpdate.label': 'スキルの自動更新',
  'system.skillAutoUpdate.desc':
    '新しいバージョンがある場合、インストール済みスキルを自動更新します。',
  'system.skillAutoInstall.label': '低リスクスキルの自動インストール',
  'system.skillAutoInstall.desc':
    '低リスクのスキルを確認なしで自動的にインストールします。',
  'system.lockScreenRemote.label': 'ロック画面リモート',
  'system.lockScreenRemote.desc': '画面ロック中のリモート操作を許可します。',
  'system.confirmDefaultStorage.label': 'デフォルト保存先の確認',
  'system.confirmDefaultStorage.desc':
    'デフォルトの保存先に書き込む前に確認します。',

  'lang.zh-CN': '中国語（簡体字）',
  'lang.en': '英語',
  'lang.ja': '日本語',

  'sendKey.Enter': 'Enter',
  'sendKey.Ctrl+Enter': 'Ctrl+Enter',

  'personalization.theme.label': 'テーマ',
  'personalization.theme.desc': 'ライト・ダーク・システム連動から選択します。',
  'theme.light': 'ライト',
  'theme.dark': 'ダーク',
  'theme.system': 'システム',

  'common.save': '保存',
  'common.cancel': 'キャンセル',
  'common.delete': '削除',

  'agent.title': 'エージェント設定',
  'agent.systemPrompt.label': 'システムプロンプト',
  'agent.systemPrompt.desc':
    'エージェントの役割と振る舞いを定義します。Markdown 対応・変更は即時反映。',
  'agent.temperature.label': '温度',
  'agent.temperature.desc':
    '返信のランダム性を制御します。低いほど安定、高いほど多様になります。',
  'agent.maxTokens.label': '最大トークン',
  'agent.maxTokens.desc': '1 回の返信の最大長を制限します。',
  'agent.enabledTools.label': '有効なツール',
  'agent.enabledTools.desc': 'エージェントが使用できるツールを選択します。',

  'assistant.title': 'アシスタント設定',
  'assistant.name.label': 'アシスタント名',
  'assistant.name.desc': '会話で表示されるアシスタント名をカスタマイズします。',
  'assistant.avatar.label': 'アシスタントアイコン',
  'assistant.avatar.desc': 'プリセットからアイコンを選択します。',
  'assistant.greeting.label': 'あいさつ',
  'assistant.greeting.desc': '新しい会話を開始したときの最初のメッセージ。',
  'assistant.replyStyle.label': '返信スタイル',
  'assistant.replyStyle.desc': '返信全体のトーンを設定します。',
  'replyStyle.professional': 'プロフェッショナル',
  'replyStyle.friendly': 'フレンドリー',
  'replyStyle.concise': '簡潔',

  'memory.title': 'メモリ',
  'memory.enabled.label': 'メモリのマスタースイッチ',
  'memory.enabled.desc': 'オンにすると、操作メモリを記録・活用します。',
  'memory.frequency.label': 'メモリ頻度',
  'memory.frequency.desc': '操作メモリを記録する頻度を設定します。',
  'memoryFreq.always': '常時',
  'memoryFreq.smart': 'スマート',
  'memoryFreq.manual': '手動',
  'memory.retention.label': '保持期間（日）',
  'memory.retention.desc': 'この日数を超えたメモリは自動的に削除されます。',
  'memory.list.label': 'メモリ一覧',
  'memory.empty': 'メモリはまだありません。',
  'memory.clearAll': 'すべてのメモリを消去',
  'memory.clearConfirm':
    'すべてのメモリを消去しますか？この操作は取り消せません。',
  'memory.category': 'カテゴリ',
  'memory.createdAt': '時刻',

  'model.title': 'モデル',
  'model.default.label': 'デフォルトモデル',
  'model.default.desc': '新しい会話で既定で使用するモデルを選択します。',
  'model.apiKey.label': 'API キー',
  'model.apiKey.desc':
    'プロバイダーごとの API キーは OS により暗号化保存されます。',
  'model.apiKey.placeholder': 'API キーを入力',
  'model.apiKey.configured': '設定済み',
  'model.apiKey.notConfigured': '未設定',
  'model.customEndpoint.label': 'カスタムエンドポイント',
  'model.customEndpoint.desc':
    '既定のプロバイダー URL を上書きします（任意）。',
  'model.test.label': '接続テスト',
  'model.test.desc': 'テストリクエストを送信してモデルの到達性を確認します。',
  'model.test.button': '接続をテスト',
  'model.test.testing': 'テスト中…',
  'model.test.success': '接続に成功しました',
  'model.test.failure':
    '接続に失敗しました。API キーとエンドポイントを確認してください',
  'model.encryption.unavailable':
    'OS 暗号化が利用できないため、ローカルのフォールバックで保存します。',
}

const DICTIONARIES: Record<LanguageCode, Messages> = {
  'zh-CN': zhCN,
  en,
  ja,
}

/** All message keys (zh-CN is the canonical key set). */
export const MESSAGE_KEYS = Object.keys(zhCN) as MessageKey[]

/** Pure lookup: translate a key in a language, falling back to zh-CN. */
export function translate(lang: LanguageCode, key: MessageKey): string {
  const dict = DICTIONARIES[lang] ?? DICTIONARIES['zh-CN']
  return dict[key] ?? DICTIONARIES['zh-CN'][key] ?? key
}

// ─── Subscribable singleton ───────────────────────────────────
let currentLang: LanguageCode = 'zh-CN'
const listeners = new Set<() => void>()

function notify(): void {
  for (const fn of listeners) fn()
}

export function getLanguage(): LanguageCode {
  return currentLang
}

export function setLanguage(lang: LanguageCode): void {
  if (lang === currentLang) return
  currentLang = lang
  notify()
}

export function subscribeLanguage(fn: () => void): () => void {
  listeners.add(fn)
  return () => {
    listeners.delete(fn)
  }
}

/** Translator bound to the current global language. */
export function t(key: MessageKey): string {
  return translate(currentLang, key)
}
