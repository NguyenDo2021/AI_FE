import type { CurrentUser } from '@/types/auth'

export const validateCurrentUser = (value: unknown): CurrentUser => {
  if (
    !value ||
    typeof value !== 'object' ||
    !('id' in value && typeof value.id === 'string') ||
    !('username' in value && typeof value.username === 'string') ||
    !('fullName' in value && typeof value.fullName === 'string') ||
    !('email' in value && typeof value.email === 'string') ||
    !('permissions' in value && Array.isArray(value.permissions)) ||
    !value.permissions.every((permission: unknown) => typeof permission === 'string') ||
    !('isAdmin' in value && typeof value.isAdmin === 'boolean')
  ) {
    throw new Error('Invalid /auth/me response')
  }
  return value as CurrentUser
}

// Mirrors JwtService's permissions claim. This only controls UI; BE verifies the JWT.
// Never fall back to DB permissions or derive Admin from any token claim.
export const getTokenPermissions = (token: string): string[] => {
  try {
    const payload = token.split('.')[1]
    if (!payload) return []
    const base64 = payload.replace(/-/g, '+').replace(/_/g, '/')
    const bytes = Uint8Array.from(atob(base64.padEnd(Math.ceil(base64.length / 4) * 4, '=')), (c) =>
      c.charCodeAt(0),
    )
    const claims: unknown = JSON.parse(new TextDecoder().decode(bytes))
    if (!claims || typeof claims !== 'object' || !('permissions' in claims)) return []
    return Array.isArray(claims.permissions)
      ? claims.permissions.filter(
          (permission): permission is string => typeof permission === 'string',
        )
      : []
  } catch {
    return []
  }
}
