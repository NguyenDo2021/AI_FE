import { computed, ref } from 'vue'
import { defineStore } from 'pinia'
import { getMyWarehouses } from '@/api/catalog/catalog.api'
import type { Warehouse } from '@/types/catalog'
export const useWarehouseStore = defineStore('warehouse', () => {
  const warehouses = ref<Warehouse[]>([])
  const selectedId = ref<string>()
  const ownerId = ref<string>()
  const loading = ref(false)
  const loaded = ref(false)
  const error = ref('')
  let version = 0
  const key = (id: string): string => `working-warehouse:${id}`
  const selected = computed(() => warehouses.value.find((item) => item.id === selectedId.value))
  const select = (id?: string): void => {
    selectedId.value =
      id && warehouses.value.some((item) => item.id === id && item.status === 1) ? id : undefined
    if (ownerId.value) {
      if (selectedId.value) sessionStorage.setItem(key(ownerId.value), selectedId.value)
      else sessionStorage.removeItem(key(ownerId.value))
    }
  }
  const reset = (): void => {
    ++version
    if (ownerId.value) sessionStorage.removeItem(key(ownerId.value))
    warehouses.value = []
    selectedId.value = undefined
    ownerId.value = undefined
    loading.value = false
    loaded.value = false
    error.value = ''
  }
  const load = async (userId: string): Promise<void> => {
    if (ownerId.value !== userId) {
      reset()
      ownerId.value = userId
      selectedId.value = sessionStorage.getItem(key(userId)) ?? undefined
    }
    const requestVersion = ++version
    loading.value = true
    error.value = ''
    try {
      const result = await getMyWarehouses()
      if (requestVersion !== version) return
      warehouses.value = result
      loaded.value = true
      select(selectedId.value)
    } catch (cause) {
      if (requestVersion !== version) return
      error.value = cause instanceof Error ? cause.message : 'Error'
      warehouses.value = []
      loaded.value = false
      select(undefined)
      throw cause
    } finally {
      if (requestVersion === version) loading.value = false
    }
  }
  return { warehouses, selectedId, selected, ownerId, loading, loaded, error, select, reset, load }
})
