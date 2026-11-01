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
  const accessBlocked = ref(false)
  const scopeRevision = ref(0)
  const recoveryNotice = ref(false)
  let version = 0
  let pending: Promise<void> | undefined
  const key = (id: string): string => `working-warehouse:${id}`
  const selected = computed(() =>
    accessBlocked.value ? undefined : warehouses.value.find((item) => item.id === selectedId.value),
  )
  const select = (id?: string): void => {
    selectedId.value =
      id &&
      !accessBlocked.value &&
      warehouses.value.some((item) => item.id === id && item.status === 1)
        ? id
        : undefined
    if (ownerId.value) {
      if (selectedId.value) sessionStorage.setItem(key(ownerId.value), selectedId.value)
      else sessionStorage.removeItem(key(ownerId.value))
    }
  }
  const reset = (): void => {
    ++version
    ++scopeRevision.value
    pending = undefined
    if (ownerId.value) sessionStorage.removeItem(key(ownerId.value))
    warehouses.value = []
    selectedId.value = undefined
    ownerId.value = undefined
    loading.value = false
    loaded.value = false
    error.value = ''
    accessBlocked.value = false
    recoveryNotice.value = false
  }
  const load = (userId: string, recoveringDenial = false): Promise<void> => {
    if (ownerId.value !== userId) {
      reset()
      ownerId.value = userId
      selectedId.value = sessionStorage.getItem(key(userId)) ?? undefined
    }
    if (pending) return pending
    const requestVersion = ++version
    loading.value = true
    error.value = ''
    const task = (async () => {
      try {
        const result = await getMyWarehouses()
        if (requestVersion !== version) return
        const changed = JSON.stringify(result) !== JSON.stringify(warehouses.value)
        const removed = warehouses.value.some((item) => !result.some((next) => next.id === item.id))
        warehouses.value = result
        loaded.value = true
        // An unchanged assignment can be stale on the server. Require an explicit retry
        // instead of remounting the page into another automatic denial/recovery loop.
        accessBlocked.value = recoveringDenial && !removed
        if (accessBlocked.value) error.value = 'Chưa xác minh được thay đổi quyền truy cập kho.'
        else select(selectedId.value)
        if (changed) ++scopeRevision.value
      } catch (cause) {
        if (requestVersion !== version) return
        error.value = cause instanceof Error ? cause.message : 'Error'
        // Retain the last known scope. A failed refresh does not confirm an empty assignment.
        throw cause
      } finally {
        if (requestVersion === version) {
          loading.value = false
          pending = undefined
        }
      }
    })()
    pending = task
    return task
  }
  const revokeAccess = (userId: string): Promise<void> => {
    if (!accessBlocked.value) {
      accessBlocked.value = true
      recoveryNotice.value = true
      ++scopeRevision.value
      // Supersede any scope fetch started before the denial.
      ++version
      pending = undefined
    }
    return load(userId, true)
  }
  return {
    warehouses,
    selectedId,
    selected,
    ownerId,
    loading,
    loaded,
    error,
    accessBlocked,
    scopeRevision,
    recoveryNotice,
    select,
    reset,
    load,
    revokeAccess,
  }
})
