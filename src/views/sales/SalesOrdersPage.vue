<script setup lang="ts">
import PendingPaymentRetries from '@/components/sales/PendingPaymentRetries.vue'
import { computed, onBeforeUnmount, reactive, ref, watch } from 'vue'
import FittedListTable from '@/components/catalog/FittedListTable.vue'
import { useI18n } from 'vue-i18n'
import type { TableColumnsType } from 'ant-design-vue'
import { PlusOutlined, ReloadOutlined, EyeOutlined, MoreOutlined } from '@ant-design/icons-vue'
import { formatDate } from '@/utils/date'
import SalesOrderDialog from '@/components/sales/SalesOrderDialog.vue'
import CustomerSelect from '@/components/sales/CustomerSelect.vue'
import CollectPaymentDialog from '@/components/sales/CollectPaymentDialog.vue'
import { canCollect, paymentLabel, applyPaymentSummary } from '@/utils/payments'
import { usePaymentsStore } from '@/stores/payments'
import { getSalesOrders, getCustomer } from '@/api/sales/sales.api'
import { useSalesScope } from '@/composables/useSalesScope'
import { salesCustomerName, salesError } from '@/utils/sales'
import { formatStockInteger } from '@/utils/stock'
import type { SalesOrder, Customer } from '@/types/sales'
import type { ReceiptStatus } from '@/types/stock'
const { can, warehouses, scopeKey, inScope, refreshScope } = useSalesScope()
const payments = usePaymentsStore()
const { t } = useI18n()
const scrollRevision = ref(0)
const collectOrder = ref<SalesOrder>()
const collectOpen = ref(false)
const rows = ref<SalesOrder[]>([])
const customers = ref<Customer[]>([])
const page = ref(1)
const pageSize = ref(10)
const total = ref(0)
const loading = ref(false)
const error = ref('')
const filters = reactive({
  warehouseId: warehouses.selectedId,
  customerId: undefined as string | undefined,
  status: undefined as ReceiptStatus | undefined,
  from: '',
  to: '',
})
const open = ref(false)
const id = ref<string>()
const mode = ref<'create' | 'edit' | 'view' | 'confirm' | 'cancel'>('view')
let sequence = 0
const moneyKeys = [
  'subtotal',
  'discountAmount',
  'totalAmount',
  'returnedAmount',
  'adjustedTotalAmount',
  'refundedAmount',
  'netPaidAmount',
  'refundableAmount',
  'paidAmount',
  'remainingAmount',
] as const
const columns: TableColumnsType<SalesOrder> = [
  { key: 'code', dataIndex: 'code', title: 'Mã đơn', width: 224 },
  { key: 'warehouse', title: 'Kho', width: 240 },
  { key: 'customer', title: 'Khách', width: 240 },
  { key: 'saleDate', dataIndex: 'saleDate', title: 'Ngày bán', width: 132 },
  ...moneyKeys.map((key, index) => ({
    key,
    dataIndex: key,
    title:
      [
        'Tạm tính',
        'Giảm giá',
        'Tổng tiền',
        'Giá trị hàng trả',
        'Tổng sau trả',
        'Đã hoàn',
        'Thu ròng',
        'Còn cần hoàn',
        'Đã thu',
        'Còn phải trả',
      ][index] + ' (VND)',
    width: 224,
    align: 'right' as const,
  })),
  { key: 'paymentStatus', title: 'Thanh toán', width: 212 },
  { key: 'status', title: 'Trạng thái', width: 244 },
  { key: 'actions', title: 'Thao tác', width: 120, fixed: 'right' },
]
const warehouseName = (warehouseId: string): string =>
  warehouses.warehouses.find((item) => item.id === warehouseId)?.name ?? warehouseId
const warehouseOptions = computed(() =>
  warehouses.warehouses.map((item) => ({ value: item.id, label: item.code + ' — ' + item.name })),
)
const rangeLabel = computed(() =>
  t('sales.orderRange', {
    from: rows.value.length ? (page.value - 1) * pageSize.value + 1 : 0,
    to: rows.value.length
      ? Math.min((page.value - 1) * pageSize.value + rows.value.length, total.value)
      : 0,
    total: total.value,
  }),
)
const load = async (): Promise<void> => {
  const current = ++sequence
  ++scrollRevision.value
  rows.value = []
  customers.value = []
  total.value = 0
  error.value = ''
  loading.value = false
  if (
    !can('SALES_ORDER_VIEW') ||
    !warehouses.warehouses.length ||
    (filters.warehouseId && !inScope(filters.warehouseId))
  )
    return
  if (filters.from && filters.to && filters.from > filters.to) {
    error.value = 'Ngày bắt đầu không được sau ngày kết thúc.'
    return
  }
  loading.value = true
  try {
    const result = await getSalesOrders({
      page: page.value,
      pageSize: pageSize.value,
      ...(filters.warehouseId ? { warehouseId: filters.warehouseId } : {}),
      ...(filters.customerId ? { customerId: filters.customerId } : {}),
      ...(filters.status ? { status: filters.status } : {}),
      ...(filters.from ? { from: filters.from } : {}),
      ...(filters.to ? { to: filters.to } : {}),
    })
    if (current !== sequence) return
    rows.value = result.items.filter((item) => inScope(item.warehouseId))
    payments.syncOrders(rows.value)
    total.value = result.total
    if (can('CUSTOMER_VIEW')) {
      const ids = [
        ...new Set(
          rows.value
            .filter((item) => !item.customerSnapshot && item.customerId)
            .map((item) => item.customerId!),
        ),
      ]
      const results = await Promise.allSettled(ids.map(getCustomer))
      if (current !== sequence) return
      customers.value = results.flatMap((result) =>
        result.status === 'fulfilled' && inScope(result.value.warehouseId) ? [result.value] : [],
      )
      if (
        results.some(
          (result) =>
            result.status === 'rejected' && (result.reason as { status?: number }).status === 403,
        )
      )
        await refreshScope()
    }
  } catch (cause) {
    if (current === sequence) error.value = salesError(cause)
    if ((cause as { status?: number }).status === 403) await refreshScope()
  } finally {
    if (current === sequence) loading.value = false
  }
}
watch(
  () => filters.warehouseId,
  () => {
    filters.customerId = undefined
  },
)
watch(
  () => [
    filters.warehouseId,
    filters.customerId,
    filters.status,
    filters.from,
    filters.to,
    scopeKey.value,
  ],
  () => {
    page.value = 1
    void load()
  },
  { immediate: true },
)
watch(
  () => warehouses.selectedId,
  (value) => {
    filters.warehouseId = value
  },
)
watch(
  scopeKey,
  () => {
    ++sequence
    open.value = false
    collectOpen.value = false
    collectOrder.value = undefined
    if (filters.warehouseId && !inScope(filters.warehouseId)) filters.warehouseId = undefined
  },
  { flush: 'sync' },
)
watch(
  () => warehouses.selectedId,
  () => {
    collectOpen.value = false
    collectOrder.value = undefined
  },
  { flush: 'sync' },
)
watch(
  () => payments.revision,
  () => {
    rows.value = rows.value.map((order) =>
      payments.summaries[order.id]
        ? applyPaymentSummary(order, payments.summaries[order.id]!)
        : order,
    )
    void load()
  },
)
onBeforeUnmount(() => ++sequence)
const show = (value: typeof mode.value, order?: SalesOrder): void => {
  mode.value = value
  id.value = order?.id
  open.value = true
}
const showCollect = (order: SalesOrder): void => {
  collectOrder.value = order
  collectOpen.value = true
}
const changePage = (next: number, size: number): void => {
  if (![10, 20, 50, 100].includes(size)) return
  if (next === page.value && size === pageSize.value) return
  page.value = size !== pageSize.value ? 1 : next
  pageSize.value = size
  void load()
}
</script>
<template>
  <a-config-provider :theme="{ token: { colorPrimary: '#7357cf', borderRadius: 8 } }">
    <section class="sales-orders-page">
      <PendingPaymentRetries />
      <div class="heading">
        <div>
          <h1>{{ $t('sales.orders') }}</h1>
          <p>{{ $t('sales.ordersDescription') }}</p>
        </div>
        <a-button v-if="can('SALES_ORDER_CREATE')" type="primary" @click="show('create')">
          <template #icon><PlusOutlined aria-hidden="true" /></template>
          Tạo đơn bán hàng
        </a-button>
      </div>
      <a-alert v-if="error" type="error" :message="error" show-icon />
      <a-alert
        v-if="!can('SALES_ORDER_VIEW')"
        type="warning"
        message="Thiếu SALES_ORDER_VIEW để xem danh sách."
      />
      <a-alert
        v-else-if="!warehouses.warehouses.length"
        type="info"
        message="Không có kho trong phạm vi được phép. Tải lại kho trên thanh công cụ."
      />
      <template v-else>
        <div class="filters">
          <div class="order-filter">
            <label for="order-filter-warehouse">Kho</label>
            <a-select
              id="order-filter-warehouse"
              v-model:value="filters.warehouseId"
              :options="warehouseOptions"
              placeholder="Tất cả kho được giao"
              allow-clear
            />
          </div>
          <div class="order-filter">
            <label for="order-filter-customer">Khách hàng</label>
            <CustomerSelect
              v-model:value="filters.customerId"
              :warehouse-id="filters.warehouseId"
              input-id="order-filter-customer"
              :placeholder="$t('sales.orderFilterCustomer')"
            />
          </div>
          <div class="order-filter">
            <label for="order-filter-status">Trạng thái</label>
            <a-select
              id="order-filter-status"
              v-model:value="filters.status"
              :options="[
                { value: 'DRAFT', label: $t('sales.DRAFT') },
                { value: 'CONFIRMED', label: $t('sales.CONFIRMED') },
                { value: 'CANCELLED', label: $t('sales.CANCELLED') },
              ]"
              placeholder="Tất cả trạng thái"
              allow-clear
            />
          </div>
          <div class="order-filter">
            <label for="order-filter-from">Từ ngày</label>
            <a-date-picker
              id="order-filter-from"
              v-model:value="filters.from"
              value-format="YYYY-MM-DD"
              placeholder="Từ ngày"
            />
          </div>
          <div class="order-filter">
            <label for="order-filter-to">Đến ngày</label>
            <a-date-picker
              id="order-filter-to"
              v-model:value="filters.to"
              value-format="YYYY-MM-DD"
              placeholder="Đến ngày (bao gồm)"
            />
          </div>
          <a-button
            @click="
              Object.assign(filters, {
                warehouseId: undefined,
                customerId: undefined,
                status: undefined,
                from: '',
                to: '',
              })
            "
          >
            <template #icon><ReloadOutlined aria-hidden="true" /></template>
            Đặt lại
          </a-button>
        </div>
        <FittedListTable
          class="sales-orders-panel"
          :columns="columns"
          :rows="rows"
          :loading="loading"
          :error="error"
          :total="total"
          :page="page"
          :page-size="pageSize"
          :reset-key="scrollRevision"
          :row-height="64"
          :list-title="$t('sales.ordersList')"
          :total-label="$t('sales.orderTotal', { total })"
          :range-label="rangeLabel"
          @reload="load"
          @page-change="changePage"
        >
          <template #bodyCell="{ column, record, compact }">
            <a-tooltip v-if="column.key === 'code'" :title="record.code">
              <span class="order-text order-code">{{ record.code }}</span>
            </a-tooltip>
            <a-tooltip
              v-else-if="column.key === 'warehouse'"
              :title="warehouseName(record.warehouseId)"
            >
              <span class="order-text">{{ warehouseName(record.warehouseId) }}</span>
            </a-tooltip>
            <a-tooltip
              v-else-if="column.key === 'customer'"
              :title="salesCustomerName(record, customers)"
            >
              <span class="order-text">{{ salesCustomerName(record, customers) }}</span>
            </a-tooltip>
            <span v-else-if="column.key === 'saleDate'" class="order-date">{{
              formatDate(record.saleDate)
            }}</span>
            <span
              v-else-if="moneyKeys.includes(column.key as (typeof moneyKeys)[number])"
              class="order-money"
              :class="{
                'order-money-total': ['totalAmount', 'adjustedTotalAmount'].includes(
                  String(column.key),
                ),
              }"
            >
              {{
                record[column.key] === undefined || record[column.key] === null
                  ? '—'
                  : formatStockInteger(record[column.key])
              }}
            </span>
            <div v-else-if="column.key === 'paymentStatus'" class="order-payment">
              <span>{{ paymentLabel(record) }}</span>
              <a-tag
                v-if="record.refundableAmount !== undefined && BigInt(record.refundableAmount) > 0n"
                color="orange"
                >Cần hoàn tiền</a-tag
              >
            </div>
            <a-tag
              v-else-if="column.key === 'status'"
              :color="
                record.status === 'CONFIRMED'
                  ? 'green'
                  : record.status === 'CANCELLED'
                    ? 'red'
                    : 'default'
              "
            >
              {{ $t('sales.' + record.status) }}
            </a-tag>
            <div v-else-if="column.key === 'actions'" class="order-actions">
              <a-tooltip v-if="!compact" title="Chi tiết">
                <a-button type="text" aria-label="Chi tiết" @click="show('view', record)">
                  <template #icon><EyeOutlined aria-hidden="true" /></template>
                </a-button>
              </a-tooltip>
              <a-dropdown :trigger="['click']">
                <a-button type="text" aria-label="Thao tác">
                  <template #icon><MoreOutlined aria-hidden="true" /></template>
                </a-button>
                <template #overlay>
                  <a-menu>
                    <a-menu-item v-if="compact" key="view" @click="show('view', record)"
                      >Chi tiết</a-menu-item
                    >
                    <a-menu-item
                      v-if="
                        can('PAYMENT_CREATE') &&
                        (canCollect(record) || payments.attempts[record.id])
                      "
                      key="collect"
                      @click="showCollect(record)"
                    >
                      {{ payments.attempts[record.id] ? 'Thử lại lần thu' : 'Thu tiền' }}
                    </a-menu-item>
                    <a-menu-item
                      v-if="record.status === 'DRAFT' && can('SALES_ORDER_UPDATE')"
                      key="edit"
                      @click="show('edit', record)"
                      >Sửa</a-menu-item
                    >
                    <a-menu-item
                      v-if="record.status === 'DRAFT' && can('SALES_ORDER_CONFIRM')"
                      key="confirm"
                      @click="show('confirm', record)"
                      >Xác nhận xuất</a-menu-item
                    >
                    <a-menu-item
                      v-if="
                        record.status !== 'CANCELLED' &&
                        BigInt(record.paidAmount ?? 0) === 0n &&
                        can('SALES_ORDER_CANCEL')
                      "
                      key="cancel"
                      danger
                      @click="show('cancel', record)"
                      >Hủy</a-menu-item
                    >
                  </a-menu>
                </template>
              </a-dropdown>
            </div>
          </template>
        </FittedListTable>
      </template>
      <CollectPaymentDialog
        v-if="collectOrder"
        v-model:open="collectOpen"
        :order="collectOrder"
        @updated="collectOrder = $event"
      />
      <SalesOrderDialog :id="id" v-model:open="open" :mode="mode" @saved="load" />
    </section>
  </a-config-provider>
</template>
<style scoped>
.sales-orders-page {
  display: flex;
  flex: 1;
  flex-direction: column;
  gap: 12px;
  min-height: 0;
  min-width: 0;
}
.sales-orders-page > :not(.sales-orders-panel) {
  flex-shrink: 0;
}
.heading {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
}
.heading h1 {
  margin: 0;
  color: #302640;
  font-size: 24px;
  line-height: 32px;
  font-weight: 650;
}
.heading p {
  margin: 4px 0 0;
  color: #797184;
  line-height: 20px;
}
.filters {
  display: grid;
  grid-template-columns:
    minmax(180px, 1.2fr) minmax(220px, 1.4fr) minmax(180px, 1fr) minmax(150px, 0.8fr)
    minmax(170px, 0.8fr) auto;
  align-items: end;
  gap: 12px;
  padding: 16px;
  border: 1px solid #e9e4f1;
  border-radius: 12px;
  background: #fff;
}
.order-filter {
  display: flex;
  flex-direction: column;
  gap: 6px;
  min-width: 0;
}
.order-filter > label,
.order-filter > span {
  color: #625b70;
  font-size: 13px;
}
.order-filter :deep(.ant-select),
.order-filter :deep(.ant-picker) {
  width: 100%;
  min-width: 0 !important;
}
.order-text {
  display: block;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.order-code {
  color: #61469c;
  font-weight: 600;
  font-variant-numeric: tabular-nums;
}
.order-date,
.order-money {
  white-space: nowrap;
  font-variant-numeric: tabular-nums;
}
.order-money-total {
  color: #443257;
  font-weight: 600;
}
.order-payment {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 4px;
}
.order-actions {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 4px;
}
.order-actions :deep(.ant-btn) {
  width: 28px;
  min-width: 28px;
  padding: 0;
}
.sales-orders-panel :deep(.ant-table-thead > tr > th) {
  white-space: nowrap;
}
.sales-orders-panel :deep(.ant-tag) {
  white-space: nowrap;
}
@container workspace (max-width: 1250px) {
  .filters {
    grid-template-columns: repeat(3, minmax(0, 1fr));
  }
}
@container workspace (max-width: 800px) {
  .filters {
    grid-template-columns: repeat(2, minmax(0, 1fr));
    padding: 12px;
  }
}
@container workspace (max-width: 500px) {
  .heading {
    align-items: flex-start;
    flex-wrap: wrap;
  }
  .heading > div {
    flex-basis: 100%;
  }
}
/* Scope the bounded workspace to this module without changing other routes. */
:global(.admin-layout:has(.sales-orders-page)) {
  height: 100dvh;
  min-height: 0;
}
:global(.admin-layout:has(.sales-orders-page) > .admin-layout__main) {
  height: 100%;
  min-height: 0;
}
:global(.admin-layout:has(.sales-orders-page) .app-header) {
  flex-shrink: 0;
}
:global(.admin-layout__content:has(.sales-orders-page)) {
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
  :global(.admin-layout__content:has(.sales-orders-page)) {
    padding: 12px;
  }
}
</style>
