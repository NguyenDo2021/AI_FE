import { configureRequestWarehouse } from '@/utils/request'
import type { useWarehouseStore } from '@/stores/warehouse'

export const installWarehouseAccess = (
  warehouses: ReturnType<typeof useWarehouseStore>,
  userId: () => string | undefined,
): void => {
  configureRequestWarehouse({
    revision: () => warehouses.scopeRevision,
    allows: (config) => {
      if (warehouses.accessBlocked || !warehouses.loaded || !warehouses.warehouses.length)
        return false
      const pathId = /^\/warehouses\/([^/]+)\//.exec(config.url ?? '')?.[1]
      const data = config.data && typeof config.data === 'object' ? config.data : undefined
      const id = pathId
        ? decodeURIComponent(pathId)
        : (config.params?.warehouseId ?? data?.warehouseId)
      return !id || warehouses.warehouses.some((item) => item.id === id)
    },
    onDenied: () => {
      const id = userId()
      if (id) void warehouses.revokeAccess(id).catch(() => undefined)
    },
  })
}
