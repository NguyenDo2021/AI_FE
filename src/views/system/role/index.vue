<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { getRoleList, type Role } from '@/api/role/role.api'

const roles = ref<Role[]>([])
const loading = ref(false)
const errorMessage = ref('')
const { t } = useI18n()

const loadRoles = async (): Promise<void> => {
  if (loading.value) return
  loading.value = true
  try {
    roles.value = await getRoleList()
    errorMessage.value = ''
  } catch {
    errorMessage.value = t('errors.unknown')
  } finally {
    loading.value = false
  }
}

onMounted(() => void loadRoles())
</script>

<template>
  <div>
    <a-alert v-if="errorMessage" :message="errorMessage" type="error" show-icon />
    <h1>{{ $t('common.role') }}</h1>
    <a-table :data-source="roles" :loading="loading" :pagination="false" row-key="id">
      <a-table-column key="name" data-index="name" :title="$t('common.role')" />
      <a-table-column key="code" data-index="code" :title="$t('common.code')" />
      <a-table-column key="description" data-index="description" :title="$t('common.description')" />
    </a-table>
  </div>
</template>
