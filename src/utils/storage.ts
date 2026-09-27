import { STORAGE_KEYS } from '@/constants/storage'
import type { AuthTokens } from '@/types/auth'

export const getAccessToken = (): string | null => localStorage.getItem(STORAGE_KEYS.ACCESS_TOKEN)
export const getRefreshToken = (): string | null => localStorage.getItem(STORAGE_KEYS.REFRESH_TOKEN)

export const saveTokens = (tokens: AuthTokens): void => {
  localStorage.setItem(STORAGE_KEYS.ACCESS_TOKEN, tokens.accessToken)
  localStorage.setItem(STORAGE_KEYS.REFRESH_TOKEN, tokens.refreshToken)
}

export const clearTokens = (): void => {
  localStorage.removeItem(STORAGE_KEYS.ACCESS_TOKEN)
  localStorage.removeItem(STORAGE_KEYS.REFRESH_TOKEN)
}
