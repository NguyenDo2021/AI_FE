import { ref } from 'vue'
import { defineStore } from 'pinia'

export const useAppStore = defineStore('app', () => {
  const sidebarCollapsed = ref(false)
  const globalLoading = ref(false)

  const toggleSidebar = (): void => {
    sidebarCollapsed.value = !sidebarCollapsed.value
  }

  return { sidebarCollapsed, globalLoading, toggleSidebar }
})
