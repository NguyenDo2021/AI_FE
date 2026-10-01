import type { PageData } from '@/types/api'

export interface Permission {
  id: string
  name: string
  code: string
  description?: string
  status: number
  createdAt?: string
  updatedAt?: string
}

export type PermissionResponse = Permission
export type PermissionListResponse = PageData<Permission>

export interface PermissionSearchParams {
  page: number
  pageSize: number
  keyword?: string
  name?: string
  code?: string
  status?: number
}

export interface CreatePermissionRequest {
  name: string
  code: string
  description?: string
  status: number
}

export interface UpdatePermissionRequest {
  name: string
  code: string
  description?: string
  status: number
}
