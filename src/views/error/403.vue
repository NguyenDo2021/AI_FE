<script setup lang="ts">
import { useRouter } from 'vue-router'
const router = useRouter()
</script>

<template>
  <a-result status="403" :title="$t('common.forbidden')">
    <template #extra>
      <a-button type="primary" @click="router.replace('/dashboard')">
        {{ $t('common.backHome') }}
      </a-button>
    </template>
  </a-result>
</template>
