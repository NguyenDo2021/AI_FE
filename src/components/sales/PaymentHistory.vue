<script setup lang="ts">
import { computed, reactive, ref, watch, onBeforeUnmount } from 'vue'
import { BasicTable } from '@/components'
import PaymentDetailDialog from './PaymentDetailDialog.vue'
import SalesOrderDialog from './SalesOrderDialog.vue'
import { getPayments, getOrderPayments } from '@/api/payments/payments.api'
import { usePaymentScope } from '@/composables/usePaymentScope'
import { usePaymentsStore } from '@/stores/payments'
import { paymentError } from '@/utils/payments'
import { formatStockInteger } from '@/utils/stock'
import type { Payment, PaymentParams } from '@/types/payments'
import type { NormalizedApiError } from '@/utils/request'
const props = defineProps<{ orderId?: string }>()
const { can, warehouses, inScope, contextKey, refreshAccess } = usePaymentScope()
const payments = usePaymentsStore()
const rows = ref<Payment[]>([])
const page = ref(1)
const pageSize = ref(10)
const total = ref(0)
const loading = ref(false)
const error = ref('')
const filters = reactive({
  warehouseId: warehouses.selectedId,
  salesOrderId: '',
  customerId: '',
  status: undefined as PaymentParams['status'],
  method: undefined as PaymentParams['method'],
  from: '',
  to: '',
})
const detailId = ref<string>()
const detailOpen = ref(false)
const cancelMode = ref(false)
const salesId = ref<string>()
const salesOpen = ref(false)
let sequence = 0
const columns = [
  ['code', 'Mã phiếu'],
  ['paymentDate', 'Ngày thu'],
  ['amount', 'Số tiền'],
  ['method', 'Hình thức'],
  ['status', 'Trạng thái'],
  ['warehouseId', 'Kho'],
  ['salesOrderId', 'Đơn nguồn'],
  ['actions', 'Thao tác'],
].map(([key, title]) => ({ key, dataIndex: key, title }))
const warehouseOptions = computed(() =>
  warehouses.warehouses.map((item) => ({ value: item.id, label: item.code + ' — ' + item.name })),
)
const pagination = computed(() => ({
  current: page.value,
  pageSize: pageSize.value,
  total: total.value,
  showSizeChanger: true,
  pageSizeOptions: ['1', '10', '20', '50', '100'],
}))
const load = async (): Promise<void> => {
  const current = ++sequence
  rows.value = []
  total.value = 0
  error.value = ''
  loading.value = false
  if (
    !can('PAYMENT_VIEW') ||
    !warehouses.warehouses.length ||
    (!props.orderId && filters.warehouseId && !inScope(filters.warehouseId))
  )
    return
  if (!props.orderId && filters.from && filters.to && filters.from > filters.to) {
    error.value = 'Ngày bắt đầu không được sau ngày kết thúc.'
    return
  }
  loading.value = true
  try {
    const paging = {
      page: page.value,
      pageSize: pageSize.value,
      ...(filters.status ? { status: filters.status } : {}),
    }
    const result = props.orderId
      ? await getOrderPayments(props.orderId, paging)
      : await getPayments({
          ...paging,
          ...(filters.warehouseId ? { warehouseId: filters.warehouseId } : {}),
          ...(filters.salesOrderId ? { salesOrderId: filters.salesOrderId } : {}),
          ...(filters.customerId ? { customerId: filters.customerId } : {}),
          ...(filters.method ? { method: filters.method } : {}),
          ...(filters.from ? { from: filters.from } : {}),
          ...(filters.to ? { to: filters.to } : {}),
        })
    if (current !== sequence) return
    rows.value = result.items.filter((item) => inScope(item.warehouseId))
    total.value = result.total
  } catch (cause) {
    if (current === sequence) error.value = paymentError(cause)
    if ((cause as NormalizedApiError).status === 403) await refreshAccess()
  } finally {
    if (current === sequence) loading.value = false
  }
}
watch(
  () => [props.orderId, ...Object.values(filters)],
  () => {
    page.value = 1
    void load()
  },
)
watch(
  contextKey,
  () => {
    ++sequence
    rows.value = []
    detailOpen.value = false
    salesOpen.value = false
    filters.warehouseId = warehouses.selectedId
    if (filters.warehouseId && !inScope(filters.warehouseId)) filters.warehouseId = undefined
    page.value = 1
    void load()
  },
  { immediate: true, flush: 'sync' },
)
watch(
  () => payments.revision,
  () => void load(),
)
onBeforeUnmount(() => ++sequence)
const changePage = (next: number, size: number): void => {
  page.value = size !== pageSize.value ? 1 : next
  pageSize.value = size
  void load()
}
const openSales = (id: string): void => {
  salesId.value = id
  salesOpen.value = true
}
const show = (payment: Payment, cancel = false): void => {
  detailId.value = payment.id
  cancelMode.value = cancel
  detailOpen.value = true
}
</script>
<template>
  <section>
    <a-alert v-if="error" type="error" :message="error" />
    <a-alert
      v-if="!can('PAYMENT_VIEW')"
      type="warning"
      message="Thiếu PAYMENT_VIEW để xem phiếu thu."
    />
    <template v-else>
      <a-alert
        v-if="!warehouses.warehouses.length"
        type="info"
        message="Không có kho trong phạm vi được phép. Tải lại kho trên thanh công cụ."
      />
      <div class="filters">
        <template v-if="!orderId">
          <a-select
            v-model:value="filters.warehouseId"
            :options="warehouseOptions"
            placeholder="Tất cả kho được giao"
            allow-clear
          />
          <a-input v-model:value="filters.salesOrderId" placeholder="UUID đơn nguồn" allow-clear />
          <a-input v-model:value="filters.customerId" placeholder="UUID khách" allow-clear />
          <a-select
            v-model:value="filters.method"
            :options="[
              { value: 'CASH', label: 'Tiền mặt' },
              { value: 'BANK_TRANSFER', label: 'Chuyển khoản' },
            ]"
            placeholder="Tất cả hình thức"
            allow-clear
          />
          <a-date-picker
            v-model:value="filters.from"
            value-format="YYYY-MM-DD"
            placeholder="Từ ngày thu"
          />
          <a-date-picker
            v-model:value="filters.to"
            value-format="YYYY-MM-DD"
            placeholder="Đến ngày thu (bao gồm)"
          />
        </template>
        <a-select
          v-model:value="filters.status"
          :options="[
            { value: 'ACTIVE', label: 'Có hiệu lực' },
            { value: 'CANCELLED', label: 'Đã hủy' },
          ]"
          placeholder="Tất cả trạng thái"
          allow-clear
        />
        <a-button
          @click="
            Object.assign(filters, {
              warehouseId: undefined,
              salesOrderId: '',
              customerId: '',
              status: undefined,
              method: undefined,
              from: '',
              to: '',
            })
          "
          >Đặt lại</a-button
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
          <template v-if="column.key === 'amount'"
            >{{ formatStockInteger(record.amount) }} VND</template
          >
          <template v-else-if="column.key === 'method'">{{
            record.method === 'CASH' ? 'Tiền mặt' : 'Chuyển khoản'
          }}</template>
          <a-tag
            v-else-if="column.key === 'status'"
            :color="record.status === 'ACTIVE' ? 'green' : 'red'"
            >{{ record.status === 'ACTIVE' ? 'Có hiệu lực' : 'Đã hủy' }}</a-tag
          >
          <template v-else-if="column.key === 'warehouseId'">{{
            warehouses.warehouses.find((item) => item.id === record.warehouseId)?.name ??
            record.warehouseId
          }}</template>
          <template v-else-if="column.key === 'salesOrderId'">
            <a-button
              v-if="can('SALES_ORDER_VIEW')"
              type="link"
              @click="openSales(record.salesOrderId)"
              >{{ record.salesOrderId }}</a-button
            >
            <template v-else>{{ record.salesOrderId }}</template>
          </template>
          <a-space v-else-if="column.key === 'actions'">
            <a-button size="small" @click="show(record)">Chi tiết</a-button>
            <a-button
              v-if="record.status === 'ACTIVE' && can('PAYMENT_CANCEL')"
              size="small"
              danger
              @click="show(record, true)"
              >Hủy ghi nhận sai</a-button
            >
          </a-space>
        </template>
      </BasicTable>
    </template>
    <PaymentDetailDialog :id="detailId" v-model:open="detailOpen" :cancel="cancelMode" />
    <SalesOrderDialog
      v-if="salesOpen && can('SALES_ORDER_VIEW')"
      :id="salesId"
      v-model:open="salesOpen"
      mode="view"
    />
  </section>
</template>
<style scoped>
.filters {
  display: flex;
  gap: 12px;
  flex-wrap: wrap;
  margin: 16px 0;
}
.filters > * {
  min-width: 180px;
  max-width: 280px;
}
</style>
