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
