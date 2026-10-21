<script setup lang="ts">
import { computed, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { theme } from 'ant-design-vue'
import { ShopOutlined, ReloadOutlined } from '@ant-design/icons-vue'
import { useAuthStore } from '@/stores/auth'
import { useWarehouseStore } from '@/stores/warehouse'

const auth = useAuthStore()
const store = useWarehouseStore()
const { t } = useI18n()
const { token } = theme.useToken()
const options = computed(() =>
  store.warehouses.map((item) => ({
    value: item.id,
    label: `${item.code} — ${item.name}${item.status === 0 ? ` (${t('common.inactive')})` : ''}`,
    name: item.name,
    disabled: item.status === 0,
  })),
)
const placeholder = computed(() => {
  if (store.loading) return t('header.loadingWarehouses')
  if (store.error) return t('header.warehouseLoadError')
  if (store.loaded && !store.warehouses.length) return t('header.noAssignedWarehouses')
  return t('header.chooseWarehouse')
})
const description = computed(() => {
  if (store.loading) return t('header.loadingWarehouses')
  if (store.error) return t('header.warehouseLoadError')
  if (store.loaded && !store.warehouses.length) return t('catalog.noWarehouses')
  return store.selected
    ? `${store.selected.code} — ${store.selected.name}`
    : t('header.chooseWarehouse')
})
const selectorStyle = computed(() => ({
  '--warehouse-bg': token.value['purple-1'],
  '--warehouse-accent': token.value['purple-6'],
  '--warehouse-muted': token.value.colorTextSecondary,
  '--warehouse-focus': token.value.colorPrimary,
}))
const reload = (): void => {
  if (auth.user && !store.loading) void store.load(auth.user.id).catch(() => undefined)
}
watch(
  () => auth.user?.id,
  (id) => {
    if (id) {
      // Identity changes must still supersede a request belonging to a previous user.
      if (store.ownerId !== id || !store.loading) {
        void store.load(id).catch(() => undefined)
      }
    } else store.reset()
  },
  { immediate: true },
)
</script>

<template>
  <div class="warehouse-selector" :style="selectorStyle" :aria-busy="store.loading">
    <a-tooltip :title="description">
      <div class="warehouse-selector__field">
        <ShopOutlined class="warehouse-selector__icon" aria-hidden="true" />
        <a-select
          size="large"
          option-label-prop="name"
          class="warehouse-selector__select"
          :value="store.selected ? store.selectedId : undefined"
          :loading="store.loading"
          :disabled="store.loading || (!!store.loaded && !store.warehouses.length) || !!store.error"
          :status="store.error ? 'error' : undefined"
          :options="options"
          :placeholder="placeholder"
          :aria-label="t('catalog.workingWarehouse')"
          :not-found-content="t('common.noData')"
          allow-clear
          show-search
          :filter-option="
            (input: string, option: { label?: string }) =>
              (option.label ?? '').toLowerCase().includes(input.toLowerCase())
          "
          @change="store.select"
        >
          <template #option="{ label }">
            <span class="warehouse-selector__option" :title="label">{{ label }}</span>
          </template>
        </a-select>
        <span class="warehouse-selector__status" role="status">{{ description }}</span>
      </div>
    </a-tooltip>
    <a-tooltip :title="t('header.reloadData')">
      <span class="warehouse-selector__reload-wrap">
        <a-button
          type="text"
          class="warehouse-selector__reload"
          :loading="store.loading"
          :disabled="store.loading || !auth.user"
          :aria-label="t('header.reloadData')"
          @click="reload"
        >
          <template #icon><ReloadOutlined /></template>
        </a-button>
      </span>
    </a-tooltip>
  </div>
</template>

<style scoped>
.warehouse-selector {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 40px;
  align-items: center;
  min-width: 0;
  gap: 12px;
}
.warehouse-selector__field {
  position: relative;
  display: flex;
  align-items: center;
  min-width: 0;
  height: 40px;
}
.warehouse-selector__icon {
  position: absolute;
  z-index: 1;
  top: 50%;
  left: 12px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  font-size: 15px;
  color: var(--warehouse-accent);
  pointer-events: none;
  transform: translateY(-50%);
}
.warehouse-selector__select {
  width: 100%;
  height: 40px;
}
.warehouse-selector__select :deep(.ant-select-selector) {
  height: 40px !important;
  padding-left: 36px !important;
  font-size: 13px;
  color: var(--warehouse-accent);
  background: var(--warehouse-bg) !important;
  border-color: transparent;
  border-radius: 8px;
}
.warehouse-selector__select :deep(.ant-select-selection-placeholder),
.warehouse-selector__select :deep(.ant-select-arrow) {
  color: var(--warehouse-accent);
}
.warehouse-selector__select :deep(.ant-select-selection-item),
.warehouse-selector__select :deep(.ant-select-selection-placeholder) {
  overflow: hidden;
  line-height: 38px;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.warehouse-selector__select :deep(.ant-select-selection-search) {
  left: 36px;
}
.warehouse-selector__select :deep(.ant-select-selection-search-input) {
  height: 38px;
}
.warehouse-selector__option {
  white-space: normal;
  overflow-wrap: anywhere;
}
.warehouse-selector__reload-wrap,
.warehouse-selector__reload {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 40px;
  height: 40px;
}
.warehouse-selector__reload {
  padding: 0;
  color: var(--warehouse-muted);
  border-radius: 8px;
}
.warehouse-selector__reload :deep(.anticon) {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  font-size: 16px;
}
.warehouse-selector__reload:focus-visible {
  outline: 2px solid var(--warehouse-focus);
  outline-offset: 2px;
}
.warehouse-selector__status {
  position: absolute;
  width: 1px;
  height: 1px;
  overflow: hidden;
  clip-path: inset(50%);
  white-space: nowrap;
}
</style>
