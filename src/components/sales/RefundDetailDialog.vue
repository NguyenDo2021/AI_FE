<script setup lang="ts">
import { onBeforeUnmount, ref, watch } from 'vue'
import { message } from 'ant-design-vue'
import { BasicModal } from '@/components'
import { getRefund, cancelRefund } from '@/api/sales/returns.api'
import { usePaymentScope } from '@/composables/usePaymentScope'
import { useRefundsStore } from '@/stores/refunds'
import { returnError, validReason } from '@/utils/returns'
import { formatStockInteger as fmt } from '@/utils/stock'
import { formatDateTime } from '@/utils/date'
import type { Refund } from '@/types/returns'
import type { NormalizedApiError } from '@/utils/request'
const props = defineProps<{ open: boolean; id?: string }>()
const emit = defineEmits<{ 'update:open': [value: boolean]; saved: [] }>()
const { can, inScope, contextKey, refreshAccess } = usePaymentScope()
const refunds = useRefundsStore()
const detail = ref<Refund>(),
  error = ref(''),
  reason = ref(''),
  cancelMode = ref(false),
  loading = ref(false),
  saving = ref(false)
let sequence = 0
const clear = (): void => {
  ++sequence
  detail.value = undefined
  reason.value = ''
  error.value = ''
  cancelMode.value = false
  loading.value = false
}
const load = async (): Promise<void> => {
  const current = ++sequence
  detail.value = undefined
  loading.value = false
  error.value = ''
  if (!props.id || !can('REFUND_VIEW')) return
  loading.value = true
  try {
    const result = await getRefund(props.id)
    if (current === sequence && inScope(result.warehouseId)) detail.value = result
  } catch (cause) {
    if (current === sequence) {
      error.value = returnError(cause)
      if ((cause as NormalizedApiError).status === 403) {
        clear()
        emit('update:open', false)
        await refreshAccess()
      }
    }
  } finally {
    if (current === sequence) loading.value = false
  }
}
const cancel = async (): Promise<void> => {
  const original = detail.value
  if (
    !props.open ||
    !original ||
    original.status !== 'ACTIVE' ||
    !can('REFUND_CANCEL') ||
    !inScope(original.warehouseId) ||
    saving.value
  )
    return
  if (!validReason(reason.value)) {
    error.value = 'Lý do bắt buộc, tối đa 2000 ký tự.'
    return
  }
  const current = sequence
  saving.value = true
  error.value = ''
  try {
    const result = await cancelRefund(original.id, reason.value)
    if (current !== sequence) return
    detail.value = result.refund
    refunds.record(result)
    cancelMode.value = false
    emit('saved')
    message.success('Đã hủy ghi nhận phiếu hoàn sai.')
  } catch (cause) {
    if (current !== sequence) return
    error.value = returnError(cause)
    const apiError = cause as NormalizedApiError
    if (apiError.status === 403) {
      clear()
      emit('update:open', false)
      await refreshAccess()
    } else if (!apiError.status || apiError.status === 408 || apiError.status >= 500) {
      try {
        const latest = await getRefund(original.id)
        if (current === sequence && inScope(latest.warehouseId)) {
          detail.value = latest
          error.value += ' Trạng thái hiện tại: ' + latest.status
          emit('saved')
        }
      } catch {
        if (current === sequence)
          error.value += ' Kết quả chưa xác định. Tải lại trước thao tác tiếp.'
      }
    }
  } finally {
    if (current === sequence) saving.value = false
  }
}
watch(
  () => [props.open, props.id],
  () => {
    clear()
    saving.value = false
    if (props.open) void load()
  },
  { immediate: true },
)
watch(
  contextKey,
  () => {
    clear()
    emit('update:open', false)
  },
  { flush: 'sync' },
)
onBeforeUnmount(() => ++sequence)
</script>
<template>
  <BasicModal
    :open="open"
    title="Chi tiết phiếu hoàn tiền"
    :width="850"
    @update:open="emit('update:open', false)"
  >
    <a-spin :spinning="loading"
      ><a-alert v-if="error" type="error" :message="error" />
      <a-descriptions v-if="detail" bordered :column="2">
        <a-descriptions-item label="Mã phiếu">{{ detail.code }}</a-descriptions-item>
        <a-descriptions-item label="Trạng thái">{{
          detail.status === 'ACTIVE' ? 'Hiệu lực' : 'Đã hủy'
        }}</a-descriptions-item>
        <a-descriptions-item label="Đơn nguồn">{{ detail.salesOrderId }}</a-descriptions-item>
        <a-descriptions-item label="Kho">{{ detail.warehouseId }}</a-descriptions-item>
        <a-descriptions-item label="Khách">{{
          detail.customerId ?? 'Khách lẻ'
        }}</a-descriptions-item>
        <a-descriptions-item label="Số tiền">{{ fmt(detail.amount) }} VND</a-descriptions-item>
        <a-descriptions-item label="Ngày hoàn">{{ detail.refundDate }}</a-descriptions-item>
        <a-descriptions-item label="Hình thức">{{
          detail.method === 'CASH' ? 'Tiền mặt' : 'Chuyển khoản'
        }}</a-descriptions-item>
        <a-descriptions-item label="Tham chiếu">{{ detail.reference ?? '—' }}</a-descriptions-item>
        <a-descriptions-item label="Lý do">{{ detail.reason }}</a-descriptions-item>
        <a-descriptions-item label="Ghi chú">{{ detail.note ?? '—' }}</a-descriptions-item>
        <a-descriptions-item label="Người tạo">{{ detail.createdBy }}</a-descriptions-item>
        <a-descriptions-item label="Thời gian tạo">{{
          formatDateTime(detail.createdAt)
        }}</a-descriptions-item>
        <a-descriptions-item v-if="detail.cancelledAt" label="Hủy"
          >{{ detail.cancelledBy }} / {{ formatDateTime(detail.cancelledAt) }}</a-descriptions-item
        >
        <a-descriptions-item v-if="detail.cancellationReason" label="Lý do hủy">{{
          detail.cancellationReason
        }}</a-descriptions-item>
      </a-descriptions>
      <template v-if="cancelMode"
        ><a-alert
          type="warning"
          message="Hủy ghi nhận sai, không ghi nhận việc thu lại tiền từ khách." /><a-textarea
          v-model:value="reason"
          :maxlength="2000"
          placeholder="Lý do hủy ghi nhận sai"
          :disabled="saving"
      /></template>
    </a-spin>
    <template #footer
      ><a-button :disabled="saving" @click="emit('update:open', false)">Đóng</a-button
      ><a-button :disabled="saving || loading" @click="load">Tải lại</a-button
      ><a-button
        v-if="detail?.status === 'ACTIVE' && can('REFUND_CANCEL')"
        danger
        :loading="saving"
        @click="cancelMode ? cancel() : (cancelMode = true)"
        >{{ cancelMode ? 'Xác nhận hủy ghi nhận' : 'Hủy ghi nhận sai' }}</a-button
      ></template
    >
  </BasicModal>
</template>
