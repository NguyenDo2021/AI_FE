<script setup lang="ts">
import { TeamOutlined } from '@ant-design/icons-vue'
import type { Role } from '@/types/role'
defineProps<{ role: Role; showStatus?: boolean }>()
</script>

<template>
  <div class="role-identity">
    <span class="role-identity__icon"><TeamOutlined aria-hidden="true" /></span>
    <div>
      <strong :title="role.name">{{ role.name || '—' }}</strong>
      <span class="role-identity__code" :title="role.code">{{ role.code || '—' }}</span>
      <a-tag
        v-if="showStatus && role.status != null"
        :color="role.status === 1 ? 'success' : 'default'"
        >{{ $t(role.status === 1 ? 'common.active' : 'common.inactive') }}</a-tag
      >
      <span v-else-if="showStatus">—</span>
    </div>
  </div>
</template>

<style scoped>
.role-identity {
  display: flex;
  align-items: center;
  gap: 14px;
  min-width: 0;
  padding: 14px;
  border-radius: 10px;
  background: #f4efff;
}
.role-identity__icon {
  display: grid;
  place-items: center;
  flex: 0 0 44px;
  height: 44px;
  border-radius: 10px;
  background: #e8dfff;
  color: #7357cf;
  font-size: 24px;
}
.role-identity > div {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 4px;
  min-width: 0;
  overflow-wrap: anywhere;
}
.role-identity strong {
  color: #17143d;
}
.role-identity strong,
.role-identity__code {
  display: -webkit-box;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 2;
  overflow: hidden;
}
.role-identity > div > span {
  color: #77708d;
  font-size: 13px;
}
.role-identity :deep(.ant-tag) {
  max-width: 100%;
  margin: 0;
  white-space: normal;
}
</style>
