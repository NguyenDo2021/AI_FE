import { defineStore } from 'pinia'
import { ref } from 'vue'
export const useStockStore = defineStore('stock', () => {
  const revision = ref(0)
  const invalidate = (): void => {
    revision.value++
  }
  return { revision, invalidate }
})
