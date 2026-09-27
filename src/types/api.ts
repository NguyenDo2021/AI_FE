export interface ApiResponse<T> {
  data: T
  message?: string
}

export interface PageData<T> {
  items: T[]
  total: number
  page: number
  pageSize: number
}

export interface ApiErrorPayload {
  message?: string
  code?: string
  details?: unknown
}
