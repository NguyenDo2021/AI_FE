import type { AuthUser } from '@/types/auth'

export const hasPermission = (
  permission: string | string[],
  permissions: AuthUser['permissions'],
): boolean => {
  const required = Array.isArray(permission) ? permission : [permission]
  return required.every((item) => permissions.includes(item))
}
