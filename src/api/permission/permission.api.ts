import { request } from '@/utils/request'
import type { UpdateRolePermissionsRequest } from '@/types/role'
import type {
  CreatePermissionRequest,
  Permission,
  PermissionListResponse,
  PermissionSearchParams,
  UpdatePermissionRequest,
} from '@/types/permission'

export const getPermissions = (params: PermissionSearchParams): Promise<PermissionListResponse> =>
  request.get<PermissionListResponse>('/permissions', { params })

export const getPermission = (id: string): Promise<Permission> =>
  request.get<Permission>(`/permissions/${id}`)

export const createPermission = (payload: CreatePermissionRequest): Promise<Permission> =>
  request.post<Permission>('/permissions', payload)

export const updatePermission = (
  id: string,
  payload: UpdatePermissionRequest,
): Promise<Permission> => request.put<Permission>(`/permissions/${id}`, payload)

export const deletePermission = (id: string): Promise<void> =>
  request.delete<void>(`/permissions/${id}`)

export const getRolePermissions = (roleId: string): Promise<Permission[]> =>
  request.get<Permission[]>(`/roles/${roleId}/permissions`)

export const updateRolePermissions = (
  roleId: string,
  permissionIds: string[],
): Promise<Permission[]> =>
  request.put<Permission[]>(`/roles/${roleId}/permissions`, {
    permissionIds,
  } satisfies UpdateRolePermissionsRequest)
