<script setup lang="ts">
import { useRoute } from 'vue-router'
import { computed, onBeforeUnmount, reactive, ref, watch } from 'vue'
import ReturnRefundList from '@/components/sales/ReturnRefundList.vue'
import { FileTextOutlined, AccountBookOutlined } from '@ant-design/icons-vue'
import type { TableColumnsType } from 'ant-design-vue'
import RefundDialog from '@/components/sales/RefundDialog.vue'
import RefundDetailDialog from '@/components/sales/RefundDetailDialog.vue'
import PendingRefundRetries from '@/components/sales/PendingRefundRetries.vue'
import SalesOrderDialog from '@/components/sales/SalesOrderDialog.vue'
import { usePaymentScope } from '@/composables/usePaymentScope'
import { usePaymentsStore } from '@/stores/payments'
import { useRefundsStore } from '@/stores/refunds'
import { getRefunds, getRefundables } from '@/api/sales/returns.api'
import { returnError } from '@/utils/returns'
import { reportValue } from '@/utils/reports'
import { formatDate, formatDateTime } from '@/utils/date'
import type { Refund, OrderSettlementSummary } from '@/types/returns'
import type { StockInteger } from '@/types/stock'
import type { ReceiptPaymentStatus, PaymentMethod } from '@/types/payments'
const route = useRoute()
const props = defineProps<{ refundable?: boolean }>()
const { warehouses, can, inScope, contextKey, refreshAccess } = usePaymentScope()
const refunds = useRefundsStore(),
  payments = usePaymentsStore()
const rows = ref<(Refund | OrderSettlementSummary)[]>([]),
  total = ref<StockInteger>(),
  error = ref(''),
  loading = ref(false)
const order = ref<OrderSettlementSummary>(),
  refundOpen = ref(false),
  detailId = ref<string>(),
  detailOpen = ref(false),
  orderId = ref<string>(),
  orderOpen = ref(false)
const filters = reactive({
  warehouseId: warehouses.selectedId,
  salesOrderId: '',
  customerId: '',
  status: undefined as ReceiptPaymentStatus | undefined,
  method: undefined as PaymentMethod | undefined,
  from: '',
  to: '',
  page: 1,
  pageSize: 10,
})
const options = computed(() =>
  warehouses.warehouses.map((w) => ({ value: w.id, label: w.code + ' — ' + w.name })),
)
const money = [
  'totalAmount',
  'returnedAmount',
  'adjustedTotalAmount',
  'paidAmount',
  'refundedAmount',
  'netPaidAmount',
  'remainingAmount',
  'refundableAmount',
  'amount',
]
const columns = computed(
  () =>
    (props.refundable
      ? [
          ['code', 'Mã đơn'],
          ['customer', 'Khách'],
          ['warehouseId', 'Kho'],
          ['saleDate', 'Ngày bán'],
          ['totalAmount', 'Tổng gốc'],
          ['returnedAmount', 'Hàng đã trả'],
          ['adjustedTotalAmount', 'Tổng sau trả'],
          ['paidAmount', 'Đã thu'],
          ['refundedAmount', 'Đã hoàn'],
          ['netPaidAmount', 'Thu ròng'],
          ['remainingAmount', 'Còn phải thu'],
          ['refundableAmount', 'Còn cần hoàn'],
          ['actions', 'Thao tác'],
        ]
      : [
          ['code', 'Mã phiếu'],
          ['warehouseId', 'Kho'],
          ['salesOrderId', 'Đơn nguồn'],
          ['customerId', 'Khách'],
          ['amount', 'Số tiền'],
          ['method', 'Hình thức'],
          ['refundDate', 'Ngày hoàn'],
          ['reason', 'Lý do'],
          ['status', 'Trạng thái'],
          ['createdBy', 'Người tạo'],
          ['createdAt', 'Thời gian tạo'],
          ['actions', 'Thao tác'],
        ]
    ).map(([key, title]) => ({
      key,
      dataIndex: key,
      title,
      width:
        key === 'actions'
          ? 240
          : money.includes(key!)
            ? 220
            : ['saleDate', 'refundDate', 'status', 'method'].includes(key!)
              ? 140
              : 220,
      ...(key === 'actions' ? { fixed: 'right' as const } : {}),
      ...(money.includes(key!) ? { align: 'right' as const } : {}),
    })) as TableColumnsType<Refund | OrderSettlementSummary>,
)
let sequence = 0
const load = async (): Promise<void> => {
  const current = ++sequence
  rows.value = []
  total.value = undefined
  loading.value = false
  error.value = ''
  if (
    !can('REFUND_VIEW') ||
    !warehouses.loaded ||
    !warehouses.warehouses.length ||
    (filters.warehouseId && !inScope(filters.warehouseId))
  )
    return
  if (!props.refundable && filters.from && filters.to && filters.from > filters.to) {
    error.value = 'Ngày bắt đầu không được sau ngày kết thúc.'
    return
  }
  loading.value = true
  try {
    const result = props.refundable
      ? await getRefundables({
          warehouseId: filters.warehouseId || undefined,
          page: filters.page,
          pageSize: filters.pageSize,
        })
      : await getRefunds({
          ...filters,
          warehouseId: filters.warehouseId || undefined,
          salesOrderId: filters.salesOrderId || undefined,
          customerId: filters.customerId || undefined,
          from: filters.from || undefined,
          to: filters.to || undefined,
        })
    if (current !== sequence) return
    rows.value = result.items.filter((row) => inScope(row.warehouseId))
    total.value = result.total
    if (props.refundable && order.value) {
      const latest = result.items.find(
        (row) =>
          'salesOrderId' in row &&
          row.salesOrderId === order.value?.salesOrderId &&
          'refundableAmount' in row,
      )
      if (latest && 'refundableAmount' in latest) {
        order.value = latest
        payments.summaries[latest.salesOrderId] = latest
      }
    }
  } catch (cause) {
    if (current !== sequence) return
    error.value = returnError(cause)
    if ((cause as { status?: number }).status === 403) {
      rows.value = []
      order.value = undefined
      refundOpen.value = false
      detailOpen.value = false
      await refreshAccess()
    }
  } finally {
    if (current === sequence) loading.value = false
  }
}
const showRefund = (value: OrderSettlementSummary): void => {
  order.value = value
  refundOpen.value = true
}
const showDetail = (id: string): void => {
  detailId.value = id
  detailOpen.value = true
}
const showOrder = (id: string): void => {
  if (can('SALES_ORDER_VIEW')) {
    orderId.value = id
    orderOpen.value = true
  }
}
watch(
  () => [
    props.refundable,
    filters.warehouseId,
    filters.salesOrderId,
    filters.customerId,
    filters.status,
    filters.method,
    filters.from,
    filters.to,
  ],
  () => {
    filters.page = 1
    refundOpen.value = false
    detailOpen.value = false
    void load()
  },
)
watch(
  contextKey,
  () => {
    ++sequence
    rows.value = []
    order.value = undefined
    refundOpen.value = false
    detailOpen.value = false
    orderOpen.value = false
    filters.warehouseId = warehouses.selectedId
    filters.page = 1
    void load()
  },
  { immediate: true, flush: 'sync' },
)
watch(
  () => refunds.revision,
  () => void load(),
)
watch(
  () => route.query.salesOrderId,
  (value) => {
    filters.salesOrderId = typeof value === 'string' ? value : ''
  },
  { immediate: true },
)
onBeforeUnmount(() => ++sequence)
const changePage = (next: number, size: number): void => {
  if (loading.value || ![10, 20, 50, 100].includes(size)) return
  if (next === filters.page && size === filters.pageSize) return
  filters.page = size === filters.pageSize ? next : 1
  filters.pageSize = size
  void load()
}
const warehouseName = (id: string): string =>
  warehouses.warehouses.find((w) => w.id === id)?.name ?? id
</script>
<template>
  <a-config-provider
    :theme="{ token: { colorPrimary: '#7357cf', colorLink: '#7357cf', borderRadius: 8 } }"
  >
    <section class="rr-page">
      <header class="rr-page-heading">
        <AccountBookOutlined v-if="refundable" aria-hidden="true" /><FileTextOutlined
          v-else
          aria-hidden="true"
        />
        <div>
          <h1>{{ refundable ? 'Đơn cần hoàn tiền' : 'Phiếu hoàn tiền' }}</h1>
          <p>
            {{
              refundable
                ? 'Theo dõi khoản còn cần hoàn theo số liệu quyết toán của đơn.'
                : 'Tra cứu và xử lý các khoản hoàn tiền đã ghi nhận.'
            }}
          </p>
        </div>
      </header>
      <PendingRefundRetries class="rr-pending-retries" />
      <a-alert v-if="error" type="error" :message="error" show-icon />
      <a-alert
        v-if="!warehouses.warehouses.length"
        type="info"
        message="Không có kho được giao. Tải lại phạm vi kho trên thanh công cụ."
        show-icon
      />
      <ReturnRefundList
        :title="refundable ? 'Đơn cần hoàn tiền' : 'Danh sách phiếu hoàn tiền'"
        :columns="columns"
        :rows="rows"
        :loading="loading"
        :error="error"
        :total="total"
        :page="filters.page"
        :page-size="filters.pageSize"
        :row-key="(row) => ('id' in row ? row.id : row.salesOrderId)"
        @reload="load"
        @page-change="changePage"
      >
        <template #filters>
          <a-form layout="vertical">
            <a-form-item label="Kho" html-for="refund-filter-warehouse"
              ><a-select
                id="refund-filter-warehouse"
                v-model:value="filters.warehouseId"
                :options="options"
                placeholder="Tất cả kho được giao"
                allow-clear
            /></a-form-item>
            <template v-if="!refundable">
              <a-form-item label="ID đơn" html-for="refund-filter-order"
                ><a-input
                  id="refund-filter-order"
                  v-model:value="filters.salesOrderId"
                  placeholder="Nhập ID đơn"
                  allow-clear
              /></a-form-item>
              <a-form-item label="ID khách" html-for="refund-filter-customer"
                ><a-input
                  id="refund-filter-customer"
                  v-model:value="filters.customerId"
                  placeholder="Nhập ID khách"
                  allow-clear
              /></a-form-item>
              <a-form-item label="Trạng thái" html-for="refund-filter-status"
                ><a-select
                  id="refund-filter-status"
                  v-model:value="filters.status"
                  allow-clear
                  placeholder="Tất cả"
                  :options="[
                    { value: 'ACTIVE', label: 'Hiệu lực' },
                    { value: 'CANCELLED', label: 'Đã hủy' },
                  ]"
              /></a-form-item>
              <a-form-item label="Hình thức" html-for="refund-filter-method"
                ><a-select
                  id="refund-filter-method"
                  v-model:value="filters.method"
                  allow-clear
                  placeholder="Tất cả"
                  :options="[
                    { value: 'CASH', label: 'Tiền mặt' },
                    { value: 'BANK_TRANSFER', label: 'Chuyển khoản' },
                  ]"
              /></a-form-item>
              <a-form-item label="Từ ngày hoàn" html-for="refund-filter-from"
                ><a-date-picker
                  id="refund-filter-from"
                  v-model:value="filters.from"
                  value-format="YYYY-MM-DD"
                  format="DD/MM/YYYY"
                  placeholder="Chọn ngày"
              /></a-form-item>
              <a-form-item label="Đến ngày hoàn (bao gồm)" html-for="refund-filter-to"
                ><a-date-picker
                  id="refund-filter-to"
                  v-model:value="filters.to"
                  value-format="YYYY-MM-DD"
                  format="DD/MM/YYYY"
                  placeholder="Chọn ngày"
              /></a-form-item>
            </template>
          </a-form>
        </template>
        <template #bodyCell="{ column, record }">
          <span
            v-if="money.includes(String(column.key))"
            class="rr-money"
            :class="{ 'rr-money-emphasis': column.key === 'refundableAmount' }"
            >{{ reportValue(record[column.key], true) }}</span
          >
          <a-tooltip
            v-else-if="column.key === 'customer'"
            :title="record.customerSnapshot?.name ?? record.customerId ?? 'Khách lẻ'"
            ><span class="rr-text">{{
              record.customerSnapshot?.name ?? record.customerId ?? 'Khách lẻ'
            }}</span></a-tooltip
          >
          <a-tooltip
            v-else-if="column.key === 'warehouseId'"
            :title="warehouseName(record.warehouseId)"
            ><span class="rr-text">{{ warehouseName(record.warehouseId) }}</span></a-tooltip
          >
          <template v-else-if="column.key === 'method'">{{
            record.method === 'CASH' ? 'Tiền mặt' : 'Chuyển khoản'
          }}</template>
          <template v-else-if="column.key === 'createdAt'">{{
            formatDateTime(record.createdAt)
          }}</template>
          <template v-else-if="['saleDate', 'refundDate'].includes(String(column.key))">{{
            formatDate(record[column.key])
          }}</template>
          <a-tag
            v-else-if="column.key === 'status'"
            :color="record.status === 'ACTIVE' ? 'green' : 'red'"
            >{{ record.status === 'ACTIVE' ? 'Hiệu lực' : 'Đã hủy' }}</a-tag
          >
          <div v-else-if="column.key === 'actions'" class="rr-actions">
            <a-button
              v-if="refundable && can('REFUND_CREATE')"
              type="primary"
              @click="showRefund(record)"
              >Hoàn tiền</a-button
            >
            <a-button v-if="!refundable" @click="showDetail(record.id)">Chi tiết / xử lý</a-button>
            <a-button v-if="can('SALES_ORDER_VIEW')" @click="showOrder(record.salesOrderId)"
              >Xem đơn</a-button
            >
          </div>
          <a-tooltip
            v-else
            :title="record[column.dataIndex] ?? (column.key === 'customerId' ? 'Khách lẻ' : '—')"
            ><span class="rr-text" :class="{ 'rr-code': column.key === 'code' }">{{
              record[column.dataIndex] ?? (column.key === 'customerId' ? 'Khách lẻ' : '—')
            }}</span></a-tooltip
          >
        </template>
      </ReturnRefundList>
      <RefundDialog
        v-if="order"
        v-model:open="refundOpen"
        :order="order"
        @updated="order = $event"
        @refresh-requested="load"
      />
      <RefundDetailDialog :id="detailId" v-model:open="detailOpen" @saved="load" />
      <SalesOrderDialog
        v-if="can('SALES_ORDER_VIEW')"
        :id="orderId"
        v-model:open="orderOpen"
        mode="view"
      />
    </section>
  </a-config-provider>
</template>
<style scoped src="./returnRefundPage.css"></style>
