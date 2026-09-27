export interface LoginParams {
  username: string
  password: string
}

export interface AuthTokens {
  accessToken: string
  refreshToken: string
}

export interface AuthUser {
  id: string
  username: string
  fullName: string
  email: string
  permissions: string[]
}
