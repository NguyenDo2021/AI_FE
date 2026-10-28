<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, reactive, ref, useId, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import type { TableColumnsType } from 'ant-design-vue'
import {
  PlusOutlined,
  SearchOutlined,
  ReloadOutlined,
  FilterOutlined,
  DownOutlined,
  UpOutlined,
  EyeOutlined,
  EditOutlined,
  CheckOutlined,
  CloseCircleOutlined,
} from '@ant-design/icons-vue'
import StocktakeTable from '@/components/stock/StocktakeTable.vue'
import ReceiptDialog from '@/components/stock/ReceiptDialog.vue'
import { getReceipts } from '@/api/stock/stock.api'
import { useWarehouseStore } from '@/stores/warehouse'
import { useCatalogPermission } from '@/composables/useCatalogPermission'
import { useAuthStore } from '@/stores/auth'
import { formatDate, formatDateTime } from '@/utils/date'
import { formatStockInteger, stockError } from '@/utils/stock'
import type { Receipt, ReceiptStatus } from '@/types/stock'

const { t } = useI18n()
const { can } = useCatalogPermission()
const auth = useAuthStore()
const warehouses = useWarehouseStore()
const filterId = useId()
const root = ref<HTMLElement>()
const compact = ref(false)
let observer: ResizeObserver | undefined
onMounted(() => {
  if (!root.value || typeof ResizeObserver === 'undefined') return
  observer = new ResizeObserver(() => {
    compact.value = (root.value?.clientWidth ?? 1200) <= 600
  })
  observer.observe(root.value)
})
const rows = ref<Receipt[]>([])
const page = ref(1)
const pageSize = ref(10)
const total = ref(0)
const loading = ref(false)
const error = ref('')
const rangeError = ref('')
const expanded = ref(false)
const mobileOpen = ref(false)
const defaults = () => ({
  warehouseId: warehouses.selectedId,
  status: undefined as ReceiptStatus | undefined,
  from: '',
  to: '',
})
const filters = reactive(defaults())
const applied = ref(defaults())
const pendingFilters = computed(() => JSON.stringify(filters) !== JSON.stringify(applied.value))
const open = ref(false)
const id = ref<string>()
const mode = ref<'create' | 'edit' | 'view' | 'confirm' | 'cancel'>('view')
let sequence = 0
const columns = computed<TableColumnsType<Receipt>>(() =>
  [
    'code',
    'warehouse',
    'receiptDate',
    'supplierName',
    'totalAmount',
    'status',
    'createdAt',
    'actions',
  ].map((key) => ({
    title: t(`stock.${key}`),
    key,
    dataIndex: key,
    width: (
      {
        code: 210,
        warehouse: 180,
        receiptDate: 130,
        supplierName: 180,
        totalAmount: 210,
        status: 145,
        createdAt: 175,
        actions: compact.value ? 120 : 192,
      } as Record<string, number>
    )[key],
    ...(key === 'totalAmount' ? { align: 'right' as const } : {}),
    ...(key === 'actions' ? { fixed: 'right' as const } : {}),
  })),
)
const scrollWidth = computed(() =>
  columns.value.reduce((sum, column) => sum + Number(column.width ?? 0), 0),
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
}))
const warehouseName = (warehouseId: string): string =>
  warehouses.warehouses.find((item) => item.id === warehouseId)?.name ?? warehouseId
const appliedLabel = computed(() =>
  [
    `${t('stock.warehouse')}: ${applied.value.warehouseId ? warehouseName(applied.value.warehouseId) : t('stock.receiptAll')}`,
    `${t('stock.status')}: ${applied.value.status ? t(`stock.${applied.value.status}`) : t('stock.receiptAll')}`,
    ...(applied.value.from ? [`${t('stock.receiptFrom')}: ${applied.value.from}`] : []),
    ...(applied.value.to ? [`${t('stock.receiptTo')}: ${applied.value.to}`] : []),
  ].join(' · '),
)
const load = async (): Promise<void> => {
  const current = ++sequence
  rows.value = []
  total.value = 0
  error.value = ''
  loading.value = false
  if (!can('STOCK_RECEIPT_VIEW')) return
  loading.value = true
  const query = applied.value
  try {
    const result = await getReceipts({
      page: page.value,
      pageSize: pageSize.value,
      ...(query.warehouseId ? { warehouseId: query.warehouseId } : {}),
      ...(query.status ? { status: query.status } : {}),
      ...(query.from ? { from: query.from } : {}),
      ...(query.to ? { to: query.to } : {}),
    })
    if (current !== sequence) return
    rows.value = result.items
    total.value = result.total
    const lastPage = Math.max(1, Math.ceil(result.total / pageSize.value))
    if (!result.items.length && page.value > lastPage) {
      page.value = lastPage
      void load()
    }
  } catch (cause) {
    if (current === sequence) error.value = stockError(cause, t)
  } finally {
    if (current === sequence) loading.value = false
  }
}
const applyFilters = (): void => {
  rangeError.value = ''
  if (filters.from && filters.to && filters.from > filters.to) {
    rangeError.value = t('stock.invalidRange')
    expanded.value = true
    mobileOpen.value = true
    return
  }
  applied.value = { ...filters }
  page.value = 1
  void load()
}
const resetFilters = (): void => {
  Object.assign(filters, defaults())
  applyFilters()
}
// Draft fields never trigger requests. Context/auth changes remain independent.
watch(
  () => [
    warehouses.selectedId,
    auth.user?.id,
    auth.user?.permissions.join(','),
    auth.isCatalogAdmin,
  ],
  () => {
    if (!can('STOCK_RECEIPT_VIEW')) open.value = false
    filters.warehouseId = warehouses.selectedId
    applied.value = { ...applied.value, warehouseId: warehouses.selectedId }
    page.value = 1
    void load()
  },
  { immediate: true },
)
onBeforeUnmount(() => {
  ++sequence
  observer?.disconnect()
})
const show = (nextMode: typeof mode.value, receipt?: Receipt): void => {
  mode.value = nextMode
  id.value = receipt?.id
  open.value = true
}
const changePage = (next: number, size: number): void => {
  if (![10, 20, 50, 100].includes(size)) return
  page.value = size !== pageSize.value ? 1 : next
  pageSize.value = size
  void load()
}
</script>

<template>
  <a-config-provider :theme="{ token: { colorPrimary: '#7357cf', borderRadius: 8 } }">
    <section ref="root" class="receipts-page" :class="{ 'receipts-page--compact': compact }">
      <div class="receipt-controls">
        <header class="receipt-heading">
          <h1>{{ t('stock.receipts') }}</h1>
          <a-button v-if="can('STOCK_RECEIPT_CREATE')" type="primary" @click="show('create')">
            <template #icon><PlusOutlined aria-hidden="true" /></template>{{ t('stock.create') }}
          </a-button>
        </header>
        <a-alert
          v-if="!can('STOCK_RECEIPT_VIEW')"
          type="info"
          :message="t('stock.forbidden')"
          show-icon
        />
        <template v-else>
          <a-button
            class="receipt-mobile-toggle"
            :aria-expanded="mobileOpen"
            :aria-controls="filterId"
            @click="mobileOpen = !mobileOpen"
          >
            <FilterOutlined aria-hidden="true" />{{ t('stock.filters') }}
            <UpOutlined v-if="mobileOpen" aria-hidden="true" /><DownOutlined
              v-else
              aria-hidden="true"
            />
          </a-button>
          <form
            :id="filterId"
            class="receipt-filters"
            :class="{ 'is-mobile-open': mobileOpen, 'is-expanded': expanded }"
            @submit.prevent="applyFilters"
            @keydown.enter.prevent="applyFilters"
          >
            <div class="receipt-filter">
              <label :for="`${filterId}-warehouse`">{{ t('stock.warehouse') }}</label>
              <a-select
                :id="`${filterId}-warehouse`"
                v-model:value="filters.warehouseId"
                :options="warehouseOptions"
                :placeholder="t('stock.receiptAll')"
                allow-clear
              />
            </div>
            <div class="receipt-filter">
              <label :for="`${filterId}-status`">{{ t('stock.status') }}</label>
              <a-select
                :id="`${filterId}-status`"
                v-model:value="filters.status"
                :options="statusOptions"
                :placeholder="t('stock.receiptAll')"
                allow-clear
              />
            </div>
            <div class="receipt-filter-actions">
              <a-button type="primary" html-type="submit" :loading="loading">
                <template #icon><SearchOutlined aria-hidden="true" /></template
                >{{ t('common.search') }}
              </a-button>
              <a-button @click="resetFilters"
                ><template #icon><ReloadOutlined aria-hidden="true" /></template
                >{{ t('common.reset') }}</a-button
              >
              <a-button
                type="link"
                class="receipt-expand"
                :aria-expanded="expanded"
                :aria-controls="`${filterId}-dates`"
                @click="expanded = !expanded"
              >
                {{ t(expanded ? 'stock.collapseFilters' : 'stock.expandFilters') }}
                <UpOutlined v-if="expanded" aria-hidden="true" /><DownOutlined
                  v-else
                  aria-hidden="true"
                />
              </a-button>
            </div>
            <div :id="`${filterId}-dates`" class="receipt-filter-dates">
              <div class="receipt-filter">
                <label :for="`${filterId}-from`">{{ t('stock.receiptFrom') }}</label>
                <a-date-picker
                  :id="`${filterId}-from`"
                  v-model:value="filters.from"
                  value-format="YYYY-MM-DD"
                  format="DD/MM/YYYY"
                  :placeholder="t('stock.receiptChooseDate')"
                  :status="rangeError ? 'error' : undefined"
                  :aria-describedby="rangeError ? `${filterId}-error` : undefined"
                />
              </div>
              <div class="receipt-filter">
                <label :for="`${filterId}-to`">{{ t('stock.receiptTo') }}</label>
                <a-date-picker
                  :id="`${filterId}-to`"
                  v-model:value="filters.to"
                  value-format="YYYY-MM-DD"
                  format="DD/MM/YYYY"
                  :placeholder="t('stock.receiptChooseDate')"
                  :status="rangeError ? 'error' : undefined"
                  :aria-describedby="rangeError ? `${filterId}-error` : undefined"
                />
              </div>
              <p
                v-if="rangeError"
                :id="`${filterId}-error`"
                role="alert"
                class="receipt-range-error"
              >
                {{ rangeError }}
              </p>
            </div>
          </form>
          <p class="receipt-applied" aria-live="polite">
            <span>{{ t('stock.appliedFilters') }}: {{ appliedLabel }}</span>
            <span v-if="pendingFilters" class="receipt-pending">{{
              t('stock.pendingFilters')
            }}</span>
          </p>
        </template>
      </div>
      <a-alert v-if="error" type="error" :message="error" show-icon />
      <StocktakeTable
        v-if="can('STOCK_RECEIPT_VIEW')"
        class="receipt-list"
        :columns="columns"
        :rows="rows"
        :loading="loading"
        :pagination="pagination"
        :title="t('stock.receiptList')"
        :total-label="t('stock.listTotal', { total: formatStockInteger(total) })"
        :scroll-width="scrollWidth"
        :reset-key="`${page}-${pageSize}-${sequence}`"
        bounded
        @reload="load"
        @page-change="changePage"
      >
        <template #bodyCell="{ column, record }">
          <a-tooltip
            v-if="
              column.key === 'code' || column.key === 'warehouse' || column.key === 'supplierName'
            "
            :title="
              column.key === 'warehouse'
                ? warehouseName(record.warehouseId)
                : record[column.key] || '—'
            "
          >
            <span class="receipt-ellipsis" :class="{ 'receipt-code': column.key === 'code' }">{{
              column.key === 'warehouse'
                ? warehouseName(record.warehouseId)
                : record[column.key] || '—'
            }}</span>
          </a-tooltip>
          <span v-else-if="column.key === 'totalAmount'" class="receipt-number"
            >{{ formatStockInteger(record.totalAmount) }} ₫</span
          >
          <template v-else-if="column.key === 'createdAt'">{{
            formatDateTime(record.createdAt)
          }}</template>
          <template v-else-if="column.key === 'receiptDate'">{{
            formatDate(record.receiptDate)
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
          <div v-else-if="column.key === 'actions'" class="receipt-actions">
            <a-tooltip :title="t('stock.view')"
              ><a-button type="text" :aria-label="t('stock.view')" @click="show('view', record)"
                ><template #icon><EyeOutlined aria-hidden="true" /></template></a-button
            ></a-tooltip>
            <a-tooltip
              v-if="record.status === 'DRAFT' && can('STOCK_RECEIPT_UPDATE')"
              :title="t('stock.edit')"
              ><a-button type="text" :aria-label="t('stock.edit')" @click="show('edit', record)"
                ><template #icon><EditOutlined aria-hidden="true" /></template></a-button
            ></a-tooltip>
            <a-tooltip
              v-if="record.status === 'DRAFT' && can('STOCK_RECEIPT_CONFIRM')"
              :title="t('stock.confirm')"
              ><a-button
                type="text"
                :aria-label="t('stock.confirm')"
                @click="show('confirm', record)"
                ><template #icon><CheckOutlined aria-hidden="true" /></template></a-button
            ></a-tooltip>
            <a-tooltip
              v-if="record.status !== 'CANCELLED' && can('STOCK_RECEIPT_CANCEL')"
              :title="t('stock.cancel')"
              ><a-button
                type="text"
                danger
                :aria-label="t('stock.cancel')"
                @click="show('cancel', record)"
                ><template #icon><CloseCircleOutlined aria-hidden="true" /></template></a-button
            ></a-tooltip>
          </div>
        </template>
      </StocktakeTable>
      <ReceiptDialog :id="id" v-model:open="open" :mode="mode" @saved="load" />
    </section>
  </a-config-provider>
</template>

<style scoped>
.receipts-page {
  display: flex;
  flex: 1;
  flex-direction: column;
  gap: 12px;
  min-width: 0;
  min-height: 0;
}
.receipt-controls {
  flex-shrink: 0;
  padding: 20px;
  background: #fff;
  border: 1px solid #e9e4f1;
  border-radius: 12px;
}
.receipt-heading {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 12px;
  margin-bottom: 16px;
}
h1 {
  margin: 0;
  color: #302640;
  font-size: 24px;
  line-height: 32px;
  font-weight: 650;
}
.receipt-filters {
  display: grid;
  grid-template-columns: minmax(180px, 1.3fr) minmax(140px, 1fr) auto;
  gap: 12px;
  align-items: end;
}
.receipt-filter {
  display: flex;
  flex-direction: column;
  min-width: 0;
  gap: 6px;
  font-size: 13px;
  color: #625b70;
}
.receipt-filter :deep(.ant-select),
.receipt-filter :deep(.ant-picker) {
  width: 100%;
  min-width: 0;
}
.receipt-filter :deep(input) {
  min-width: 0;
}
.receipt-filter-actions {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
}
.receipt-filter-dates {
  display: none;
  grid-column: 1 / -1;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 12px;
  padding: 14px;
  border: 1px solid #eee6ff;
  border-radius: 8px;
  background: #f7f3ff;
}
.is-expanded .receipt-filter-dates {
  display: grid;
}
.receipt-mobile-toggle {
  display: none;
}
.receipt-range-error {
  grid-column: 1 / -1;
  margin: 0;
  color: #cf1322;
}
.receipt-applied {
  display: flex;
  flex-wrap: wrap;
  gap: 4px 12px;
  margin: 12px 0 0;
  color: #797184;
  font-size: 12px;
  overflow-wrap: anywhere;
}
.receipt-pending {
  color: #7357cf;
}
.receipt-ellipsis {
  display: block;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.receipt-code {
  color: #5a4578;
  font-weight: 500;
}
.receipt-number {
  white-space: nowrap;
  font-variant-numeric: tabular-nums;
}
.receipt-actions {
  display: flex;
  align-items: center;
  gap: 2px;
}
.receipt-actions :deep(.ant-btn:not(.ant-btn-dangerous)) {
  color: #7357cf;
}
.receipt-actions :deep(.ant-btn) {
  flex: 0 0 36px;
  width: 36px;
  height: 36px;
  padding: 0;
}
.receipts-page--compact .receipt-actions {
  flex-wrap: wrap;
}
.receipts-page--compact .receipt-actions :deep(.ant-btn) {
  flex-basis: 44px;
  width: 44px;
  height: 44px;
}
:global(.admin-layout:has(.receipts-page)) {
  height: 100vh;
  height: 100dvh;
  min-height: 0;
}
:global(.admin-layout:has(.receipts-page) > .admin-layout__main) {
  height: 100%;
  min-height: 0;
}
:global(.admin-layout:has(.receipts-page) .app-header) {
  flex-shrink: 0;
}
:global(.admin-layout__content:has(.receipts-page)) {
  display: flex;
  flex-direction: column;
  min-height: 0;
  margin: 0;
  padding: 20px 24px;
  background: #f5f3fa;
  border-radius: 0;
}
@container workspace (max-width: 900px) {
  .receipt-filters {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
  .receipt-filter-actions {
    grid-column: 1 / -1;
  }
}
@container workspace (max-width: 600px) {
  .receipt-controls {
    padding: 12px;
  }
  .receipt-heading {
    flex-wrap: wrap;
    gap: 8px;
  }
  h1 {
    font-size: 20px;
    line-height: 28px;
  }
  .receipt-heading :deep(.ant-btn) {
    min-height: 44px;
  }
  .receipt-mobile-toggle {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 8px;
    width: 100%;
    min-height: 44px;
    border-color: #a88be5;
    color: #7357cf;
    background: #faf7ff;
  }
  .receipt-filters {
    display: none;
    grid-template-columns: minmax(0, 1fr);
    margin-top: 14px;
  }
  .receipt-filters.is-mobile-open {
    display: grid;
  }
  .receipt-filter-dates,
  .is-expanded .receipt-filter-dates {
    display: grid;
    grid-template-columns: minmax(0, 1fr);
    padding: 0;
    border: 0;
    background: none;
  }
  .receipt-expand {
    display: none;
  }
  .receipt-filter-actions {
    grid-row: 4;
    flex-direction: row-reverse;
  }
  .receipt-filter-actions :deep(.ant-btn) {
    flex: 1;
    min-height: 44px;
  }
  .receipt-filter :deep(.ant-select-selector),
  .receipt-filter :deep(.ant-picker) {
    min-height: 44px;
  }
}
@media (max-width: 767px), (max-height: 650px) {
  :global(.admin-layout__content:has(.receipts-page)) {
    padding: 12px;
  }
}
</style>
