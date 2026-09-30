import { request } from '@/utils/request'
import type {
  CreateRoleRequest,
  RoleListResponse,
  RoleResponse,
  RoleSearchParams,
  UpdateRoleRequest,
} from '@/types/role'

export const getRoles = (params: RoleSearchParams): Promise<RoleListResponse> =>
  request.get<RoleListResponse>('/roles', { params })

export const getRole = (id: string): Promise<RoleResponse> => request.get<RoleResponse>(`/roles/${id}`)

export const createRole = (payload: CreateRoleRequest): Promise<RoleResponse> =>
  request.post<RoleResponse>('/roles', payload)

export const updateRole = (id: string, payload: UpdateRoleRequest): Promise<RoleResponse> =>
  request.put<RoleResponse>(`/roles/${id}`, payload)

export const deleteRole = (id: string): Promise<void> => request.delete<void>(`/roles/${id}`)
