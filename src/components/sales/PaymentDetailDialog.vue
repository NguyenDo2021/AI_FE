<script setup lang="ts">
import { ref, watch, onBeforeUnmount } from 'vue'
import { message } from 'ant-design-vue'
import { BasicModal } from '@/components'
import { getPayment, cancelPayment } from '@/api/payments/payments.api'
import { usePaymentScope } from '@/composables/usePaymentScope'
import { usePaymentsStore } from '@/stores/payments'
import { paymentError } from '@/utils/payments'
import { formatStockInteger, stockFieldErrors } from '@/utils/stock'
import { formatDateTime } from '@/utils/date'
import type { Payment } from '@/types/payments'
import type { NormalizedApiError } from '@/utils/request'
const props = defineProps<{ open: boolean; id?: string; cancel?: boolean }>()
const emit = defineEmits<{ 'update:open': [value: boolean] }>()
const { can, inScope, contextKey, refreshAccess } = usePaymentScope()
const payments = usePaymentsStore()
const detail = ref<Payment>()
const loading = ref(false)
const saving = ref(false)
const error = ref('')
const fields = ref<Record<string, string>>({})
const cancelling = ref(false)
const reason = ref('')
let sequence = 0
const load = async (): Promise<void> => {
  const current = ++sequence
  detail.value = undefined
  error.value = ''
  loading.value = false
  if (!props.open || !props.id || !can('PAYMENT_VIEW')) return
  loading.value = true
  try {
    const result = await getPayment(props.id)
    if (current === sequence && inScope(result.warehouseId)) detail.value = result
  } catch (cause) {
    if (current === sequence) error.value = paymentError(cause)
    if ((cause as NormalizedApiError).status === 403) await refreshAccess()
  } finally {
    if (current === sequence) loading.value = false
  }
}
watch(
  () => [props.open, props.id],
  () => {
    reason.value = ''
    fields.value = {}
    cancelling.value = !!props.cancel
    void load()
  },
  { immediate: true },
)
watch(
  contextKey,
  () => {
    ++sequence
    detail.value = undefined
    reason.value = ''
    emit('update:open', false)
  },
  { flush: 'sync' },
)
onBeforeUnmount(() => ++sequence)
const submit = async (): Promise<void> => {
  const original = detail.value
  if (
    saving.value ||
    !original ||
    original.status !== 'ACTIVE' ||
    !can('PAYMENT_CANCEL') ||
    !inScope(original.warehouseId)
  )
    return
  fields.value = {}
  if (!reason.value.trim() || reason.value.trim().length > 2000) {
    fields.value.reason = 'Lý do bắt buộc, tối đa 2000 ký tự.'
    return
  }
  saving.value = true
  error.value = ''
  const current = sequence
  try {
    const result = await cancelPayment(original.id, reason.value)
    if (current !== sequence) return
    detail.value = result.payment
    payments.record(result)
    cancelling.value = false
    message.success('Đã hủy ghi nhận phiếu thu. Số tiền được cập nhật theo backend.')
  } catch (cause) {
    if (current !== sequence) return
    error.value = paymentError(cause)
    fields.value = stockFieldErrors(cause)
    const status = (cause as NormalizedApiError).status
    if (!status || status >= 500 || status === 408)
      error.value +=
        ' Chưa xác định kết quả. Có thể thử lại hủy với cùng lý do; backend không đảo tiền thêm.'
    if (status === 403) await refreshAccess()
  } finally {
    saving.value = false
  }
}
</script>
<template>
  <BasicModal
    :open="open"
    title="Chi tiết phiếu thu"
    :width="800"
    :confirm-loading="saving"
    @update:open="emit('update:open', false)"
  >
    <a-spin :spinning="loading">
      <a-alert v-if="error" type="error" :message="error" />
      <a-descriptions v-if="detail" bordered :column="2">
        <a-descriptions-item label="Mã phiếu">{{ detail.code }}</a-descriptions-item>
        <a-descriptions-item label="ID phiếu">{{ detail.id }}</a-descriptions-item>
        <a-descriptions-item label="Ngày thu">{{ detail.paymentDate }}</a-descriptions-item>
        <a-descriptions-item label="Số tiền"
          >{{ formatStockInteger(detail.amount) }} VND</a-descriptions-item
        >
        <a-descriptions-item label="Hình thức">{{
          detail.method === 'CASH' ? 'Tiền mặt' : 'Chuyển khoản'
        }}</a-descriptions-item>
        <a-descriptions-item label="Trạng thái">{{
          detail.status === 'ACTIVE' ? 'Có hiệu lực' : 'Đã hủy'
        }}</a-descriptions-item>
        <a-descriptions-item label="ID kho">{{ detail.warehouseId }}</a-descriptions-item>
        <a-descriptions-item label="ID đơn nguồn">{{ detail.salesOrderId }}</a-descriptions-item>
        <a-descriptions-item label="ID khách">{{
          detail.customerId ?? 'Khách lẻ'
        }}</a-descriptions-item>
        <a-descriptions-item label="Tham chiếu">{{ detail.reference ?? '—' }}</a-descriptions-item>
        <a-descriptions-item label="Ghi chú" :span="2">{{
          detail.note ?? '—'
        }}</a-descriptions-item>
        <a-descriptions-item label="ID người tạo">{{ detail.createdBy }}</a-descriptions-item>
        <a-descriptions-item label="Thời gian tạo">{{
          formatDateTime(detail.createdAt)
        }}</a-descriptions-item>
        <template v-if="detail.status === 'CANCELLED'">
          <a-descriptions-item label="ID người hủy">{{
            detail.cancelledBy ?? '—'
          }}</a-descriptions-item>
          <a-descriptions-item label="Thời gian hủy">{{
            detail.cancelledAt ? formatDateTime(detail.cancelledAt) : '—'
          }}</a-descriptions-item>
          <a-descriptions-item label="Lý do hủy" :span="2">{{
            detail.cancellationReason ?? '—'
          }}</a-descriptions-item>
        </template>
      </a-descriptions>
      <template v-if="cancelling && detail?.status === 'ACTIVE' && can('PAYMENT_CANCEL')">
        <a-alert
          type="warning"
          message="Chỉ hủy để đảo ghi nhận sai. Đây không phải hoàn tiền cho khách."
        />
        <a-form-item label="Lý do hủy" required :help="fields.reason"
          ><a-textarea v-model:value="reason" :maxlength="2000" :disabled="saving"
        /></a-form-item>
      </template>
    </a-spin>
    <template #footer>
      <a-button :disabled="saving" @click="emit('update:open', false)">Đóng</a-button>
      <a-button :disabled="saving || loading" @click="load">Tải lại phiếu</a-button>
      <a-button
        v-if="detail?.status === 'ACTIVE' && can('PAYMENT_CANCEL')"
        danger
        :loading="saving"
        @click="cancelling ? submit() : (cancelling = true)"
        >{{ cancelling ? 'Xác nhận hủy ghi nhận sai' : 'Hủy phiếu thu' }}</a-button
      >
    </template>
  </BasicModal>
</template>
