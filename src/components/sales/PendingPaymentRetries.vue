<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { message } from 'ant-design-vue'
import { BasicTable } from '@/components'
import { usePaymentScope } from '@/composables/usePaymentScope'
import { usePaymentsStore } from '@/stores/payments'
import { paymentError } from '@/utils/payments'
import { formatStockInteger } from '@/utils/stock'
import type { PaymentAttempt } from '@/types/payments'
import type { NormalizedApiError } from '@/utils/request'
const { auth, can, inScope, contextKey, refreshAccess } = usePaymentScope()
const payments = usePaymentsStore()
const error = ref('')
const rows = computed(() =>
  can('PAYMENT_CREATE')
    ? Object.values(payments.attempts).filter((attempt) => inScope(attempt.warehouseId))
    : [],
)
const columns = [
  ['salesOrderId', 'ID đơn'],
  ['warehouseId', 'ID kho'],
  ['key', 'Khóa request'],
  ['amount', 'Số tiền'],
  ['paymentDate', 'Ngày thu'],
  ['method', 'Hình thức'],
  ['reference', 'Tham chiếu nguyên gốc'],
  ['note', 'Ghi chú nguyên gốc'],
  ['actions', 'Thao tác'],
].map(([key, title]) => ({ key, dataIndex: key, title }))
let sequence = 0
watch(
  contextKey,
  () => {
    ++sequence
    error.value = ''
  },
  { flush: 'sync' },
)
const retry = async (attempt: PaymentAttempt): Promise<void> => {
  if (
    !can('PAYMENT_CREATE') ||
    !inScope(attempt.warehouseId) ||
    payments.busy[attempt.salesOrderId] ||
    attempt.state === 'conflict'
  )
    return
  const user = auth.user?.id
  const current = sequence
  error.value = ''
  try {
    const result = await payments.collect(attempt)
    if (!result || auth.user?.id !== user || current !== sequence) return
    if (result.payment.status === 'CANCELLED')
      message.info(
        'Lần thu trước đã bị hủy. Đã cập nhật số tiền hiện tại; không tạo khoản thu mới.',
      )
    else message.success('Đã xác định phiếu thu ' + result.payment.code + '.')
  } catch (cause) {
    if (auth.user?.id !== user || current !== sequence) return
    error.value = paymentError(cause)
    if ((cause as NormalizedApiError).status === 403) await refreshAccess()
  }
}
</script>
<template>
  <section v-if="rows.length">
    <h3>Lần thu cần xác định kết quả</h3>
    <p>
      Request được lưu trong phiên theo người dùng và đơn. Chỉ thử lại đúng nội dung và khóa cũ, kể
      cả khi đơn không còn trong danh sách công nợ.
    </p>
    <a-alert v-if="error" type="error" :message="error" />
    <BasicTable :columns="columns" :data-source="rows" row-key="key" :scroll="{ x: 1500 }">
      <template #bodyCell="{ column, record }">
        <template v-if="column.key === 'amount'"
          >{{ formatStockInteger(record.input.amount) }} VND</template
        >
        <template v-else-if="column.key === 'paymentDate'">{{ record.input.paymentDate }}</template>
        <template v-else-if="column.key === 'method'">{{
          record.input.method === 'CASH' ? 'Tiền mặt' : 'Chuyển khoản'
        }}</template>
        <span
          v-else-if="column.key === 'reference' || column.key === 'note'"
          style="white-space: pre-wrap"
          >{{ record.input[column.key] ?? '—' }}</span
        >
        <template v-else-if="column.key === 'actions'">
          <a-tag v-if="record.state === 'conflict'" color="red"
            >Khóa xung đột — giữ request để kiểm tra</a-tag
          >
          <a-button v-else :loading="payments.busy[record.salesOrderId]" @click="retry(record)"
            >Thử lại đúng request cũ</a-button
          >
        </template>
      </template>
    </BasicTable>
  </section>
</template>
