import { createI18n } from 'vue-i18n'
import enUS from './en-US'
import viVN from './vi-VN'
import { STORAGE_KEYS } from '@/constants/storage'

export type Locale = 'vi-VN' | 'en-US'

const savedLocale = localStorage.getItem(STORAGE_KEYS.LOCALE)
const initialLocale: Locale = savedLocale === 'en-US' ? 'en-US' : 'vi-VN'

export const i18n = createI18n({
  legacy: false,
  locale: initialLocale,
  fallbackLocale: 'en-US',
  messages: { 'vi-VN': viVN, 'en-US': enUS },
})

export const setLocale = (locale: Locale): void => {
  i18n.global.locale.value = locale
  localStorage.setItem(STORAGE_KEYS.LOCALE, locale)
  document.documentElement.lang = locale === 'vi-VN' ? 'vi' : 'en'
}
