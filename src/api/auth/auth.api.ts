import axios from 'axios'
import { request } from '@/utils/request'
import type { AuthTokens, AuthUser, LoginParams } from '@/types/auth'

const apiBaseUrl = import.meta.env.VITE_GLOB_API_URL

export const loginApi = (payload: LoginParams): Promise<AuthTokens> =>
  axios.post<AuthTokens>(`${apiBaseUrl}/auth/login`, payload).then(({ data }) => data)

export const refreshTokenApi = (refreshToken: string): Promise<AuthTokens> =>
  axios
    .post<AuthTokens>(`${apiBaseUrl}/auth/refresh`, { refreshToken })
    .then(({ data }) => data)

export const getUserInfoApi = (signal?: AbortSignal): Promise<AuthUser> =>
  request.get<AuthUser>('/auth/me', { signal })
