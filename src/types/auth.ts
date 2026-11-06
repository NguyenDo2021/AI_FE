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

// Database profile; permissions here may differ from the active access token.
export interface CurrentUser extends AuthUser {
  isAdmin: boolean
}

export type AdminVerificationStatus = 'idle' | 'loading' | 'verified' | 'failed'
