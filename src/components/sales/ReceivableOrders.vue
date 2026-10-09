<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { BasicTable, BasicModal } from '@/components'
import OrderPaymentPanel from './OrderPaymentPanel.vue'
import CollectPaymentDialog from './CollectPaymentDialog.vue'
import { usePaymentScope } from '@/composables/usePaymentScope'
import { usePaymentsStore } from '@/stores/payments'
import { applyPaymentSummary, canCollect, paymentLabel } from '@/utils/payments'
import { formatStockInteger } from '@/utils/stock'
import { formatDateTime } from '@/utils/date'
import type { SalesOrder } from '@/types/sales'
const props = defineProps<{
  rows: SalesOrder[]
  loading: boolean
  page: number
  pageSize: number
  total: number
}>()
const emit = defineEmits<{ reload: []; pageChange: [page: number, pageSize: number] }>()
const { can, inScope, contextKey } = usePaymentScope()
const payments = usePaymentsStore()
const selected = ref<SalesOrder>()
const open = ref(false)
const collectOrder = ref<SalesOrder>()
const collectOpen = ref(false)
const current = (order: SalesOrder): SalesOrder =>
  payments.summaries[order.id] ? applyPaymentSummary(order, payments.summaries[order.id]!) : order
const rows = computed(() => props.rows.filter((order) => inScope(order.warehouseId)).map(current))
const detail = computed(() => (selected.value ? current(selected.value) : undefined))
const columns = [
  ['code', 'Mã đơn'],
  ['saleDate', 'Ngày bán'],
  ['totalAmount', 'Tổng tiền đơn'],
  ['paidAmount', 'Đã thu'],
  ['remainingAmount', 'Còn phải trả'],
  ['paymentStatus', 'Thanh toán'],
  ['actions', 'Thao tác'],
].map(([key, title]) => ({ key, dataIndex: key, title }))
const lineColumns = [
  ['productCode', 'Mã sản phẩm'],
  ['productName', 'Sản phẩm'],
  ['quantity', 'Số lượng'],
  ['unitPrice', 'Đơn giá'],
  ['lineTotal', 'Thành tiền'],
].map(([key, title]) => ({ key, dataIndex: key, title }))
const pagination = computed(() => ({
  current: props.page,
  pageSize: props.pageSize,
  total: props.total,
  showSizeChanger: true,
  pageSizeOptions: ['1', '10', '20', '50', '100'],
}))
watch(
  contextKey,
  () => {
    open.value = false
    collectOpen.value = false
    selected.value = undefined
    collectOrder.value = undefined
  },
  { flush: 'sync' },
)
const showDetail = (order: SalesOrder): void => {
  selected.value = order
  open.value = true
}
const showCollect = (order: SalesOrder): void => {
  collectOrder.value = order
  collectOpen.value = true
}
</script>
<template>
  <BasicTable
    :columns="columns"
    :data-source="rows"
    :loading="loading"
    :pagination="pagination"
    :scroll="{ x: 1000 }"
    @reload="emit('reload')"
    @page-change="(page, size) => emit('pageChange', page, size)"
  >
    <template #bodyCell="{ column, record }">
      <template v-if="['totalAmount', 'paidAmount', 'remainingAmount'].includes(String(column.key))"
        >{{ formatStockInteger(record[column.key] ?? 0) }} VND</template
      >
      <template v-else-if="column.key === 'paymentStatus'">{{ paymentLabel(record) }}</template>
      <a-space v-else-if="column.key === 'actions'">
        <a-button size="small" @click="showDetail(record)">Chi tiết</a-button>
        <a-button
          v-if="can('PAYMENT_CREATE') && (canCollect(record) || payments.attempts[record.id])"
          size="small"
          type="primary"
          @click="showCollect(record)"
          >{{ payments.attempts[record.id] ? 'Thử lại lần thu' : 'Thu tiền' }}</a-button
        >
      </a-space>
    </template>
  </BasicTable>
  <BasicModal :open="open" title="Chi tiết đơn còn nợ" :width="1100" @update:open="open = false">
    <template v-if="detail && can('RECEIVABLE_VIEW')">
      <a-descriptions bordered :column="2">
        <a-descriptions-item label="Đơn">{{ detail.code || detail.id }}</a-descriptions-item>
        <a-descriptions-item label="Ngày bán">{{ detail.saleDate }}</a-descriptions-item>
        <a-descriptions-item label="Khách">{{
          detail.customerSnapshot?.name ?? detail.customerId ?? 'Khách lẻ'
        }}</a-descriptions-item>
        <a-descriptions-item label="ID kho">{{ detail.warehouseId }}</a-descriptions-item>
        <a-descriptions-item label="Ghi chú">{{ detail.note ?? '—' }}</a-descriptions-item>
        <a-descriptions-item label="Tạo lúc / ID người tạo"
          >{{ formatDateTime(detail.createdAt) }} / {{ detail.createdBy }}</a-descriptions-item
        >
        <a-descriptions-item label="Xác nhận lúc / ID người xác nhận"
          >{{ detail.confirmedAt ? formatDateTime(detail.confirmedAt) : '—' }} /
          {{ detail.confirmedBy ?? '—' }}</a-descriptions-item
        >
      </a-descriptions>
      <BasicTable
        :columns="lineColumns"
        :data-source="detail.lines"
        row-key="productId"
        @reload="emit('reload')"
      >
        <template #bodyCell="{ column, record }"
          ><template v-if="['quantity', 'unitPrice', 'lineTotal'].includes(String(column.key))">{{
            formatStockInteger(record[column.key])
          }}</template></template
        >
      </BasicTable>
      <OrderPaymentPanel
        :order="detail"
        @updated="selected = $event"
        @refresh-requested="emit('reload')"
      />
    </template>
    <template #footer><a-button @click="open = false">Đóng</a-button></template>
  </BasicModal>
  <CollectPaymentDialog
    v-if="collectOrder"
    v-model:open="collectOpen"
    :order="collectOrder"
    @updated="collectOrder = $event"
    @refresh-requested="emit('reload')"
  />
</template>
