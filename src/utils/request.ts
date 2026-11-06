import axios, {
  type AxiosError,
  type AxiosResponse,
  type AxiosRequestConfig,
  type InternalAxiosRequestConfig,
} from 'axios'
import { readBlobError } from '@/utils/paymentReceipt'
import { message } from 'ant-design-vue'
import { i18n } from '@/locales'
import type { ApiErrorPayload } from '@/types/api'
import { clearTokens, getAccessToken, getRefreshToken } from '@/utils/storage'

declare module 'axios' {
  interface AxiosRequestConfig {
    preserveResponse?: boolean
    quietErrors?: boolean
    preventAutomaticRetry?: boolean
    skipAccessRefresh?: boolean
    _warehouseRevision?: number
    _authSessionRevision?: number
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
let refreshPromiseRevision: number | undefined
let refreshSession: (() => Promise<string>) | null = null
let onSessionExpired: (() => void) | null = null
let onAccessDenied: (() => void) | null = null
let authSessionRevision: (() => number) | null = null
const isStaleSessionRequest = (config?: AxiosRequestConfig): boolean =>
  !!authSessionRevision &&
  config?._authSessionRevision !== undefined &&
  config._authSessionRevision !== authSessionRevision()
const sessionChanged = (): NormalizedApiError =>
  Object.assign(new Error('Session changed'), { code: 'AUTH_SESSION_CHANGED' })
// Capture at call time, before Axios schedules its asynchronous request interceptor.
const withAuthSession = (config?: AxiosRequestConfig): AxiosRequestConfig => ({
  ...config,
  _authSessionRevision: config?._authSessionRevision ?? authSessionRevision?.(),
})

// Keep warehouse recovery independent of authentication and functional permissions.
let warehouseAccess: {
  revision: () => number
  allows: (config: AxiosRequestConfig) => boolean
  onDenied: () => void
} | null = null
export const configureRequestWarehouse = (handlers: NonNullable<typeof warehouseAccess>): void => {
  warehouseAccess = handlers
}
export const isWarehouseRequest = (url = ''): boolean =>
  /^\/(?:stock-receipts|stocktakes|sales-orders|customers|payments|receivables|sales-returns|refunds|refundables|reports)(?:\/|$)/.test(
    url,
  ) || /^\/warehouses\/[^/]+\/(?:inventory|inventory-movements)(?:\/|$)/.test(url)
const scopeChanged = (): NormalizedApiError =>
  Object.assign(new Error('Phạm vi kho đã thay đổi. Vui lòng tải lại phạm vi kho.'), {
    code: 'WAREHOUSE_SCOPE_CHANGED',
  })
const isStaleWarehouseRequest = (config?: AxiosRequestConfig): boolean =>
  !!warehouseAccess &&
  config?._warehouseRevision !== undefined &&
  config._warehouseRevision !== warehouseAccess.revision()

export const configureRequestAuth = (handlers: {
  refresh: () => Promise<string>
  onSessionExpired: () => void
  onAccessDenied?: () => void
  sessionRevision?: () => number
}): void => {
  refreshSession = handlers.refresh
  onSessionExpired = handlers.onSessionExpired
  onAccessDenied = handlers.onAccessDenied ?? null
  authSessionRevision = handlers.sessionRevision ?? null
}

http.interceptors.request.use((config: InternalAxiosRequestConfig) => {
  if (isStaleSessionRequest(config)) throw sessionChanged()
  if (authSessionRevision) config._authSessionRevision = authSessionRevision()
  if (warehouseAccess && isWarehouseRequest(config.url)) {
    if (isStaleWarehouseRequest(config) || !warehouseAccess.allows(config)) throw scopeChanged()
    config._warehouseRevision = warehouseAccess.revision()
  }
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
  (response) => {
    if (isStaleSessionRequest(response.config)) throw sessionChanged()
    if (isStaleWarehouseRequest(response.config)) throw scopeChanged()
    return response.config.preserveResponse ? response : response.data
  },
  async (error: AxiosError<ApiErrorPayload>) => {
    if (['WAREHOUSE_SCOPE_CHANGED', 'AUTH_SESSION_CHANGED'].includes(error.code ?? ''))
      return Promise.reject(error)
    const config = error.config as RetryConfig | undefined
    if (isStaleSessionRequest(config)) return Promise.reject(sessionChanged())
    if (isStaleWarehouseRequest(config)) return Promise.reject(scopeChanged())
    if (config?.preserveResponse && error.response) {
      const payload = await readBlobError(
        error.response.data,
        String(error.response.headers['content-type'] ?? ''),
      )
      if (payload) error.response.data = payload
    }
    if (isStaleWarehouseRequest(config)) return Promise.reject(scopeChanged())
    const status = error.response?.status
    if (isStaleSessionRequest(config)) return Promise.reject(sessionChanged())
    if (
      error.response?.data?.code === 'WAREHOUSE_ACCESS_DENIED' &&
      isWarehouseRequest(config?.url)
    ) {
      warehouseAccess?.onDenied()
      // Never replay a denied operation, including writes, against another warehouse.
      return Promise.reject(
        Object.assign(normalizeError(error), { warehouseScopeHandled: !!warehouseAccess }),
      )
    }
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
        if (!refreshPromise || refreshPromiseRevision !== config._authSessionRevision) {
          const task = refreshSession().finally(() => {
            if (refreshPromise === task) refreshPromise = null
          })
          refreshPromise = task
          refreshPromiseRevision = config._authSessionRevision
        }
        const token = await refreshPromise
        if (isStaleSessionRequest(config)) return Promise.reject(sessionChanged())
        config.headers.set('Authorization', `Bearer ${token}`)
        if (config.preventAutomaticRetry) return Promise.reject(normalizeError(error))
        // Keep PDF retry failures outside this catch; JSON calls retain their existing behavior.
        if (config.preserveResponse) return http.request(config)
        return await http.request(config)
      } catch (cause) {
        if (isStaleSessionRequest(config)) return Promise.reject(sessionChanged())
        if (
          ['WAREHOUSE_SCOPE_CHANGED', 'WAREHOUSE_ACCESS_DENIED'].includes(
            (cause as NormalizedApiError | undefined)?.code ?? '',
          )
        )
          return Promise.reject(cause)
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
  getBlob(url: string, config?: AxiosRequestConfig): Promise<AxiosResponse<Blob>> {
    return http.get<Blob, AxiosResponse<Blob>>(url, {
      ...withAuthSession(config),
      responseType: 'blob',
      preserveResponse: true,
    })
  },
  get<T>(url: string, config?: AxiosRequestConfig): Promise<T> {
    return http.get<T, T>(url, withAuthSession(config))
  },
  post<T, D = unknown>(url: string, data?: D, config?: AxiosRequestConfig): Promise<T> {
    return http.post<T, T, D>(url, data, withAuthSession(config))
  },
  put<T, D = unknown>(url: string, data?: D, config?: AxiosRequestConfig): Promise<T> {
    return http.put<T, T, D>(url, data, withAuthSession(config))
  },
  delete<T>(url: string, config?: AxiosRequestConfig): Promise<T> {
    return http.delete<T, T>(url, withAuthSession(config))
  },
}
