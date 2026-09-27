<script setup lang="ts">
import { useAppStore } from '@/stores/app'

const appStore = useAppStore()
</script>

<template>
  <a-config-provider>
    <a-spin :spinning="appStore.globalLoading" :tip="$t('common.loading')" size="large">
      <RouterView />
    </a-spin>
  </a-config-provider>
</template>
