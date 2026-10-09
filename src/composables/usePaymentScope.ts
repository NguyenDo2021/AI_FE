import { computed } from 'vue'
import { useSalesScope } from '@/composables/useSalesScope'
export const usePaymentScope = () => {
  const scope = useSalesScope()
  const contextKey = computed(
    () => scope.scopeKey.value + ':' + (scope.warehouses.selectedId ?? ''),
  )
  const refreshAccess = async (): Promise<void> => {
    await scope.auth.getUserInfo().catch(() => undefined)
    await scope.refreshScope()
  }
  return { ...scope, contextKey, refreshAccess }
}
