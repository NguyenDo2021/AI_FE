import { ref } from 'vue'
import { defineStore } from 'pinia'
import type { User } from '@/types/user'

export const useUserStore = defineStore('user', () => {
  const selectedUser = ref<User | null>(null)
  const selectUser = (user: User | null): void => {
    selectedUser.value = user
  }

  return { selectedUser, selectUser }
})
