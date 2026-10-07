import type { AxiosRequestConfig } from 'axios'
import { request } from '@/utils/request'
import type { PageData } from '@/types/api'
import type { Role } from '@/types/role'
import type { User, UserListParams, UserPayload, UpdateUserRolesRequest } from '@/types/user'

export const getUserList = (params: UserListParams): Promise<PageData<User>> =>
  request.get<PageData<User>>('/users', { params })

export const getUser = (id: string, config?: AxiosRequestConfig): Promise<User> =>
  request.get<User>(`/users/${id}`, config)

export const createUser = (payload: UserPayload): Promise<User> =>
  request.post<User>('/users', payload)

export const updateUser = (id: string, payload: UserPayload): Promise<User> =>
  request.put<User>(`/users/${id}`, payload)

export const deleteUser = (id: string): Promise<void> => request.delete<void>(`/users/${id}`)

export const getUserRoles = (userId: string, config?: AxiosRequestConfig): Promise<Role[]> =>
  request.get<Role[]>(`/users/${userId}/roles`, config)

export const updateUserRoles = (userId: string, roleIds: string[]): Promise<Role[]> =>
  request.put<Role[]>(`/users/${userId}/roles`, { roleIds } satisfies UpdateUserRolesRequest)

export const removeUserRole = (userId: string, roleId: string): Promise<void> =>
  request.delete<void>(`/users/${userId}/roles/${roleId}`)
