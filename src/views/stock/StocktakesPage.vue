<script setup lang="ts">
import { computed, onBeforeUnmount, reactive, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { BasicTable } from '@/components'
import StocktakeDialog from '@/components/stock/StocktakeDialog.vue'
import { getStocktakes } from '@/api/stock/stocktake.api'
import { useWarehouseStore } from '@/stores/warehouse'
import { useCatalogPermission } from '@/composables/useCatalogPermission'
import { useAuthStore } from '@/stores/auth'
import { formatDateTime } from '@/utils/date'
import { stockError } from '@/utils/stock'
import type { ReceiptStatus } from '@/types/stock'
import type { Stocktake } from '@/types/stocktake'
import { useRoute } from 'vue-router'
import { useSalesScope } from '@/composables/useSalesScope'
const { t } = useI18n()
const { can } = useCatalogPermission()
const auth = useAuthStore()
const route = useRoute()
const { scopeKey, refreshScope } = useSalesScope()
const initial = ref<Stocktake>()
const warehouses = useWarehouseStore()
const rows = ref<Stocktake[]>([])
const page = ref(1)
const pageSize = ref(10)
const total = ref(0)
const loading = ref(false)
const error = ref('')
const filters = reactive({
  warehouseId: warehouses.selectedId,
  status: undefined as ReceiptStatus | undefined,
  from: '',
  to: '',
})
const open = ref(false)
const id = ref<string>()
const mode = ref<'create' | 'edit' | 'view' | 'confirm' | 'cancel'>('view')
let sequence = 0
const columns = computed(() =>
  [
    'code',
    'warehouse',
    'createdBy',
    'updatedBy',
    'updatedAt',
    'status',
    'createdAt',
    'actions',
  ].map((key) => ({
    title: t(['updatedBy', 'updatedAt'].includes(key) ? `stocktake.${key}` : `stock.${key}`),
    key,
    dataIndex: key,
  })),
)
const statusOptions = computed(() =>
  (['DRAFT', 'CONFIRMED', 'CANCELLED'] as const).map((status) => ({
    value: status,
    label: t(`stock.${status}`),
  })),
)
const warehouseOptions = computed(() =>
  warehouses.warehouses.map((item) => ({ value: item.id, label: `${item.code} - ${item.name}` })),
)
const pagination = computed(() => ({
  current: page.value,
  pageSize: pageSize.value,
  total: total.value,
  showSizeChanger: true,
  pageSizeOptions: ['10', '20', '50', '100'],
}))
const warehouseName = (warehouseId: string): string =>
  warehouses.warehouses.find((item) => item.id === warehouseId)?.name ?? warehouseId
const load = async (): Promise<void> => {
  const current = ++sequence
  rows.value = []
  total.value = 0
  error.value = ''
  loading.value = false
  if (!can('STOCKTAKE_VIEW')) return
  if (filters.from && filters.to && filters.from > filters.to) {
    error.value = t('stock.invalidRange')
    return
  }
  loading.value = true
  try {
    const result = await getStocktakes({
      page: page.value,
      pageSize: pageSize.value,
      ...(filters.warehouseId ? { warehouseId: filters.warehouseId } : {}),
      ...(filters.status ? { status: filters.status } : {}),
      ...(filters.from ? { from: filters.from } : {}),
      ...(filters.to ? { to: filters.to } : {}),
    })
    if (current !== sequence) return
    rows.value = result.items
    total.value = result.total
    if (!result.items.length && page.value > 1 && result.total > 0) {
      page.value = Math.ceil(result.total / pageSize.value)
      void load()
    }
  } catch (cause) {
    if (current === sequence) {
      error.value = stockError(cause, t)
      if ((cause as { code?: string }).code === 'WAREHOUSE_ACCESS_DENIED') {
        rows.value = []
        total.value = 0
        open.value = false
        await refreshScope()
      }
    }
  } finally {
    if (current === sequence) loading.value = false
  }
}
const resetPage = (): void => {
  page.value = 1
  void load()
}
watch(() => [filters.warehouseId, filters.status, filters.from, filters.to], resetPage)
watch(
  () => warehouses.selectedId,
  (value) => {
    filters.warehouseId = value
  },
)
watch(
  () => [auth.user?.id, auth.user?.permissions.join(','), auth.isCatalogAdmin, scopeKey.value],
  () => {
    if (!can('STOCKTAKE_VIEW') && mode.value !== 'create') {
      open.value = false
      initial.value = undefined
    }
    if (
      filters.warehouseId &&
      !warehouses.warehouses.some((item) => item.id === filters.warehouseId)
    )
      filters.warehouseId = undefined
    resetPage()
  },
  { immediate: true },
)
watch(
  () => route.query.stocktakeId,
  (value) => {
    if (typeof value === 'string' && can('STOCKTAKE_VIEW')) {
      id.value = value
      mode.value = 'view'
      initial.value = undefined
      open.value = true
    }
  },
  { immediate: true },
)
onBeforeUnmount(() => ++sequence)
const show = (nextMode: typeof mode.value, receipt?: Stocktake): void => {
  const permission = {
    create: 'CREATE',
    edit: 'UPDATE',
    view: 'VIEW',
    confirm: 'CONFIRM',
    cancel: 'CANCEL',
  }[nextMode]
  if (!can(`STOCKTAKE_${permission}`)) return
  mode.value = nextMode
  initial.value = receipt
  id.value = receipt?.id
  open.value = true
}
const changePage = (next: number, size: number): void => {
  page.value = size !== pageSize.value ? 1 : next
  pageSize.value = size
  void load()
}
</script>
<template>
  <section>
    <div class="stock-heading">
      <h1>{{ t('stocktake.title') }}</h1>
      <a-button v-if="can('STOCKTAKE_CREATE')" type="primary" @click="show('create')">{{
        t('stocktake.create')
      }}</a-button>
    </div>
    <a-alert v-if="error" type="error" :message="error" show-icon />
    <a-alert v-if="!can('STOCKTAKE_VIEW')" type="info" :message="t('stock.forbidden')" />
    <template v-else>
      <div class="stock-filters">
        <a-select
          v-model:value="filters.warehouseId"
          :options="warehouseOptions"
          :placeholder="t('stock.warehouse')"
          :aria-label="t('stock.warehouse')"
          allow-clear
        />
        <a-select
          v-model:value="filters.status"
          :options="statusOptions"
          :placeholder="t('stock.status')"
          :aria-label="t('stock.status')"
          allow-clear
        />
        <a-date-picker
          v-model:value="filters.from"
          value-format="YYYY-MM-DD"
          :placeholder="t('stock.from')"
        />
        <a-date-picker
          v-model:value="filters.to"
          value-format="YYYY-MM-DD"
          :placeholder="t('stock.toInclusive')"
        />
        <a-button
          @click="
            Object.assign(filters, { warehouseId: undefined, status: undefined, from: '', to: '' })
          "
          >{{ t('common.reset') }}</a-button
        >
      </div>
      <BasicTable
        :columns="columns"
        :data-source="rows"
        :loading="loading"
        :pagination="pagination"
        :scroll="{ x: 1200 }"
        @reload="load"
        @page-change="changePage"
      >
        <template #bodyCell="{ column, record }">
          <template v-if="column.key === 'warehouse'">{{
            warehouseName(record.warehouseId)
          }}</template>
          <template v-else-if="column.key === 'createdAt' || column.key === 'updatedAt'">{{
            formatDateTime(record[column.key])
          }}</template>
          <a-tag
            v-else-if="column.key === 'status'"
            :color="
              record.status === 'CONFIRMED'
                ? 'green'
                : record.status === 'CANCELLED'
                  ? 'red'
                  : 'default'
            "
            >{{ t(`stock.${record.status}`) }}</a-tag
          >
          <a-space v-else-if="column.key === 'actions'" wrap>
            <a-button size="small" @click="show('view', record)">{{
              t('stocktake.view')
            }}</a-button>
            <a-button
              v-if="record.status === 'DRAFT' && can('STOCKTAKE_UPDATE')"
              size="small"
              @click="show('edit', record)"
              >{{ t('stocktake.edit') }}</a-button
            >
            <a-button
              v-if="record.status === 'DRAFT' && can('STOCKTAKE_CONFIRM')"
              size="small"
              type="primary"
              @click="show('confirm', record)"
              >{{ t('stock.confirm') }}</a-button
            >
            <a-button
              v-if="record.status === 'DRAFT' && can('STOCKTAKE_CANCEL')"
              size="small"
              danger
              @click="show('cancel', record)"
              >{{ t('stock.cancel') }}</a-button
            >
          </a-space>
          <template v-else-if="column.key === 'supplierName'">{{
            record.supplierName || '-'
          }}</template>
        </template>
      </BasicTable>
    </template>
    <StocktakeDialog :id="id" v-model:open="open" :initial="initial" :mode="mode" @saved="load" />
  </section>
</template>
<style scoped>
.stock-heading {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 20px;
}
.stock-heading h1 {
  margin: 0;
}
.stock-filters {
  display: flex;
  gap: 12px;
  flex-wrap: wrap;
  margin: 20px 0;
}
.stock-filters :deep(.ant-select) {
  min-width: 180px;
}
</style>
