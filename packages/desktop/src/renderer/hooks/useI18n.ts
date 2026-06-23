/**
 * useI18n — React binding for the i18n singleton.
 * Subscribes to global language changes so any component using `t()` re-renders
 * when the display language switches (N21 acceptance: language switch updates
 * the entire interface).
 */
import { useSyncExternalStore } from 'react'
import {
  getLanguage,
  type MessageKey,
  subscribeLanguage,
  translate,
} from '../i18n'
import type { LanguageCode } from '../../shared/settings'

export interface UseI18nReturn {
  lang: LanguageCode
  t: (key: MessageKey) => string
}

export function useI18n(): UseI18nReturn {
  const lang = useSyncExternalStore(subscribeLanguage, getLanguage, getLanguage)
  return {
    lang,
    t: (key: MessageKey) => translate(lang, key),
  }
}
