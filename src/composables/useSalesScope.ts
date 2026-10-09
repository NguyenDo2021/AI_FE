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
      warehouses.warehouses.map((item) => [item.id, item.status]),
    ]),
  )
  const inScope = (id: string): boolean => warehouses.warehouses.some((item) => item.id === id)
  const refreshScope = async (): Promise<void> => {
    if (auth.user) await warehouses.load(auth.user.id).catch(() => undefined)
  }
  return { auth, warehouses, can, scopeKey, inScope, refreshScope }
}
