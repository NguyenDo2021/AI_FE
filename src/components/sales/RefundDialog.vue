<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import { message } from 'ant-design-vue'
import { BasicModal } from '@/components'
import SettlementDetails from './SettlementDetails.vue'
import { usePaymentScope } from '@/composables/usePaymentScope'
import { usePaymentsStore } from '@/stores/payments'
import { useRefundsStore } from '@/stores/refunds'
import { todayLocal, validateRefund, refundInput, returnError } from '@/utils/returns'
import { stockFieldErrors } from '@/utils/stock'
import type { OrderSettlementSummary, RefundForm, RefundAttempt } from '@/types/returns'
import type { NormalizedApiError } from '@/utils/request'
const props = defineProps<{ open: boolean; order: OrderSettlementSummary }>()
const emit = defineEmits<{
  'update:open': [value: boolean]
  updated: [value: OrderSettlementSummary]
  refreshRequested: []
}>()
const { can, inScope, contextKey, refreshAccess } = usePaymentScope()
const refunds = useRefundsStore(),
  payments = usePaymentsStore()
const empty = (): RefundForm => ({
  amount: '',
  refundDate: todayLocal(),
  method: 'CASH',
  reference: '',
  reason: '',
  note: '',
})
const form = ref<RefundForm>(empty()),
  confirmed = ref(false),
  error = ref(''),
  fields = ref<Record<string, string>>({})
const current = computed(() => ({
  ...props.order,
  ...payments.summaries[props.order.salesOrderId],
}))
const attempt = computed(() => refunds.attempts[props.order.salesOrderId])
const busy = computed(() => !!refunds.busy[props.order.salesOrderId])
const allowed = computed(() => can('REFUND_CREATE') && inScope(props.order.warehouseId))
let sequence = 0
watch(
  () => [props.open, props.order.salesOrderId],
  () => {
    ++sequence
    form.value = empty()
    confirmed.value = false
    error.value = ''
    fields.value = {}
    const pending = attempt.value
    if (props.open && pending)
      form.value = {
        ...pending.input,
        amount: String(pending.input.amount),
        reference: pending.input.reference ?? '',
        note: pending.input.note ?? '',
      }
  },
  { immediate: true },
)
watch(
  contextKey,
  () => {
    ++sequence
    form.value = empty()
    confirmed.value = false
    fields.value = {}
    error.value = ''
    emit('update:open', false)
  },
  { flush: 'sync' },
)
onBeforeUnmount(() => ++sequence)
const submit = async (): Promise<void> => {
  if (!props.open || !allowed.value || busy.value || attempt.value?.state === 'conflict') return
  const previous = attempt.value
  if (!previous) {
    if (current.value.status !== 'CONFIRMED' || BigInt(current.value.refundableAmount) <= 0n) {
      error.value = 'Đơn không còn khoản cần hoàn.'
      return
    }
    fields.value = validateRefund(form.value, current.value)
    if (!confirmed.value) fields.value.confirmed = 'Cần xác nhận đã thực tế chi tiền cho khách.'
    if (Object.keys(fields.value).length) return
  }
  const frozen: RefundAttempt = previous ?? {
    key: crypto.randomUUID(),
    salesOrderId: current.value.salesOrderId,
    warehouseId: current.value.warehouseId,
    input: refundInput(form.value),
    state: 'uncertain',
  }
  const version = sequence
  error.value = ''
  try {
    const result = await refunds.collect(frozen)
    if (!result || version !== sequence) return
    emit('updated', result.order)
    if (result.refund.status === 'CANCELLED')
      message.info(
        'Phiếu hoàn trước đã bị hủy. Không tạo phiếu thay thế và không ghi nhận lần chi mới.',
      )
    else
      message.success(
        (previous ? 'Đã xác định phiếu hoàn ' : 'Đã ghi nhận phiếu hoàn ') + result.refund.code,
      )
    emit('update:open', false)
  } catch (cause) {
    if (version !== sequence) return
    error.value = returnError(cause)
    fields.value = stockFieldErrors(cause)
    if (attempt.value) error.value += ' Giữ nguyên khóa, đơn và payload; nội dung đã khóa.'
    const apiError = cause as NormalizedApiError
    if (apiError.status === 403) {
      form.value = empty()
      emit('update:open', false)
      await refreshAccess()
    } else if (
      apiError.code === 'REFUND_EXCEEDS_REFUNDABLE' ||
      apiError.code === 'INVALID_SALES_ORDER_STATUS'
    )
      emit('refreshRequested')
  }
}
</script>
<template>
  <BasicModal
    :open="open"
    title="Ghi nhận hoàn tiền"
    :width="850"
    @update:open="emit('update:open', false)"
  >
    <template v-if="allowed">
      <a-alert v-if="error" type="error" :message="error" />
      <p>
        Đơn {{ current.code || current.salesOrderId }} ·
        {{ current.customerSnapshot?.name ?? current.customerId ?? 'Khách lẻ' }}
      </p>
      <SettlementDetails :settlement="current" />
      <a-alert
        type="info"
        message="Ghi nhận khoản tiền đã thực tế chi cho khách. Đây không phải chuyển khoản ngân hàng tự động."
      />
      <a-alert
        v-if="attempt"
        type="warning"
        :message="
          attempt.state === 'conflict'
            ? 'Khóa xung đột. Giữ request để kiểm tra, không tự tạo khóa khác.'
            : 'Lần chi chưa xác định kết quả. Chỉ thử lại đúng khóa và request cũ; không chi thêm tiền.'
        "
      />
      <a-form layout="vertical" :disabled="busy || !!attempt">
        <a-form-item label="Số tiền hoàn (VND)" required :help="fields.amount"
          ><a-input v-model:value="form.amount" inputmode="numeric" /><a-button
            :disabled="busy || !!attempt"
            @click="form.amount = String(current.refundableAmount)"
            >Điền khoản cần hoàn</a-button
          ></a-form-item
        >
        <a-form-item label="Ngày hoàn" required :help="fields.refundDate"
          ><a-date-picker v-model:value="form.refundDate" value-format="YYYY-MM-DD"
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
        <a-form-item label="Lý do" required :help="fields.reason"
          ><a-textarea v-model:value="form.reason" :maxlength="2000"
        /></a-form-item>
        <a-form-item label="Ghi chú" :help="fields.note"
          ><a-textarea v-model:value="form.note" :maxlength="2000"
        /></a-form-item>
        <a-form-item :help="fields.confirmed"
          ><a-checkbox v-model:checked="confirmed" :disabled="busy || !!attempt"
            >Tôi xác nhận khoản tiền này đã thực tế chi cho khách.</a-checkbox
          ></a-form-item
        >
      </a-form>
    </template>
    <template #footer
      ><a-button :disabled="busy" @click="emit('update:open', false)">Đóng</a-button
      ><a-button
        type="primary"
        :loading="busy"
        :disabled="!allowed || attempt?.state === 'conflict' || (!attempt && !confirmed)"
        @click="submit"
        >{{ attempt ? 'Thử lại đúng request cũ' : 'Ghi nhận khoản đã chi' }}</a-button
      ></template
    >
  </BasicModal>
</template>
