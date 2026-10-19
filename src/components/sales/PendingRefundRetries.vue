<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { message } from 'ant-design-vue'
import { BasicTable } from '@/components'
import { usePaymentScope } from '@/composables/usePaymentScope'
import { useRefundsStore } from '@/stores/refunds'
import { returnError } from '@/utils/returns'
import { formatStockInteger } from '@/utils/stock'
import type { RefundAttempt } from '@/types/returns'
import type { NormalizedApiError } from '@/utils/request'
const { auth, can, inScope, contextKey, refreshAccess } = usePaymentScope()
const refunds = useRefundsStore()
const error = ref('')
const rows = computed(() =>
  can('REFUND_CREATE')
    ? Object.values(refunds.attempts).filter((attempt) => inScope(attempt.warehouseId))
    : [],
)
const columns = [
  ['salesOrderId', 'ID đơn'],
  ['warehouseId', 'ID kho'],
  ['key', 'Khóa request'],
  ['amount', 'Số tiền'],
  ['refundDate', 'Ngày hoàn'],
  ['method', 'Hình thức'],
  ['reference', 'Tham chiếu nguyên gốc'],
  ['reason', 'Lý do nguyên gốc'],
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
const retry = async (attempt: RefundAttempt): Promise<void> => {
  if (
    !can('REFUND_CREATE') ||
    !inScope(attempt.warehouseId) ||
    refunds.busy[attempt.salesOrderId] ||
    attempt.state === 'conflict'
  )
    return
  const user = auth.user?.id
  const current = sequence
  error.value = ''
  try {
    const result = await refunds.collect(attempt)
    if (!result || auth.user?.id !== user || current !== sequence) return
    if (result.refund.status === 'CANCELLED')
      message.info('Phiếu hoàn trước đã bị hủy. Không tạo lần chi mới hoặc phiếu thay thế.')
    else message.success('Đã xác định phiếu hoàn ' + result.refund.code + '.')
  } catch (cause) {
    if (auth.user?.id !== user || current !== sequence) return
    error.value = returnError(cause)
    if ((cause as NormalizedApiError).status === 403) await refreshAccess()
  }
}
</script>
<template>
  <section v-if="rows.length">
    <h3>Lần hoàn cần xác định kết quả</h3>
    <p>
      Request được lưu trong phiên theo người dùng và đơn. Chỉ thử lại đúng nội dung và khóa cũ, kể
      cả khi đơn không còn trong danh sách cần hoàn.
    </p>
    <a-alert v-if="error" type="error" :message="error" />
    <BasicTable :columns="columns" :data-source="rows" row-key="key" :scroll="{ x: 1500 }">
      <template #bodyCell="{ column, record }">
        <template v-if="column.key === 'amount'"
          >{{ formatStockInteger(record.input.amount) }} VND</template
        >
        <template v-else-if="column.key === 'refundDate'">{{ record.input.refundDate }}</template>
        <template v-else-if="column.key === 'method'">{{
          record.input.method === 'CASH' ? 'Tiền mặt' : 'Chuyển khoản'
        }}</template>
        <span
          v-else-if="column.key === 'reference' || column.key === 'note' || column.key === 'reason'"
          style="white-space: pre-wrap"
          >{{ record.input[column.key] ?? '—' }}</span
        >
        <template v-else-if="column.key === 'actions'">
          <a-tag v-if="record.state === 'conflict'" color="red"
            >Khóa xung đột — giữ request để kiểm tra</a-tag
          >
          <a-button v-else :loading="refunds.busy[record.salesOrderId]" @click="retry(record)"
            >Thử lại đúng request cũ</a-button
          >
        </template>
      </template>
    </BasicTable>
  </section>
</template>
