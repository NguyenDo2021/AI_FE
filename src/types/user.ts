export interface User {
  id: string
  username: string
  fullName: string
  email: string
  phone?: string
  status: number
  createdAt?: string
}

export interface UserListParams {
  page: number
  pageSize: number
  keyword?: string
  status?: number
}

export interface UserPayload {
  username: string
  fullName: string
  email: string
  phone?: string
  status: number
}
