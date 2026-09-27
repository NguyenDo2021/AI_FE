import { computed, ref } from 'vue'
import { defineStore } from 'pinia'
import { getUserInfoApi, loginApi, refreshTokenApi } from '@/api/auth/auth.api'
import type { AuthUser, LoginParams } from '@/types/auth'
import { clearTokens, getAccessToken, getRefreshToken, saveTokens } from '@/utils/storage'

export const useAuthStore = defineStore('auth', () => {
  const user = ref<AuthUser | null>(null)
  const accessToken = ref<string | null>(getAccessToken())
  const isAuthenticated = computed(() => Boolean(accessToken.value))
  let refreshPromise: Promise<string> | null = null

  const login = async (credentials: LoginParams): Promise<void> => {
    const tokens = await loginApi(credentials)
    saveTokens(tokens)
    accessToken.value = tokens.accessToken
    try {
      user.value = await getUserInfoApi()
    } catch (error) {
      logout()
      throw error
    }
  }

  const refreshToken = async (): Promise<string> => {
    if (refreshPromise) return refreshPromise
    const currentRefreshToken = getRefreshToken()
    if (!currentRefreshToken) throw new Error('Refresh token is missing')

    refreshPromise = refreshTokenApi(currentRefreshToken)
      .then((tokens) => {
        saveTokens(tokens)
        accessToken.value = tokens.accessToken
        return tokens.accessToken
      })
      .catch((error: unknown) => {
        logout()
        throw error
      })
      .finally(() => {
        refreshPromise = null
      })

    return refreshPromise
  }

  const getUserInfo = async (): Promise<AuthUser> => {
    const token = accessToken.value ?? getAccessToken()
    if (!token) throw new Error('Access token is missing')
    user.value = await getUserInfoApi()
    return user.value
  }

  const logout = (): void => {
    clearTokens()
    accessToken.value = null
    user.value = null
  }

  return { user, accessToken, isAuthenticated, login, logout, refreshToken, getUserInfo }
})
