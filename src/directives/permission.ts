import type { App, Directive } from 'vue'
import { useAuthStore } from '@/stores/auth'
import { hasPermission } from '@/utils/permission'

const permissionDirective: Directive<HTMLElement, string | string[]> = {
  mounted(element, binding) {
    const auth = useAuthStore()
    if (!auth.user || !hasPermission(binding.value, auth.user.permissions)) {
      element.remove()
    }
  },
}

export const installPermissionDirective = (app: App): void => {
  app.directive('permission', permissionDirective)
}
