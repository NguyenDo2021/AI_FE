<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import type { TableColumnsType } from 'ant-design-vue'
import StocktakeTable from './StocktakeTable.vue'
import { getInventory } from '@/api/stock/stock.api'
import { useSalesScope } from '@/composables/useSalesScope'
import { formatStockInteger, stockError } from '@/utils/stock'
import type { Inventory } from '@/types/stock'
const props = defineProps<{ warehouseId: string; selected: string[]; disabled?: boolean }>()
const emit = defineEmits<{ select: [value: Inventory] }>()
const { t } = useI18n()
const { can, scopeKey, inScope, refreshScope } = useSalesScope()
const rows = ref<Inventory[]>([])
const page = ref(1)
const pageSize = ref(10)
const total = ref(0)
const loading = ref(false)
const error = ref('')
let sequence = 0
const columns = computed<TableColumnsType<Inventory>>(() =>
  ['productCode', 'productName', 'unit', 'quantity', 'actions'].map((key) => ({
    key,
    dataIndex: key,
    title: t(`stock.${key}`),
    width: (
      { productCode: 160, productName: 260, unit: 90, quantity: 190, actions: 150 } as Record<
        string,
        number
      >
    )[key],
    ...(key === 'quantity' ? { align: 'right' as const } : {}),
    ...(key === 'actions' ? { fixed: 'right' as const } : {}),
  })),
)
const pagination = computed(() => ({
  current: page.value,
  pageSize: pageSize.value,
  total: total.value,
  showSizeChanger: true,
  pageSizeOptions: ['10', '20', '50', '100'],
}))
const load = async (): Promise<void> => {
  const current = ++sequence
  rows.value = []
  error.value = ''
  loading.value = false
  total.value = 0
  if (!props.warehouseId || !can('INVENTORY_VIEW') || !inScope(props.warehouseId)) return
  loading.value = true
  try {
    const result = await getInventory(props.warehouseId, {
      page: page.value,
      pageSize: pageSize.value,
    })
    if (current !== sequence) return
    rows.value = result.items
    total.value = result.total
  } catch (cause) {
    if (current !== sequence) return
    error.value = stockError(cause, t)
    if ((cause as { code?: string }).code === 'WAREHOUSE_ACCESS_DENIED') await refreshScope(cause)
  } finally {
    if (current === sequence) loading.value = false
  }
}
watch(
  () => [props.warehouseId, scopeKey.value],
  () => {
    page.value = 1
    void load()
  },
  { immediate: true },
)
onBeforeUnmount(() => ++sequence)
const changePage = (next: number, size: number): void => {
  page.value = size === pageSize.value ? next : 1
  pageSize.value = size
  void load()
}
const select = (row: Inventory): void => {
  if (
    !props.disabled &&
    can('INVENTORY_VIEW') &&
    inScope(props.warehouseId) &&
    !props.selected.includes(row.productId) &&
    props.selected.length < 1000
  )
    emit('select', row)
}
</script>
<template>
  <a-alert
    v-if="!can('INVENTORY_VIEW')"
    type="warning"
    :message="t('stocktake.productPermission')"
    show-icon
  />
  <template v-else-if="warehouseId">
    <a-alert v-if="error" type="error" :message="error" />
    <StocktakeTable
      :columns="columns"
      :title="t('stocktake.availableProducts')"
      :total-label="t('stocktake.totalProducts', { total })"
      :scroll-width="850"
      :reset-key="JSON.stringify([warehouseId, page, pageSize])"
      :rows="rows"
      row-key="productId"
      :pagination="pagination"
      :loading="loading"
      @reload="load"
      @page-change="changePage"
    >
      <template #bodyCell="{ column, record }">
        <a-tooltip
          v-if="column.key === 'productCode' || column.key === 'productName'"
          :title="record[column.key] || '—'"
        >
          <span class="stocktake-product-text">{{ record[column.key] || '—' }}</span>
        </a-tooltip>
        <template v-else-if="column.key === 'unit'">{{ record.unit || '—' }}</template>
        <template v-else-if="column.key === 'quantity'">{{
          formatStockInteger(record.quantity)
        }}</template>
        <a-button
          v-else-if="column.key === 'actions'"
          size="small"
          :disabled="disabled || selected.includes(record.productId) || selected.length >= 1000"
          @click="select(record)"
          >{{ t('stocktake.addProduct') }}</a-button
        >
      </template>
    </StocktakeTable>
  </template>
</template>
<style scoped>
.stocktake-product-text {
  display: block;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
</style>
