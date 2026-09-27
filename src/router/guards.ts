import type { Router } from 'vue-router'
import { useAuthStore } from '@/stores/auth'
import { hasPermission } from '@/utils/permission'

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
      if (!hasPermission(required, auth.user.permissions)) return { name: 'forbidden' }
    }
    if (to.name === 'login' && auth.isAuthenticated) return { name: 'dashboard' }
    return true
  })
}
