import { clearPaymentRetries } from '@/utils/payments'
import { useWarehouseStore } from '@/stores/warehouse'
import { computed, ref } from 'vue'
import { defineStore } from 'pinia'
import { getUserInfoApi, loginApi, refreshTokenApi } from '@/api/auth/auth.api'
import type { AdminVerificationStatus, AuthUser, CurrentUser, LoginParams } from '@/types/auth'
import { getTokenPermissions } from '@/utils/auth'
import { clearTokens, getAccessToken, getRefreshToken, saveTokens } from '@/utils/storage'

export const useAuthStore = defineStore('auth', () => {
  // Existing permission consumers keep using user.permissions, synchronized with JWT.
  const user = ref<AuthUser | null>(null)
  const currentUser = ref<CurrentUser | null>(null)
  const adminVerificationStatus = ref<AdminVerificationStatus>('idle')
  const adminVerified = computed(() => adminVerificationStatus.value === 'verified')
  const isCatalogAdmin = computed(() => adminVerified.value && currentUser.value?.isAdmin === true)
  const accessToken = ref<string | null>(getAccessToken())
  const isAuthenticated = computed(() => Boolean(accessToken.value))
  const sessionRevision = ref(0)
  let refreshPromise: Promise<string> | null = null
  let identityPromise: Promise<AuthUser> | null = null
  let verifiedToken: string | null = null
  let denialRechecked = false

  const clearVerification = (): void => {
    currentUser.value = null
    verifiedToken = null
    adminVerificationStatus.value = 'idle'
  }

  const getUserInfo = (): Promise<AuthUser> => {
    if (identityPromise) return identityPromise
    if (!accessToken.value) return Promise.reject(new Error('Access token is missing'))
    const currentSession = sessionRevision.value
    clearVerification()
    adminVerificationStatus.value = 'loading'
    const task = getUserInfoApi()
      .then((identity) => {
        if (sessionRevision.value !== currentSession || !accessToken.value)
          throw new Error('Session changed')
        const effectiveUser: AuthUser = {
          id: identity.id,
          username: identity.username,
          fullName: identity.fullName,
          email: identity.email,
          permissions: getTokenPermissions(accessToken.value),
        }
        user.value = effectiveUser
        currentUser.value = identity
        verifiedToken = accessToken.value
        adminVerificationStatus.value = 'verified'
        return effectiveUser
      })
      .catch((error: unknown) => {
        if (sessionRevision.value === currentSession) {
          clearVerification()
          adminVerificationStatus.value = 'failed'
        }
        throw error
      })
      .finally(() => {
        if (identityPromise === task) identityPromise = null
      })
    identityPromise = task
    return task
  }

  // Manual retry and denial recovery share the same in-flight identity request.
  const refreshAdmin = async (): Promise<void> => {
    if (accessToken.value) await getUserInfo().catch(() => undefined)
  }
  const refreshAdminAfterDenial = async (): Promise<void> => {
    if (denialRechecked || !accessToken.value) return
    denialRechecked = true
    await refreshAdmin()
  }

  const logout = (): void => {
    ++sessionRevision.value
    identityPromise = null
    refreshPromise = null
    denialRechecked = false
    clearVerification()
    clearPaymentRetries()
    useWarehouseStore().reset()
    clearTokens()
    accessToken.value = null
    user.value = null
  }

  const login = async (credentials: LoginParams): Promise<void> => {
    // Also clears scope and effective permissions when switching accounts directly.
    logout()
    const currentSession = sessionRevision.value
    const tokens = await loginApi(credentials)
    if (sessionRevision.value !== currentSession) throw new Error('Session changed')
    saveTokens(tokens)
    accessToken.value = tokens.accessToken
    try {
      await getUserInfo()
    } catch (error) {
      if (sessionRevision.value === currentSession) logout()
      throw error
    }
  }

  const refreshToken = (): Promise<string> => {
    if (refreshPromise) return refreshPromise
    const currentRefreshToken = getRefreshToken()
    if (!currentRefreshToken) return Promise.reject(new Error('Refresh token is missing'))

    const currentSession = sessionRevision.value
    const task = refreshTokenApi(currentRefreshToken)
      .then((tokens) => {
        if (sessionRevision.value !== currentSession) throw new Error('Session changed')
        clearVerification()
        denialRechecked = false
        saveTokens(tokens)
        accessToken.value = tokens.accessToken
        if (user.value)
          user.value = { ...user.value, permissions: getTokenPermissions(tokens.accessToken) }
        // A pending /me is already retried by the interceptor with the new token.
        // Otherwise defer verification until the shared refresh promise has settled.
        if (!identityPromise)
          window.setTimeout(() => {
            if (
              sessionRevision.value === currentSession &&
              accessToken.value === tokens.accessToken &&
              verifiedToken !== tokens.accessToken
            )
              void refreshAdmin()
          }, 0)
        return tokens.accessToken
      })
      .catch((error: unknown) => {
        if (sessionRevision.value === currentSession) logout()
        throw error
      })
      .finally(() => {
        if (refreshPromise === task) refreshPromise = null
      })
    refreshPromise = task
    return task
  }

  return {
    user,
    currentUser,
    isCatalogAdmin,
    adminVerified,
    adminVerificationStatus,
    refreshAdmin,
    refreshAdminAfterDenial,
    sessionRevision,
    accessToken,
    isAuthenticated,
    login,
    logout,
    refreshToken,
    getUserInfo,
  }
})
