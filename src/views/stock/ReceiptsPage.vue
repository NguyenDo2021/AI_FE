<script setup lang="ts">
import { computed, onBeforeUnmount, reactive, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import type { TableColumnsType } from 'ant-design-vue'
import { EyeOutlined, MoreOutlined, PlusOutlined, ReloadOutlined } from '@ant-design/icons-vue'
import FittedListTable from '@/components/catalog/FittedListTable.vue'
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
const rows = ref<Receipt[]>([])
const page = ref(1)
const pageSize = ref(10)
const total = ref(0)
const loading = ref(false)
const error = ref('')
const scrollRevision = ref(0)
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
const columns = computed<TableColumnsType<Receipt>>(() => [
  { title: t('stock.code'), key: 'code', dataIndex: 'code', width: 210 },
  { title: t('stock.warehouse'), key: 'warehouse', width: 190 },
  { title: t('stock.receiptDate'), key: 'receiptDate', width: 130 },
  { title: t('stock.supplierName'), key: 'supplierName', width: 210 },
  { title: t('stock.totalAmount'), key: 'totalAmount', width: 240, align: 'right' },
  { title: t('stock.status'), key: 'status', width: 154 },
  { title: t('stock.createdAt'), key: 'createdAt', width: 180 },
  { title: t('stock.actions'), key: 'actions', width: 84, align: 'center', fixed: 'right' },
])
const statusOptions = computed(() =>
  (['DRAFT', 'CONFIRMED', 'CANCELLED'] as const).map((status) => ({
    value: status,
    label: t(`stock.${status}`),
  })),
)
const warehouseOptions = computed(() =>
  warehouses.warehouses.map((item) => ({ value: item.id, label: `${item.code} - ${item.name}` })),
)
const rangeLabel = computed(() => {
  const from = rows.value.length ? (page.value - 1) * pageSize.value + 1 : 0
  const to = rows.value.length ? Math.min(from + rows.value.length - 1, total.value) : 0
  return `Hiển thị ${from}–${to} / ${total.value} phiếu nhập`
})
const warehouseName = (warehouseId: string): string =>
  warehouses.warehouses.find((item) => item.id === warehouseId)?.name ?? warehouseId
const hasMoreActions = (receipt: Receipt): boolean =>
  (receipt.status === 'DRAFT' && (can('STOCK_RECEIPT_UPDATE') || can('STOCK_RECEIPT_CONFIRM'))) ||
  (receipt.status !== 'CANCELLED' && can('STOCK_RECEIPT_CANCEL'))
const load = async (): Promise<void> => {
  const current = ++sequence
  ++scrollRevision.value
  rows.value = []
  total.value = 0
  error.value = ''
  loading.value = false
  if (!can('STOCK_RECEIPT_VIEW')) return
  if (filters.from && filters.to && filters.from > filters.to) {
    error.value = t('stock.invalidRange')
    return
  }
  loading.value = true
  try {
    const result = await getReceipts({
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
    if (current === sequence) error.value = stockError(cause, t)
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
  () => [auth.user?.id, auth.user?.permissions.join(','), auth.isCatalogAdmin],
  () => {
    if (!can('STOCK_RECEIPT_VIEW')) open.value = false
    resetPage()
  },
  { immediate: true },
)
onBeforeUnmount(() => ++sequence)
const show = (nextMode: typeof mode.value, receipt?: Receipt): void => {
  mode.value = nextMode
  id.value = receipt?.id
  open.value = true
}
const changePage = (next: number, size: number): void => {
  if (![10, 20, 50, 100].includes(size)) return
  const target = size !== pageSize.value ? 1 : next
  if (target === page.value && size === pageSize.value) return
  page.value = target
  pageSize.value = size
  void load()
}
</script>
<template>
  <a-config-provider :theme="{ token: { colorPrimary: '#7357cf', borderRadius: 8 } }">
    <section class="receipts-page">
      <div class="receipt-heading">
        <div>
          <h1>{{ t('stock.receipts') }}</h1>
          <p>Theo dõi và quản lý các lần nhập hàng vào kho.</p>
        </div>
        <a-button v-if="can('STOCK_RECEIPT_CREATE')" type="primary" @click="show('create')">
          <template #icon><PlusOutlined aria-hidden="true" /></template>
          {{ t('stock.create') }}
        </a-button>
      </div>
      <a-alert v-if="error" type="error" :message="error" show-icon />
      <a-alert v-if="!can('STOCK_RECEIPT_VIEW')" type="info" :message="t('stock.forbidden')" />
      <template v-else>
        <div class="receipt-filters">
          <div class="receipt-filter receipt-filter-warehouse">
            <label for="receipt-filter-warehouse">{{ t('stock.warehouse') }}</label>
            <a-select
              id="receipt-filter-warehouse"
              v-model:value="filters.warehouseId"
              :options="warehouseOptions"
              :placeholder="t('stock.warehouse')"
              allow-clear
            />
          </div>
          <div class="receipt-filter">
            <label for="receipt-filter-status">{{ t('stock.status') }}</label>
            <a-select
              id="receipt-filter-status"
              v-model:value="filters.status"
              :options="statusOptions"
              :placeholder="t('stock.status')"
              allow-clear
            />
          </div>
          <div class="receipt-filter">
            <label for="receipt-filter-from">{{ t('stock.from') }}</label>
            <a-date-picker
              id="receipt-filter-from"
              v-model:value="filters.from"
              value-format="YYYY-MM-DD"
              format="DD/MM/YYYY"
              :placeholder="t('stock.from')"
            />
          </div>
          <div class="receipt-filter">
            <label for="receipt-filter-to">{{ t('stock.toInclusive') }}</label>
            <a-date-picker
              id="receipt-filter-to"
              v-model:value="filters.to"
              value-format="YYYY-MM-DD"
              format="DD/MM/YYYY"
              :placeholder="t('stock.toInclusive')"
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
            <template #icon><ReloadOutlined aria-hidden="true" /></template>
            {{ t('common.reset') }}
          </a-button>
        </div>
        <FittedListTable
          class="receipts-panel"
          :columns="columns"
          :rows="rows"
          :loading="loading"
          :error="error"
          :total="total"
          :page="page"
          :page-size="pageSize"
          :reset-key="scrollRevision"
          list-title="Danh sách phiếu nhập"
          :total-label="`${total} phiếu nhập`"
          :range-label="rangeLabel"
          @reload="load"
          @page-change="changePage"
        >
          <template #bodyCell="{ column, record }">
            <a-tooltip v-if="column.key === 'code'" :title="record.code">
              <a-button type="link" class="receipt-code" @click="show('view', record)"
                ><span class="receipt-code-text">{{ record.code }}</span></a-button
              >
            </a-tooltip>
            <a-tooltip
              v-else-if="column.key === 'warehouse'"
              :title="warehouseName(record.warehouseId)"
            >
              <span class="receipt-text">{{ warehouseName(record.warehouseId) }}</span>
            </a-tooltip>
            <span v-else-if="column.key === 'receiptDate'" class="receipt-date">{{
              formatDate(record.receiptDate)
            }}</span>
            <span v-else-if="column.key === 'totalAmount'" class="receipt-money"
              >{{ formatStockInteger(record.totalAmount) }} ₫</span
            >
            <span v-else-if="column.key === 'createdAt'" class="receipt-date">{{
              formatDateTime(record.createdAt)
            }}</span>
            <a-tag
              v-else-if="column.key === 'status'"
              :color="
                record.status === 'CONFIRMED'
                  ? 'success'
                  : record.status === 'CANCELLED'
                    ? 'error'
                    : 'default'
              "
            >
              {{ t(`stock.${record.status}`) }}
            </a-tag>
            <div v-else-if="column.key === 'actions'" class="receipt-actions">
              <a-tooltip :title="t('stock.view')">
                <a-button type="text" :aria-label="t('stock.view')" @click="show('view', record)">
                  <template #icon><EyeOutlined aria-hidden="true" /></template>
                </a-button>
              </a-tooltip>
              <a-dropdown v-if="hasMoreActions(record)" :trigger="['click']">
                <a-button type="text" :aria-label="t('stock.actions')">
                  <template #icon><MoreOutlined aria-hidden="true" /></template>
                </a-button>
                <template #overlay>
                  <a-menu>
                    <a-menu-item
                      v-if="record.status === 'DRAFT' && can('STOCK_RECEIPT_UPDATE')"
                      key="edit"
                      @click="show('edit', record)"
                      >{{ t('stock.edit') }}</a-menu-item
                    >
                    <a-menu-item
                      v-if="record.status === 'DRAFT' && can('STOCK_RECEIPT_CONFIRM')"
                      key="confirm"
                      @click="show('confirm', record)"
                      >{{ t('stock.confirm') }}</a-menu-item
                    >
                    <a-menu-item
                      v-if="record.status !== 'CANCELLED' && can('STOCK_RECEIPT_CANCEL')"
                      key="cancel"
                      danger
                      @click="show('cancel', record)"
                      >{{ t('stock.cancel') }}</a-menu-item
                    >
                  </a-menu>
                </template>
              </a-dropdown>
            </div>
            <a-tooltip
              v-else-if="column.key === 'supplierName'"
              :title="record.supplierName || '—'"
            >
              <span class="receipt-text">{{ record.supplierName || '—' }}</span>
            </a-tooltip>
          </template>
        </FittedListTable>
      </template>
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
  min-height: 0;
  min-width: 0;
}
.receipt-heading,
.receipt-filters,
.receipts-page > .ant-alert {
  flex-shrink: 0;
}
.receipt-heading {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}
.receipt-heading h1 {
  margin: 0;
  color: #302640;
  font-size: 24px;
  line-height: 32px;
  font-weight: 650;
}
.receipt-heading p {
  margin: 4px 0 0;
  color: #797184;
  font-size: 14px;
  line-height: 20px;
}
.receipt-filters {
  display: grid;
  grid-template-columns:
    minmax(180px, 1.4fr) minmax(160px, 1fr) minmax(180px, 1fr) minmax(180px, 1fr)
    auto;
  align-items: end;
  gap: 10px;
  padding: 14px 16px;
  border: 1px solid #e9e4f1;
  border-radius: 12px;
  background: #fff;
}
.receipt-filter {
  display: flex;
  flex-direction: column;
  gap: 6px;
  min-width: 0;
}
.receipt-filter label {
  color: #757080;
  font-size: 13px;
}
.receipt-filter :deep(.ant-select),
.receipt-filter :deep(.ant-picker) {
  width: 100%;
  min-width: 0;
}
.receipt-text {
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
  overflow-wrap: anywhere;
  max-height: 40px;
}
.receipt-code {
  display: block;
  max-width: 210px;
  width: 100%;
  height: auto;
  padding: 0;
  text-align: left;
  white-space: nowrap;
  text-overflow: ellipsis;
  overflow: hidden;
  font-variant-numeric: tabular-nums;
}
.receipt-code-text {
  display: block;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.receipt-money {
  white-space: nowrap;
  font-weight: 600;
  font-variant-numeric: tabular-nums;
  overflow-wrap: anywhere;
}
.receipt-date {
  white-space: nowrap;
  font-variant-numeric: tabular-nums;
  font-size: 13px;
}
.receipts-panel :deep(.ant-table-cell-fix-right) {
  padding-inline: 8px;
}
.receipt-actions {
  display: flex;
  justify-content: center;
  align-items: center;
  gap: 2px;
  white-space: nowrap;
}
.receipt-actions :deep(.ant-btn) {
  width: 28px;
  min-width: 28px;
  padding: 0;
}
@media (max-height: 650px) {
  .receipts-panel {
    min-height: 240px;
  }
}
@container workspace (max-width: 1100px) {
  .receipt-filters {
    grid-template-columns: repeat(2, minmax(180px, 1fr));
  }
}
@container workspace (max-width: 500px) {
  .receipt-heading {
    align-items: flex-start;
    flex-wrap: wrap;
  }
  .receipt-heading > div {
    flex-basis: 100%;
  }
  .receipt-filters {
    grid-template-columns: minmax(0, 1fr);
    padding: 12px;
  }
}
</style>
<style>
/* Bound only the receipt route; keep the shared layout and other modules intact. */
.admin-layout:has(.receipts-page) {
  height: 100dvh;
  min-height: 0;
}
.admin-layout:has(.receipts-page) .admin-layout__main {
  height: 100%;
  min-height: 0;
}
.admin-layout:has(.receipts-page) .app-header {
  flex-shrink: 0;
}
.admin-layout__content:has(.receipts-page) {
  display: flex;
  flex-direction: column;
  flex: 1;
  min-height: 0;
  margin: 0;
  padding: 20px 24px;
  background: #f5f3fa;
  border-radius: 0;
}
@media (max-width: 767px), (max-height: 650px) {
  .admin-layout__content:has(.receipts-page) {
    padding: 12px;
  }
}
</style>
