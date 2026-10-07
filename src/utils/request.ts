import axios, {
  type AxiosError,
  type AxiosRequestConfig,
  type InternalAxiosRequestConfig,
} from 'axios'
import { message } from 'ant-design-vue'
import { i18n } from '@/locales'
import type { ApiErrorPayload } from '@/types/api'
import { clearTokens, getAccessToken, getRefreshToken } from '@/utils/storage'

declare module 'axios' {
  interface AxiosRequestConfig {
    quietErrors?: boolean
    skipAccessRefresh?: boolean
  }
}
interface RetryConfig extends InternalAxiosRequestConfig {
  _retry?: boolean
}

export interface NormalizedApiError extends Error {
  status?: number
  code?: string
  details?: unknown
}

const http = axios.create({
  baseURL: import.meta.env.VITE_GLOB_API_URL,
  timeout: 15_000,
  headers: { 'Content-Type': 'application/json' },
})

let refreshPromise: Promise<string> | null = null
let refreshSession: (() => Promise<string>) | null = null
let onSessionExpired: (() => void) | null = null
let onAccessDenied: (() => void) | null = null

export const configureRequestAuth = (handlers: {
  refresh: () => Promise<string>
  onSessionExpired: () => void
  onAccessDenied?: () => void
}): void => {
  refreshSession = handlers.refresh
  onSessionExpired = handlers.onSessionExpired
  onAccessDenied = handlers.onAccessDenied ?? null
}

http.interceptors.request.use((config: InternalAxiosRequestConfig) => {
  const token = getAccessToken()
  if (token) config.headers.set('Authorization', `Bearer ${token}`)
  return config
})

const normalizeError = (error: AxiosError<ApiErrorPayload>): NormalizedApiError => {
  const status = error.response?.status
  const apiError = new Error(
    error.response?.data?.message ??
      (status
        ? i18n.global.t(`errors.${status}`, i18n.global.t('errors.unknown'))
        : i18n.global.t('errors.network')),
  ) as NormalizedApiError
  apiError.status = status
  apiError.code = error.response?.data?.code
  apiError.details = error.response?.data?.details
  return apiError
}

http.interceptors.response.use(
  (response) => response.data,
  async (error: AxiosError<ApiErrorPayload>) => {
    const config = error.config as RetryConfig | undefined
    const status = error.response?.status
    const isAuthEndpoint =
      config?.url?.includes('/auth/login') || config?.url?.includes('/auth/refresh')

    const refreshToken = getRefreshToken()
    if (
      status === 401 &&
      config &&
      !config._retry &&
      !isAuthEndpoint &&
      refreshToken &&
      refreshSession
    ) {
      config._retry = true
      try {
        if (!refreshPromise)
          refreshPromise = refreshSession().finally(() => (refreshPromise = null))
        const token = await refreshPromise
        config.headers.set('Authorization', `Bearer ${token}`)
        return await http.request(config)
      } catch {
        clearTokens()
        onSessionExpired?.()
        message.error(i18n.global.t('errors.401'))
        return Promise.reject(normalizeError(error))
      }
    }

    if (status === 401) {
      clearTokens()
      onSessionExpired?.()
    }
    if (status === 403 && !config?.skipAccessRefresh) onAccessDenied?.()
    if (config?.quietErrors && status !== 401) return Promise.reject(normalizeError(error))
    if (status !== undefined) {
      message.error(i18n.global.t(`errors.${status}`, i18n.global.t('errors.unknown')))
    } else {
      message.error(i18n.global.t('errors.network'))
    }
    return Promise.reject(normalizeError(error))
  },
)

export const request = {
  get<T>(url: string, config?: AxiosRequestConfig): Promise<T> {
    return http.get<T, T>(url, config)
  },
  post<T, D = unknown>(url: string, data?: D, config?: AxiosRequestConfig): Promise<T> {
    return http.post<T, T, D>(url, data, config)
  },
  put<T, D = unknown>(url: string, data?: D, config?: AxiosRequestConfig): Promise<T> {
    return http.put<T, T, D>(url, data, config)
  },
  delete<T>(url: string, config?: AxiosRequestConfig): Promise<T> {
    return http.delete<T, T>(url, config)
  },
}
