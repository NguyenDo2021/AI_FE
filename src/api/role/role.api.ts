import { request } from '@/utils/request'

export interface Role {
  id: string
  name: string
  code: string
  description?: string
}

export const getRoleList = (): Promise<Role[]> => request.get<Role[]>('/roles')
