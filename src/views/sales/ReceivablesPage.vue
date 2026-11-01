<script setup lang="ts">
import { computed, reactive, ref, watch, onBeforeUnmount } from 'vue'
import {
  EyeOutlined,
  SearchOutlined,
  ReloadOutlined,
  DownOutlined,
  UpOutlined,
  FilterOutlined,
} from '@ant-design/icons-vue'
import type { TableColumnsType } from 'ant-design-vue'
import PendingPaymentRetries from '@/components/sales/PendingPaymentRetries.vue'
import FittedListTable from '@/components/catalog/FittedListTable.vue'
import ReceivableOrders from '@/components/sales/ReceivableOrders.vue'
import CustomerReceivablesDialog from '@/components/sales/CustomerReceivablesDialog.vue'
import { getReceivables, getWalkInOrders } from '@/api/payments/payments.api'
import { usePaymentScope } from '@/composables/usePaymentScope'
import { usePaymentsStore } from '@/stores/payments'
import { paymentError } from '@/utils/payments'
import { formatStockInteger } from '@/utils/stock'
import type { Receivable } from '@/types/payments'
import type { SalesOrder } from '@/types/sales'
import type { NormalizedApiError } from '@/utils/request'
const props = defineProps<{ initialWarehouseId?: string }>()
const { can, warehouses, inScope, contextKey, refreshAccess } = usePaymentScope()
const payments = usePaymentsStore()
const tab = ref<'customers' | 'walk-in'>('customers')
const defaults = () => ({ warehouseId: warehouses.selectedId, keyword: '', customerId: '' })
const states = reactive({
  customers: { filters: defaults(), applied: defaults(), page: 1, pageSize: 10 },
  'walk-in': { filters: defaults(), applied: defaults(), page: 1, pageSize: 10 },
})
const filters = computed(() => states[tab.value].filters)
const page = computed({
  get: () => states[tab.value].page,
  set: (value) => {
    states[tab.value].page = value
  },
})
const pageSize = computed({
  get: () => states[tab.value].pageSize,
  set: (value) => {
    states[tab.value].pageSize = value
  },
})
const rows = ref<Receivable[]>([])
const orders = ref<SalesOrder[]>([])
const total = ref(0)
const loading = ref(false)
const error = ref('')
const expanded = ref(false)
const mobileFiltersOpen = ref(false)
const customerId = ref<string>()
const customerName = ref<string>()
const open = ref(false)
let sequence = 0
const warehouseOptions = computed(() =>
  warehouses.warehouses.map((item) => ({ value: item.id, label: item.code + ' — ' + item.name })),
)
const warehouseName = (id: string): string =>
  warehouses.warehouses.find((item) => item.id === id)?.name ?? id
const columns: TableColumnsType<Receivable> = [
  { key: 'warehouseId', dataIndex: 'warehouseId', title: 'Kho', width: 190 },
  { key: 'customerCode', dataIndex: 'customerCode', title: 'Mã khách', width: 180 },
  { key: 'customerName', dataIndex: 'customerName', title: 'Tên khách', width: 180 },
  {
    key: 'outstandingOrderCount',
    dataIndex: 'outstandingOrderCount',
    title: 'Số đơn còn nợ',
    width: 130,
    align: 'right',
  },
  {
    key: 'totalAmount',
    dataIndex: 'totalAmount',
    title: 'Giá trị các đơn còn nợ',
    width: 220,
    align: 'right',
  },
  {
    key: 'paidAmount',
    dataIndex: 'paidAmount',
    title: 'Đã thu trên các đơn còn nợ',
    width: 220,
    align: 'right',
  },
  {
    key: 'remainingAmount',
    dataIndex: 'remainingAmount',
    title: 'Còn nợ',
    width: 220,
    align: 'right',
  },
  { key: 'actions', title: 'Thao tác', width: 90, fixed: 'right', align: 'center' },
]
const rangeLabel = computed(
  () =>
    `Hiển thị ${rows.value.length ? (page.value - 1) * pageSize.value + 1 : 0}–${rows.value.length ? (page.value - 1) * pageSize.value + rows.value.length : 0} / ${total.value} khách hàng`,
)
const load = async (): Promise<void> => {
  const current = ++sequence
  rows.value = []
  orders.value = []
  total.value = 0
  error.value = ''
  loading.value = false
  const applied = states[tab.value].applied
  if (
    !can('RECEIVABLE_VIEW') ||
    !warehouses.warehouses.length ||
    (applied.warehouseId && !inScope(applied.warehouseId))
  )
    return
  loading.value = true
  try {
    const paging = {
      page: page.value,
      pageSize: pageSize.value,
      ...(applied.warehouseId ? { warehouseId: applied.warehouseId } : {}),
    }
    if (tab.value === 'customers') {
      const result = await getReceivables({
        ...paging,
        ...(applied.keyword ? { keyword: applied.keyword } : {}),
      })
      if (current !== sequence) return
      rows.value = result.items.filter((item) => inScope(item.warehouseId))
      total.value = result.total
    } else {
      const result = await getWalkInOrders(paging)
      if (current !== sequence) return
      orders.value = result.items.filter((item) => inScope(item.warehouseId))
      payments.syncOrders(orders.value)
      total.value = result.total
    }
  } catch (cause) {
    if (current !== sequence) return
    error.value = paymentError(cause)
    mobileFiltersOpen.value = true
    if ((cause as NormalizedApiError).status === 403) await refreshAccess(cause)
  } finally {
    if (current === sequence) loading.value = false
  }
}
const submitFilters = (): void => {
  states[tab.value].applied = { ...filters.value }
  page.value = 1
  void load()
}
const resetFilters = (): void => {
  Object.assign(filters.value, defaults())
  submitFilters()
}
// Batch tab/access/payment invalidation. Draft inputs and layout toggles never fetch.
watch(
  () => [tab.value, contextKey.value, payments.revision],
  (value, previous) => {
    if (!previous || value[1] !== previous[1]) {
      open.value = false
      customerId.value = undefined
      customerName.value = undefined
      for (const state of Object.values(states)) {
        state.filters = defaults()
        state.applied = defaults()
        // Only seed the initial visit from the report. Later context changes
        // retain the existing working-warehouse behavior and scope checks.
        if (!previous && props.initialWarehouseId !== undefined) {
          state.filters.warehouseId = props.initialWarehouseId || undefined
          state.applied.warehouseId = props.initialWarehouseId || undefined
        }
        state.page = 1
      }
    }
    void load()
  },
  { immediate: true },
)
onBeforeUnmount(() => ++sequence)
const changePage = (next: number, size: number): void => {
  page.value = size !== pageSize.value ? 1 : next
  pageSize.value = size
  void load()
}
const showCustomer = (id: string, name?: string): void => {
  customerId.value = id
  customerName.value = name
  open.value = true
}
</script>

<template>
  <a-config-provider
    :theme="{ token: { colorPrimary: '#7357cf', colorLink: '#7357cf', borderRadius: 8 } }"
  >
    <section class="receivables-page">
      <PendingPaymentRetries class="receivables-retries" />
      <header class="receivables-heading">
        <h1>{{ $t('sales.receivables') }}</h1>
        <p>Công nợ hiện tại chỉ bao gồm các đơn còn nợ.</p>
      </header>
      <a-alert v-if="error" type="error" :message="error" show-icon />
      <a-alert
        v-if="!can('RECEIVABLE_VIEW')"
        type="warning"
        message="Thiếu RECEIVABLE_VIEW để xem công nợ."
      />
      <template v-else>
        <a-alert
          v-if="!warehouses.warehouses.length"
          type="info"
          message="Không có kho trong phạm vi được phép. Tải lại kho trên thanh công cụ."
        />
        <a-tabs v-model:active-key="tab" class="receivables-tabs">
          <a-tab-pane key="customers" tab="Công nợ khách hàng" />
          <a-tab-pane key="walk-in" tab="Đơn khách lẻ chưa thanh toán" />
        </a-tabs>
        <div
          class="receivables-filters"
          :class="{ 'is-mobile-open': mobileFiltersOpen, 'is-expanded': expanded }"
        >
          <a-button
            class="mobile-filter-toggle"
            aria-label="Bộ lọc"
            :aria-expanded="mobileFiltersOpen"
            aria-controls="receivables-filter-fields"
            @click="mobileFiltersOpen = !mobileFiltersOpen"
          >
            <FilterOutlined /> Bộ lọc <UpOutlined v-if="mobileFiltersOpen" /><DownOutlined v-else />
          </a-button>
          <form
            id="receivables-filter-fields"
            class="receivables-filter-fields"
            @submit.prevent="submitFilters"
          >
            <a-select
              v-model:value="filters.warehouseId"
              class="warehouse-filter"
              :options="warehouseOptions"
              placeholder="Tất cả kho được giao"
              aria-label="Kho"
              allow-clear
            />
            <a-input
              v-if="tab === 'customers'"
              v-model:value="filters.keyword"
              class="keyword-filter"
              placeholder="Mã / tên / số điện thoại khách"
              aria-label="Mã / tên / số điện thoại khách"
              allow-clear
            >
              <template #prefix><SearchOutlined /></template>
            </a-input>
            <div class="filter-actions">
              <a-button type="primary" html-type="submit" :loading="loading" aria-label="Tìm kiếm"
                ><template #icon><SearchOutlined /></template>Tìm kiếm</a-button
              >
              <a-button class="filter-reset" aria-label="Đặt lại" @click="resetFilters"
                ><template #icon><ReloadOutlined /></template>Đặt lại</a-button
              >
              <a-button
                v-if="tab === 'customers'"
                class="desktop-filter-toggle"
                :aria-label="expanded ? 'Thu gọn' : 'Mở rộng'"
                :aria-expanded="expanded"
                aria-controls="receivables-uuid-fields"
                @click="expanded = !expanded"
              >
                {{ expanded ? 'Thu gọn' : 'Mở rộng' }} <UpOutlined v-if="expanded" /><DownOutlined
                  v-else
                />
              </a-button>
            </div>
            <div v-if="tab === 'customers'" id="receivables-uuid-fields" class="uuid-filters">
              <a-input
                v-model:value="filters.customerId"
                placeholder="UUID khách"
                aria-label="UUID khách"
                allow-clear
                @press-enter.stop.prevent="filters.customerId && showCustomer(filters.customerId)"
              />
              <a-button :disabled="!filters.customerId" @click="showCustomer(filters.customerId)"
                >Xem công nợ theo UUID</a-button
              >
            </div>
          </form>
        </div>
        <FittedListTable
          v-if="tab === 'customers'"
          class="receivables-table"
          :columns="columns"
          :rows="rows"
          :row-key="(row) => row.warehouseId + ':' + row.customerId"
          :total="total"
          :page="page"
          :page-size="pageSize"
          :reset-key="0"
          :row-height="54"
          :loading="loading"
          :error="error"
          list-title="Danh sách công nợ khách hàng"
          total-label=""
          :range-label="rangeLabel"
          @reload="load"
          @page-change="changePage"
        >
          <template #bodyCell="{ column, record }">
            <a-tooltip
              v-if="['warehouseId', 'customerCode', 'customerName'].includes(String(column.key))"
              :title="
                column.key === 'warehouseId'
                  ? warehouseName(record.warehouseId)
                  : record[column.key]
              "
            >
              <span class="receivable-ellipsis">{{
                column.key === 'warehouseId'
                  ? warehouseName(record.warehouseId)
                  : record[column.key]
              }}</span>
            </a-tooltip>
            <span
              v-else-if="
                ['totalAmount', 'paidAmount', 'remainingAmount'].includes(String(column.key))
              "
              class="receivable-money"
              :class="{ 'receivable-outstanding': column.key === 'remainingAmount' }"
              >{{ formatStockInteger(record[column.key]) }} VND</span
            >
            <a-tooltip v-else-if="column.key === 'actions'" title="Chi tiết công nợ">
              <a-button
                class="receivable-action"
                aria-label="Chi tiết công nợ"
                @click="showCustomer(record.customerId, record.customerName)"
                ><template #icon><EyeOutlined /></template
              ></a-button>
            </a-tooltip>
          </template>
        </FittedListTable>
        <ReceivableOrders
          v-else
          :rows="orders"
          :loading="loading"
          :error="error"
          :page="page"
          :page-size="pageSize"
          :total="total"
          list-title="Đơn khách lẻ chưa thanh toán"
          @reload="load"
          @page-change="changePage"
        />
      </template>
      <CustomerReceivablesDialog
        v-model:open="open"
        :customer-id="customerId"
        :customer-name="customerName"
        @reload="load"
      />
    </section>
  </a-config-provider>
</template>

<style scoped>
.receivables-page {
  display: flex;
  flex: 1;
  flex-direction: column;
  gap: 16px;
  min-height: 0;
  min-width: 0;
}
.receivables-page > :not(.receivables-table) {
  flex-shrink: 0;
}
.receivables-page > :deep(.receivable-orders) {
  flex: 1;
  flex-shrink: 1;
}
.receivables-heading h1 {
  margin: 0;
  color: #302640;
  font-size: 24px;
  line-height: 32px;
  font-weight: 650;
}
.receivables-heading p {
  margin: 4px 0 0;
  color: #797184;
  line-height: 20px;
}
.receivables-retries {
  max-height: 25dvh;
  overflow: auto;
}
.receivables-tabs :deep(.ant-tabs-nav) {
  margin: 0;
}
.receivables-filter-fields {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 12px;
  min-width: 0;
}
.warehouse-filter {
  width: 250px;
  max-width: 100%;
}
.keyword-filter {
  flex: 1 1 260px;
  max-width: 380px;
  min-width: 0;
}
.filter-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
}
.mobile-filter-toggle {
  display: none;
}
.uuid-filters {
  display: none;
  flex-basis: 100%;
  align-items: center;
  gap: 16px;
  padding: 16px;
  background: #f5f0fc;
  border: 1px solid #eae2f5;
  border-radius: 10px;
  min-width: 0;
}
.is-expanded .uuid-filters {
  display: flex;
}
.uuid-filters > .ant-input-affix-wrapper {
  flex: 1;
  min-width: 0;
}
.uuid-filters > .ant-btn {
  min-width: 220px;
}
:global(body:has(.receivables-page)) {
  min-width: 0;
}
:global(.admin-layout:has(.receivables-page)) {
  height: 100dvh;
  min-height: 0;
}
:global(.admin-layout:has(.receivables-page) > .admin-layout__main) {
  height: 100%;
  min-height: 0;
}
:global(.admin-layout:has(.receivables-page) .app-header) {
  flex-shrink: 0;
}
:global(.admin-layout__content:has(.receivables-page)) {
  display: flex;
  flex: 1;
  flex-direction: column;
  min-height: 0;
  margin: 0;
  padding: 20px 24px;
  background: #f5f3fa;
  border-radius: 0;
}
@media (max-width: 767px), (max-height: 650px) {
  :global(.admin-layout__content:has(.receivables-page)) {
    padding: 12px;
  }
}
@media (max-width: 767px) {
  .receivables-page {
    gap: 12px;
  }
  .receivables-tabs :deep(.ant-tabs-tab) {
    font-size: 12px;
  }
  .receivables-tabs :deep(.ant-tabs-tab + .ant-tabs-tab) {
    margin-left: 16px;
  }
  .mobile-filter-toggle {
    display: flex;
    justify-content: center;
    align-items: center;
    gap: 10px;
    width: 100%;
    min-height: 44px;
    color: #7357cf;
    border-color: #bda9ec;
  }
  .receivables-filter-fields {
    display: none;
  }
  .is-mobile-open .receivables-filter-fields {
    display: flex;
    flex-direction: column;
    align-items: stretch;
    gap: 10px;
    margin-top: 10px;
  }
  .warehouse-filter,
  .keyword-filter {
    width: 100%;
    max-width: none;
    flex: none;
  }
  .uuid-filters,
  .is-expanded .uuid-filters {
    display: flex;
    flex-direction: column;
    align-items: stretch;
    flex-basis: auto;
    padding: 0;
    border: 0;
    background: transparent;
    gap: 10px;
  }
  .uuid-filters > * {
    width: 100%;
    min-width: 0;
  }
  .filter-actions {
    order: 1;
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
  .filter-reset {
    order: -1;
  }
  .filter-actions .desktop-filter-toggle {
    display: none;
  }
  .receivables-filters :deep(.ant-btn),
  .receivables-filters :deep(.ant-input-affix-wrapper),
  .receivables-filters :deep(.ant-select-selector) {
    min-height: 44px;
  }
}
</style>

<style>
.receivables-table,
.receivable-orders {
  min-width: 0;
}
.receivable-ellipsis {
  display: block;
  max-width: 100%;
  overflow: hidden;
  white-space: nowrap;
  text-overflow: ellipsis;
}
.receivable-money {
  font-variant-numeric: tabular-nums;
  white-space: nowrap;
}
.receivable-outstanding {
  color: #7357cf;
  font-weight: 650;
}
.receivable-action.ant-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 34px;
  height: 34px;
  padding: 0;
  border-radius: 8px;
  color: #7357cf;
  border-color: #e4daf7;
}
.receivable-action.ant-btn:focus-visible {
  outline: 2px solid #7357cf;
  outline-offset: 2px;
}
@media (max-width: 767px) {
  .receivable-action.ant-btn {
    width: 44px;
    height: 44px;
  }
  .receivables-table .products-toolbar .ant-btn,
  .receivable-orders .products-toolbar .ant-btn {
    width: 44px;
    height: 44px;
    flex-shrink: 0;
  }
}
</style>
