<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, reactive, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { PlusOutlined, ReloadOutlined, EyeOutlined, MoreOutlined } from '@ant-design/icons-vue'
import type { TableColumnsType } from 'ant-design-vue'
import StocktakeTable from '@/components/stock/StocktakeTable.vue'
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
const compact = ref(false)
const updateCompact = (): void => {
  if (typeof window.matchMedia === 'function')
    compact.value = window.matchMedia('(max-width: 767px)').matches
}
onMounted(() => {
  updateCompact()
  window.addEventListener('resize', updateCompact)
})
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
const columns = computed<TableColumnsType<Stocktake>>(() =>
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
    width: (
      {
        code: 190,
        warehouse: 200,
        createdBy: 200,
        updatedBy: 200,
        updatedAt: 180,
        status: 130,
        createdAt: 180,
        actions: compact.value ? 100 : 210,
      } as Record<string, number>
    )[key],
    ...(key === 'actions' ? { fixed: 'right' as const } : {}),
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
const tableWidth = computed(() =>
  columns.value.reduce((sum, column) => sum + Number(column.width), 0),
)
const tableResetKey = computed(() => JSON.stringify([page.value, pageSize.value, filters]))
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
onBeforeUnmount(() => {
  ++sequence
  window.removeEventListener('resize', updateCompact)
})
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
  <a-config-provider :theme="{ token: { colorPrimary: '#7357cf', borderRadius: 8 } }">
    <section class="stocktakes-page">
      <div class="stocktake-heading">
        <div>
          <h1>{{ t('stocktake.title') }}</h1>
          <p>{{ t('stocktake.description') }}</p>
        </div>
        <a-button
          v-if="can('STOCKTAKE_CREATE')"
          type="primary"
          size="large"
          @click="show('create')"
        >
          <template #icon><PlusOutlined aria-hidden="true" /></template>{{ t('stocktake.create') }}
        </a-button>
      </div>
      <a-alert v-if="error" type="error" :message="error" show-icon />
      <a-alert v-if="!can('STOCKTAKE_VIEW')" type="info" :message="t('stock.forbidden')" />
      <template v-else>
        <div class="stocktake-filters">
          <div class="stocktake-filter">
            <label for="stocktake-filter-warehouse">{{ t('stock.warehouse') }}</label>
            <a-select
              id="stocktake-filter-warehouse"
              v-model:value="filters.warehouseId"
              :options="warehouseOptions"
              :placeholder="t('stock.warehouse')"
              :aria-label="t('stock.warehouse')"
              allow-clear
            />
          </div>
          <div class="stocktake-filter">
            <label for="stocktake-filter-status">{{ t('stock.status') }}</label>
            <a-select
              id="stocktake-filter-status"
              v-model:value="filters.status"
              :options="statusOptions"
              :placeholder="t('stock.status')"
              :aria-label="t('stock.status')"
              allow-clear
            />
          </div>
          <div class="stocktake-filter">
            <label for="stocktake-filter-from">{{ t('stock.from') }}</label>
            <a-date-picker
              id="stocktake-filter-from"
              v-model:value="filters.from"
              value-format="YYYY-MM-DD"
              :placeholder="t('stocktake.datePlaceholder')"
              format="DD/MM/YYYY"
              :aria-label="t('stock.from')"
            />
          </div>
          <div class="stocktake-filter">
            <label for="stocktake-filter-to">{{ t('stock.toInclusive') }}</label>
            <a-date-picker
              id="stocktake-filter-to"
              v-model:value="filters.to"
              value-format="YYYY-MM-DD"
              :placeholder="t('stocktake.datePlaceholder')"
              format="DD/MM/YYYY"
              :aria-label="t('stock.toInclusive')"
            />
          </div>
          <a-button
            @click="
              Object.assign(filters, {
                warehouseId: undefined,
                status: undefined,
                from: '',
                to: '',
              })
            "
          >
            <template #icon><ReloadOutlined aria-hidden="true" /></template>{{ t('common.reset') }}
          </a-button>
        </div>
        <StocktakeTable
          :columns="columns"
          :rows="rows"
          :loading="loading"
          :pagination="pagination"
          :title="t('stocktake.list')"
          :total-label="t('stocktake.total', { total })"
          :scroll-width="tableWidth"
          bounded
          :reset-key="tableResetKey"
          @reload="load"
          @page-change="changePage"
        >
          <template #bodyCell="{ column, record }">
            <a-tooltip
              v-if="column.key === 'warehouse'"
              :title="warehouseName(record.warehouseId) || '—'"
            >
              <span class="stocktake-ellipsis">{{ warehouseName(record.warehouseId) || '—' }}</span>
            </a-tooltip>
            <a-tooltip
              v-else-if="['code', 'createdBy', 'updatedBy'].includes(String(column.key))"
              :title="record[column.key] || '—'"
            >
              <span
                class="stocktake-ellipsis"
                :class="{ 'stocktake-code': column.key === 'code' }"
                >{{ record[column.key] || '—' }}</span
              >
            </a-tooltip>
            <span
              v-else-if="column.key === 'createdAt' || column.key === 'updatedAt'"
              class="stocktake-date"
              >{{ formatDateTime(record[column.key]) || '—' }}</span
            >
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
            <div v-else-if="column.key === 'actions'" class="stocktake-actions">
              <a-tooltip :title="t('stocktake.view')"
                ><a-button
                  type="link"
                  size="small"
                  :aria-label="t('stocktake.view')"
                  @click="show('view', record)"
                >
                  <template #icon><EyeOutlined aria-hidden="true" /></template
                  ><span v-if="!compact">{{ t('stocktake.view') }}</span>
                </a-button></a-tooltip
              >
              <a-dropdown
                v-if="
                  record.status === 'DRAFT' &&
                  (can('STOCKTAKE_UPDATE') || can('STOCKTAKE_CONFIRM') || can('STOCKTAKE_CANCEL'))
                "
                :trigger="['click']"
                placement="bottomRight"
              >
                <a-button size="small" :aria-label="t('stock.actions')" aria-haspopup="menu"
                  ><MoreOutlined
                /></a-button>
                <template #overlay>
                  <a-menu>
                    <a-menu-item
                      v-if="can('STOCKTAKE_UPDATE')"
                      key="edit"
                      @click="show('edit', record)"
                      >{{ t('stocktake.edit') }}</a-menu-item
                    >
                    <a-menu-item
                      v-if="can('STOCKTAKE_CONFIRM')"
                      key="confirm"
                      @click="show('confirm', record)"
                      >{{ t('stock.confirm') }}</a-menu-item
                    >
                    <a-menu-item
                      v-if="can('STOCKTAKE_CANCEL')"
                      key="cancel"
                      danger
                      @click="show('cancel', record)"
                      >{{ t('stock.cancel') }}</a-menu-item
                    >
                  </a-menu>
                </template>
              </a-dropdown>
            </div>
          </template>
        </StocktakeTable>
      </template>
      <StocktakeDialog :id="id" v-model:open="open" :initial="initial" :mode="mode" @saved="load" />
    </section>
  </a-config-provider>
</template>

<style scoped>
.stocktakes-page {
  display: flex;
  flex-direction: column;
  flex: 1;
  min-height: 0;
  min-width: 0;
  gap: 16px;
}
.stocktake-heading {
  display: flex;
  justify-content: space-between;
  align-items: center;
  flex-shrink: 0;
  gap: 12px;
}
h1 {
  margin: 0;
  color: #302640;
  font-size: 24px;
  line-height: 32px;
  font-weight: 650;
}
.stocktake-heading p {
  margin: 4px 0 0;
  color: #797184;
  font-size: 14px;
  line-height: 20px;
}
.stocktake-filters {
  display: grid;
  grid-template-columns: minmax(180px, 1.2fr) minmax(150px, 1fr) repeat(2, minmax(180px, 1fr)) auto;
  align-items: end;
  gap: 12px;
  padding: 16px;
  background: #fff;
  border: 1px solid #e9e4f1;
  border-radius: 12px;
  flex-shrink: 0;
}
.stocktake-filter {
  display: flex;
  flex-direction: column;
  min-width: 0;
  gap: 6px;
  color: #625b70;
  font-size: 13px;
}
.stocktake-filters :deep(.ant-select),
.stocktake-filters :deep(.ant-picker) {
  width: 100%;
  min-width: 0;
}
.stocktake-filters :deep(.ant-picker-input > input) {
  min-width: 0;
}
.stocktake-ellipsis {
  display: block;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.stocktake-code {
  font-weight: 600;
  color: #5a4578;
}
.stocktake-date {
  white-space: nowrap;
  font-variant-numeric: tabular-nums;
}
.stocktake-actions {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 6px;
  white-space: nowrap;
}
.stocktake-actions :deep(.ant-btn-link) {
  padding-inline: 0;
}
:global(.admin-layout:has(.stocktakes-page)) {
  height: 100dvh;
  min-height: 0;
}
:global(.admin-layout:has(.stocktakes-page) > .admin-layout__main) {
  height: 100%;
  min-height: 0;
}
:global(.admin-layout:has(.stocktakes-page) .app-header) {
  flex-shrink: 0;
}
:global(.admin-layout__content:has(.stocktakes-page)) {
  display: flex;
  flex-direction: column;
  min-height: 0;
  margin: 0;
  padding: 20px 24px;
  background: #f5f3fa;
  border-radius: 0;
}
@container workspace (max-width: 1000px) {
  .stocktake-filters {
    grid-template-columns: repeat(2, minmax(180px, 1fr)) auto;
  }
  .stocktake-filters > :last-child {
    grid-column: 3;
    grid-row: 2;
  }
}
@container workspace (max-width: 600px) {
  .stocktake-heading {
    flex-wrap: wrap;
    align-items: flex-start;
  }
  .stocktake-heading > div {
    flex-basis: 100%;
  }
  .stocktake-filters {
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 10px;
    padding: 12px;
  }
  .stocktake-filters > :first-child {
    grid-column: 1 / -1;
  }
  .stocktake-filters > :nth-child(2) {
    grid-column: 1 / -1;
  }
  .stocktake-filters > :last-child {
    grid-column: 1 / -1;
    grid-row: auto;
    justify-self: start;
  }
  h1 {
    font-size: 22px;
  }
  .stocktake-filters :deep(.ant-picker) {
    padding-inline: 6px;
  }
  .stocktake-filters :deep(.ant-picker-suffix) {
    margin-inline-start: 2px;
  }
}
@media (max-width: 767px), (max-height: 650px) {
  :global(.admin-layout__content:has(.stocktakes-page)) {
    padding: 12px;
  }
  .stocktakes-page {
    gap: 10px;
  }
}
</style>
