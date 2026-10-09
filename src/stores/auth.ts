import { clearPaymentRetries } from '@/utils/payments'
import { getUser, getUserRoles } from '@/api/user/user.api'
import { useWarehouseStore } from '@/stores/warehouse'
import { computed, ref } from 'vue'
import { defineStore } from 'pinia'
import { getUserInfoApi, loginApi, refreshTokenApi } from '@/api/auth/auth.api'
import type { AuthUser, LoginParams } from '@/types/auth'
import { clearTokens, getAccessToken, getRefreshToken, saveTokens } from '@/utils/storage'

export const useAuthStore = defineStore('auth', () => {
  const user = ref<AuthUser | null>(null)
  const isCatalogAdmin = ref(false)
  const adminVerified = ref(false)
  let accessVersion = 0
  let sessionVersion = 0
  const refreshAdmin = async (): Promise<void> => {
    const currentUser = user.value
    const version = ++accessVersion
    if (!currentUser) {
      isCatalogAdmin.value = false
      adminVerified.value = false
      return
    }
    try {
      const config = { quietErrors: true, skipAccessRefresh: true }
      const [account, roles] = await Promise.all([
        getUser(currentUser.id, config),
        getUserRoles(currentUser.id, config),
      ])
      if (version !== accessVersion || user.value?.id !== currentUser.id) return
      isCatalogAdmin.value =
        account.status === 1 && roles.some((role) => role.code === 'ADMIN' && role.status === 1)
      adminVerified.value = true
    } catch {
      if (version === accessVersion) {
        isCatalogAdmin.value = false
        adminVerified.value = false
      }
    }
  }
  const accessToken = ref<string | null>(getAccessToken())
  const isAuthenticated = computed(() => Boolean(accessToken.value))
  let refreshPromise: Promise<string> | null = null

  const login = async (credentials: LoginParams): Promise<void> => {
    const currentSession = ++sessionVersion
    const tokens = await loginApi(credentials)
    if (sessionVersion !== currentSession) throw new Error('Session changed')
    saveTokens(tokens)
    accessToken.value = tokens.accessToken
    try {
      await getUserInfo()
    } catch (error) {
      if (sessionVersion === currentSession) logout()
      throw error
    }
  }

  const refreshToken = async (): Promise<string> => {
    if (refreshPromise) return refreshPromise
    const currentRefreshToken = getRefreshToken()
    if (!currentRefreshToken) throw new Error('Refresh token is missing')

    const currentSession = sessionVersion
    refreshPromise = refreshTokenApi(currentRefreshToken)
      .then((tokens) => {
        if (sessionVersion !== currentSession) throw new Error('Session changed')
        saveTokens(tokens)
        accessToken.value = tokens.accessToken
        // Refresh identity after the shared token promise resolves, avoiding a 401 retry cycle.
        window.setTimeout(() => {
          if (accessToken.value === tokens.accessToken) void getUserInfo().catch(() => undefined)
        }, 0)
        return tokens.accessToken
      })
      .catch((error: unknown) => {
        if (sessionVersion === currentSession) logout()
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
    const currentSession = sessionVersion
    const identity = await getUserInfoApi()
    if (sessionVersion !== currentSession || !accessToken.value) throw new Error('Session changed')
    user.value = identity
    await refreshAdmin()
    if (!user.value) throw new Error('Session expired')
    return user.value
  }

  const logout = (): void => {
    clearPaymentRetries()
    ++accessVersion
    ++sessionVersion
    isCatalogAdmin.value = false
    adminVerified.value = false
    useWarehouseStore().reset()
    clearTokens()
    accessToken.value = null
    user.value = null
  }

  return {
    user,
    isCatalogAdmin,
    adminVerified,
    refreshAdmin,
    accessToken,
    isAuthenticated,
    login,
    logout,
    refreshToken,
    getUserInfo,
  }
})
