import { computed } from 'vue'
import { useAuthStore } from '@/stores/auth'
import { hasPermission } from '@/utils/permission'

export const usePermission = () => {
  const auth = useAuthStore()
  const permissions = computed(() => auth.user?.permissions ?? [])
  const can = (permission: string | string[]): boolean => hasPermission(permission, permissions.value)

  return { permissions, can }
}
