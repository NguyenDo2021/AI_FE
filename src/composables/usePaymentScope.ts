import { computed } from 'vue'
import { useSalesScope } from '@/composables/useSalesScope'
export const usePaymentScope = () => {
  const scope = useSalesScope()
  const contextKey = computed(
    () => scope.scopeKey.value + ':' + (scope.warehouses.selectedId ?? ''),
  )
  const refreshAccess = async (cause?: unknown): Promise<void> => {
    if ((cause as { warehouseScopeHandled?: boolean } | undefined)?.warehouseScopeHandled) return
    if ((cause as { code?: string } | undefined)?.code === 'WAREHOUSE_ACCESS_DENIED') {
      await scope.refreshScope(cause)
      return
    }
    await scope.auth.getUserInfo().catch(() => undefined)
    await scope.refreshScope(cause)
  }
  return { ...scope, contextKey, refreshAccess }
}
