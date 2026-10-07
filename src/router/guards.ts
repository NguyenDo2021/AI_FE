import type { Router } from 'vue-router'
import { useAuthStore } from '@/stores/auth'
import { hasPermission } from '@/utils/permission'
import { getLandingPath } from '@/utils/landing'

export const installRouterGuards = (router: Router): void => {
  router.beforeEach(async (to) => {
    const auth = useAuthStore()
    if (to.meta.requiresAuth && !auth.isAuthenticated) {
      return { name: 'login', query: { redirect: to.fullPath } }
    }
    if (to.meta.requiresAuth && auth.isAuthenticated && !auth.user) {
      try {
        await auth.getUserInfo()
      } catch {
        auth.logout()
        return { name: 'login', query: { redirect: to.fullPath } }
      }
    }
    if (to.meta.requiresAuth && to.meta.permissions && auth.user) {
      const required = to.meta.permissions
      const allowed = to.meta.catalogAccess
        ? auth.isCatalogAdmin ||
          required.some((permission) => hasPermission(permission, auth.user!.permissions))
        : hasPermission(required, auth.user.permissions)
      if (!allowed) return { name: 'forbidden' }
    }
    if (to.name === 'login' && auth.isAuthenticated) {
      if (!auth.user) {
        try {
          await auth.getUserInfo()
        } catch {
          auth.logout()
          return true
        }
      }
      return getLandingPath(auth.user?.permissions ?? [], auth.isCatalogAdmin)
    }
    return true
  })
}
