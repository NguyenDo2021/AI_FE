import { request } from '@/utils/request'
import type { PageData } from '@/types/api'
import type { User, UserListParams, UserPayload } from '@/types/user'

export const getUserList = (params: UserListParams): Promise<PageData<User>> =>
  request.get<PageData<User>>('/users', { params })

export const getUser = (id: string): Promise<User> => request.get<User>(`/users/${id}`)

export const createUser = (payload: UserPayload): Promise<User> =>
  request.post<User>('/users', payload)

export const updateUser = (id: string, payload: UserPayload): Promise<User> =>
  request.put<User>(`/users/${id}`, payload)

export const deleteUser = (id: string): Promise<void> => request.delete<void>(`/users/${id}`)
