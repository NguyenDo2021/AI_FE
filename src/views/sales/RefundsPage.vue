<script setup lang="ts">
import { useRoute } from 'vue-router'
import { computed, onBeforeUnmount, reactive, ref, watch } from 'vue'
import { BasicTable } from '@/components'
import RefundDialog from '@/components/sales/RefundDialog.vue'
import RefundDetailDialog from '@/components/sales/RefundDetailDialog.vue'
import PendingRefundRetries from '@/components/sales/PendingRefundRetries.vue'
import SalesOrderDialog from '@/components/sales/SalesOrderDialog.vue'
import { usePaymentScope } from '@/composables/usePaymentScope'
import { usePaymentsStore } from '@/stores/payments'
import { useRefundsStore } from '@/stores/refunds'
import { getRefunds, getRefundables } from '@/api/sales/returns.api'
import { returnError, hasNextPage } from '@/utils/returns'
import { reportValue } from '@/utils/reports'
import { formatStockInteger as fmt } from '@/utils/stock'
import { formatDateTime } from '@/utils/date'
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
const columns = computed(() =>
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
  ).map(([key, title]) => ({ key, dataIndex: key, title })),
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
    filters.pageSize,
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
const change = (delta: number): void => {
  filters.page += delta
  void load()
}
</script>
<template>
  <section>
    <h1>{{ refundable ? 'Đơn cần hoàn tiền' : 'Phiếu hoàn tiền' }}</h1>
    <PendingRefundRetries />
    <a-alert v-if="error" type="error" :message="error" />
    <a-alert
      v-if="!warehouses.warehouses.length"
      type="info"
      message="Không có kho được giao. Tải lại phạm vi kho trên thanh công cụ."
    />
    <a-form layout="inline" style="margin: 16px 0; gap: 12px">
      <a-form-item label="Kho"
        ><a-select
          v-model:value="filters.warehouseId"
          :options="options"
          allow-clear
          style="min-width: 220px"
      /></a-form-item>
      <template v-if="!refundable">
        <a-form-item label="ID đơn"><a-input v-model:value="filters.salesOrderId" /></a-form-item
        ><a-form-item label="ID khách"><a-input v-model:value="filters.customerId" /></a-form-item>
        <a-form-item label="Trạng thái"
          ><a-select
            v-model:value="filters.status"
            allow-clear
            style="min-width: 150px"
            :options="[
              { value: 'ACTIVE', label: 'Hiệu lực' },
              { value: 'CANCELLED', label: 'Đã hủy' },
            ]"
        /></a-form-item>
        <a-form-item label="Hình thức"
          ><a-select
            v-model:value="filters.method"
            allow-clear
            style="min-width: 150px"
            :options="[
              { value: 'CASH', label: 'Tiền mặt' },
              { value: 'BANK_TRANSFER', label: 'Chuyển khoản' },
            ]"
        /></a-form-item>
        <a-form-item label="Từ ngày hoàn"
          ><a-date-picker v-model:value="filters.from" value-format="YYYY-MM-DD" /></a-form-item
        ><a-form-item label="Đến ngày hoàn (bao gồm)"
          ><a-date-picker v-model:value="filters.to" value-format="YYYY-MM-DD"
        /></a-form-item>
      </template>
    </a-form>
    <BasicTable
      :columns="columns"
      :data-source="rows"
      :row-key="(row) => ('id' in row ? row.id : row.salesOrderId)"
      :loading="loading"
      :scroll="{ x: 2000 }"
      @reload="load"
    >
      <template #bodyCell="{ column, record }">
        <template v-if="money.includes(String(column.key))">{{
          reportValue(record[column.key], true)
        }}</template>
        <template v-else-if="column.key === 'customer'">{{
          record.customerSnapshot?.name ?? record.customerId ?? 'Khách lẻ'
        }}</template>
        <template v-else-if="column.key === 'warehouseId'">{{
          warehouses.warehouses.find((w) => w.id === record.warehouseId)?.name ?? record.warehouseId
        }}</template>
        <template v-else-if="column.key === 'method'">{{
          record.method === 'CASH' ? 'Tiền mặt' : 'Chuyển khoản'
        }}</template>
        <template v-else-if="column.key === 'createdAt'">{{
          formatDateTime(record.createdAt)
        }}</template>
        <a-tag v-else-if="column.key === 'status'">{{
          record.status === 'ACTIVE' ? 'Hiệu lực' : 'Đã hủy'
        }}</a-tag>
        <a-space v-else-if="column.key === 'actions'">
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
        </a-space>
      </template>
    </BasicTable>
    <a-space
      ><span>Tổng {{ total === undefined ? '—' : fmt(total) }} · Trang {{ filters.page }}</span
      ><a-button :disabled="loading || filters.page <= 1" @click="change(-1)">Trước</a-button
      ><a-button
        :disabled="loading || !hasNextPage(total, filters.page, filters.pageSize)"
        @click="change(1)"
        >Sau</a-button
      ><a-select
        v-model:value="filters.pageSize"
        :options="[10, 20, 50, 100].map((value) => ({ value, label: String(value) }))"
    /></a-space>
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
</template>
