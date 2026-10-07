<script setup lang="ts">
import { computed, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { useAuthStore } from '@/stores/auth'
import { useWarehouseStore } from '@/stores/warehouse'
const auth = useAuthStore()
const store = useWarehouseStore()
const { t } = useI18n()
const options = computed(() =>
  store.warehouses.map((item) => ({
    value: item.id,
    label: `${item.code} — ${item.name}${item.status === 0 ? ` (${t('common.inactive')})` : ''}`,
    disabled: item.status === 0,
  })),
)
const reload = (): void => {
  if (auth.user) void store.load(auth.user.id).catch(() => undefined)
}
watch(
  () => auth.user?.id,
  (id) => {
    if (id) reload()
    else store.reset()
  },
  { immediate: true },
)
</script>
<template>
  <div class="warehouse-selector">
    <a-tooltip
      :title="
        store.error ||
        (!store.warehouses.length ? $t('catalog.noWarehouses') : $t('catalog.workingWarehouse'))
      "
    >
      <a-select
        :value="store.selectedId"
        :loading="store.loading"
        :options="options"
        :placeholder="$t('catalog.workingWarehouse')"
        :aria-label="$t('catalog.workingWarehouse')"
        allow-clear
        show-search
        :filter-option="
          (input: string, option: { label?: string }) =>
            (option.label ?? '').toLowerCase().includes(input.toLowerCase())
        "
        @change="store.select"
      />
    </a-tooltip>
    <a-button size="small" :loading="store.loading" @click="reload">{{
      $t('common.reload')
    }}</a-button>
  </div>
</template>
<style scoped>
.warehouse-selector {
  display: flex;
  align-items: center;
  gap: 6px;
}
.warehouse-selector :deep(.ant-select) {
  width: 230px;
}
@media (max-width: 900px) {
  .warehouse-selector :deep(.ant-select) {
    width: 150px;
  }
}
</style>
