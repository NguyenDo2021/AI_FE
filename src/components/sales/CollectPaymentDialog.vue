<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { message } from 'ant-design-vue'
import { BasicModal } from '@/components'
import { usePaymentScope } from '@/composables/usePaymentScope'
import { usePaymentsStore } from '@/stores/payments'
import { getSalesOrder } from '@/api/sales/sales.api'
import {
  canCollect,
  validatePayment,
  paymentInput,
  paymentError,
  applyPaymentSummary,
} from '@/utils/payments'
import { formatStockInteger, stockFieldErrors } from '@/utils/stock'
import type { SalesOrder } from '@/types/sales'
import type { PaymentForm, PaymentAttempt } from '@/types/payments'
import type { NormalizedApiError } from '@/utils/request'
const props = defineProps<{ open: boolean; order: SalesOrder }>()
const emit = defineEmits<{
  'update:open': [value: boolean]
  updated: [order: SalesOrder]
  refreshRequested: []
}>()
const { can, auth, inScope, contextKey, refreshAccess } = usePaymentScope()
const payments = usePaymentsStore()
const detail = ref(props.order)
const empty = (): PaymentForm => ({
  amount: '',
  paymentDate: new Intl.DateTimeFormat('sv-SE', { timeZone: 'Asia/Bangkok' }).format(new Date()),
  method: 'CASH',
  reference: '',
  note: '',
})
const form = ref<PaymentForm>(empty())
const error = ref('')
const fields = ref<Record<string, string>>({})
const attempt = computed(() => payments.attempts[props.order.id])
const saving = computed(() => !!payments.busy[props.order.id])
const allowed = computed(() => can('PAYMENT_CREATE') && inScope(props.order.warehouseId))
let sequence = 0
watch(
  () => [props.open, props.order.id],
  () => {
    ++sequence
    if (!props.open) return
    detail.value = props.order
    fields.value = {}
    error.value = ''
    const pending = attempt.value
    form.value = pending
      ? {
          ...pending.input,
          amount: String(pending.input.amount),
          reference: pending.input.reference ?? '',
          note: pending.input.note ?? '',
        }
      : empty()
  },
  { immediate: true },
)
watch(
  contextKey,
  () => {
    ++sequence
    error.value = ''
    fields.value = {}
    form.value = empty()
    emit('update:open', false)
  },
  { flush: 'sync' },
)
watch(
  () => payments.summaries[props.order.id],
  (summary) => {
    if (summary && props.open) detail.value = applyPaymentSummary(detail.value, summary)
  },
  { flush: 'sync' },
)
const submit = async (): Promise<void> => {
  if (saving.value || !allowed.value || attempt.value?.state === 'conflict') return
  const previous = attempt.value
  if (!previous) {
    if (!canCollect(detail.value)) {
      error.value = 'Đơn không còn được phép thu tiền.'
      return
    }
    fields.value = validatePayment(form.value, detail.value)
    if (Object.keys(fields.value).length) return
  }
  const frozen: PaymentAttempt = previous ?? {
    key: crypto.randomUUID(),
    salesOrderId: detail.value.id,
    warehouseId: detail.value.warehouseId,
    input: paymentInput(form.value),
    state: 'uncertain',
  }
  const current = sequence
  const user = auth.user?.id
  error.value = ''
  try {
    const result = await payments.collect(frozen)
    if (!result || current !== sequence || auth.user?.id !== user) return
    detail.value = applyPaymentSummary(detail.value, result.order)
    emit('updated', detail.value)
    if (result.payment.status === 'CANCELLED')
      message.info(
        'Lần thu trước đã bị hủy. Đã cập nhật số tiền hiện tại; không tạo khoản thu mới.',
      )
    else
      message.success(
        previous
          ? 'Đã xác định phiếu thu ' + result.payment.code + '.'
          : 'Đã ghi nhận phiếu thu ' + result.payment.code + '.',
      )
    emit('update:open', false)
  } catch (cause) {
    if (current !== sequence || auth.user?.id !== user) return
    const apiError = cause as NormalizedApiError
    error.value = paymentError(cause)
    fields.value = stockFieldErrors(cause)
    if (attempt.value?.state === 'uncertain')
      error.value += ' Kết quả chưa xác định. Chỉ thử lại đúng request đã lưu.'
    if (apiError.status === 403) {
      await refreshAccess()
      return
    }
    if (
      ['PAYMENT_EXCEEDS_REMAINING', 'INVALID_SALES_ORDER_STATUS'].includes(apiError.code ?? '') &&
      can('RECEIVABLE_VIEW')
    )
      emit('refreshRequested')
    if (
      ['PAYMENT_EXCEEDS_REMAINING', 'INVALID_SALES_ORDER_STATUS'].includes(apiError.code ?? '') &&
      can('SALES_ORDER_VIEW')
    ) {
      try {
        const latest = await getSalesOrder(props.order.id)
        if (current === sequence && inScope(latest.warehouseId)) {
          detail.value = latest
          payments.syncOrders([latest])
          emit('updated', latest)
        }
      } catch (reloadCause) {
        if (current === sequence)
          error.value += ' Không tải được số liệu mới: ' + paymentError(reloadCause)
        if ((reloadCause as NormalizedApiError).status === 403) await refreshAccess()
      }
    }
  }
}
</script>
<template>
  <BasicModal
    :open="open"
    title="Thu tiền đơn bán"
    :confirm-loading="saving"
    @update:open="emit('update:open', false)"
  >
    <a-alert v-if="error" type="error" :message="error" />
    <a-descriptions bordered :column="1">
      <a-descriptions-item label="Đơn">{{ detail.code || detail.id }}</a-descriptions-item>
      <a-descriptions-item label="Tổng tiền đơn"
        >{{ formatStockInteger(detail.totalAmount) }} VND</a-descriptions-item
      >
      <a-descriptions-item label="Đã thu"
        >{{ formatStockInteger(detail.paidAmount ?? 0) }} VND</a-descriptions-item
      >
      <a-descriptions-item label="Còn phải trả (tham khảo)"
        >{{ formatStockInteger(detail.remainingAmount ?? 0) }} VND</a-descriptions-item
      >
    </a-descriptions>
    <a-alert
      v-if="attempt"
      type="warning"
      :message="
        attempt.state === 'conflict'
          ? 'Khóa bị xung đột. Giữ request để kiểm tra, không tạo khóa thay thế.'
          : 'Có lần thu chưa xác định. Nội dung đã khóa; thử lại dùng nguyên khóa và request cũ.'
      "
    />
    <p>Ghi nhận thanh toán thủ công. Chuyển khoản chưa được ngân hàng xác minh.</p>
    <a-form layout="vertical" :disabled="saving || !!attempt || !allowed">
      <a-form-item
        label="Số tiền (VND)"
        required
        :help="fields.amount"
        :validate-status="fields.amount ? 'error' : undefined"
      >
        <a-input v-model:value="form.amount" inputmode="numeric" />
        <a-button
          :disabled="saving || !!attempt || !allowed"
          @click="form.amount = String(detail.remainingAmount ?? 0)"
          >Điền số tiền còn lại</a-button
        >
      </a-form-item>
      <a-form-item label="Ngày thu" required :help="fields.paymentDate"
        ><a-date-picker v-model:value="form.paymentDate" value-format="YYYY-MM-DD"
      /></a-form-item>
      <a-form-item label="Hình thức" required :help="fields.method"
        ><a-select
          v-model:value="form.method"
          :options="[
            { value: 'CASH', label: 'Tiền mặt' },
            { value: 'BANK_TRANSFER', label: 'Chuyển khoản' },
          ]"
      /></a-form-item>
      <a-form-item label="Tham chiếu" :help="fields.reference"
        ><a-input v-model:value="form.reference" :maxlength="200"
      /></a-form-item>
      <a-form-item label="Ghi chú" :help="fields.note"
        ><a-textarea v-model:value="form.note" :maxlength="2000"
      /></a-form-item>
    </a-form>
    <template #footer>
      <a-button :disabled="saving" @click="emit('update:open', false)">Đóng</a-button>
      <a-button
        type="primary"
        :loading="saving"
        :disabled="!allowed || attempt?.state === 'conflict' || (!attempt && !canCollect(detail))"
        @click="submit"
        >{{ attempt ? 'Thử lại đúng request cũ' : 'Ghi nhận thu tiền' }}</a-button
      >
    </template>
  </BasicModal>
</template>
