import { computed } from 'vue'
import { useAuthStore } from '@/stores/auth'
import { useWarehouseStore } from '@/stores/warehouse'
import { useCatalogPermission } from '@/composables/useCatalogPermission'
export const useSalesScope = () => {
  const auth = useAuthStore()
  const warehouses = useWarehouseStore()
  const { can } = useCatalogPermission()
  const scopeKey = computed(() =>
    JSON.stringify([
      auth.user?.id,
      auth.user?.permissions,
      auth.isCatalogAdmin,
      warehouses.loaded,
      warehouses.scopeRevision,
      warehouses.accessBlocked,
      warehouses.warehouses.map((item) => [item.id, item.status]),
    ]),
  )
  const inScope = (id: string): boolean =>
    !warehouses.accessBlocked && warehouses.warehouses.some((item) => item.id === id)
  const refreshScope = async (cause?: unknown): Promise<void> => {
    if (cause) {
      const error = cause as { code?: string; warehouseScopeHandled?: boolean }
      if (
        error.warehouseScopeHandled ||
        !['WAREHOUSE_ACCESS_DENIED', 'WAREHOUSE_NOT_FOUND'].includes(error.code ?? '')
      )
        return
    }
    if (warehouses.accessBlocked || warehouses.loading) return
    if (auth.user) await warehouses.load(auth.user.id).catch(() => undefined)
  }
  return { auth, warehouses, can, scopeKey, inScope, refreshScope }
}
