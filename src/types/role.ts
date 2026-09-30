import type { PageData } from '@/types/api'

export interface Role {
  id: string
  name: string
  code: string
  description?: string
  status: number
  createdAt?: string
  updatedAt?: string
}

export type RoleResponse = Role
export type RoleListResponse = PageData<Role>

export interface RoleSearchParams {
  page: number
  pageSize: number
  keyword?: string
  status?: number
}

export interface CreateRoleRequest {
  name: string
  code: string
  description?: string
  status: number
}

export interface UpdateRoleRequest {
  name: string
  code: string
  description?: string
  status: number
}