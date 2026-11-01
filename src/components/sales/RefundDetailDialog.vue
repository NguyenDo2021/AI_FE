<script setup lang="ts">
import { onBeforeUnmount, ref, watch } from 'vue'
import { message } from 'ant-design-vue'
import ReturnRefundDialog from './ReturnRefundDialog.vue'
import SettlementAmountSummary from './SettlementAmountSummary.vue'
import RefundCancelDialog from './RefundCancelDialog.vue'
import { getRefund, cancelRefund } from '@/api/sales/returns.api'
import { usePaymentScope } from '@/composables/usePaymentScope'
import { useRefundsStore } from '@/stores/refunds'
import { returnError, validReason } from '@/utils/returns'
import { formatDate, formatDateTime } from '@/utils/date'
import type { Refund } from '@/types/returns'
import type { NormalizedApiError } from '@/utils/request'
const props = defineProps<{ open: boolean; id?: string }>()
const emit = defineEmits<{ 'update:open': [value: boolean]; saved: [] }>()
const { can, inScope, contextKey, refreshAccess, warehouses } = usePaymentScope()
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
  if (!props.open || !props.id || !can('REFUND_VIEW')) return
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
        await refreshAccess(cause)
      }
    }
  } finally {
    if (current === sequence) loading.value = false
  }
}
const openCancel = (): void => {
  if (saving.value || loading.value || detail.value?.status !== 'ACTIVE' || !can('REFUND_CANCEL'))
    return
  reason.value = ''
  error.value = ''
  cancelMode.value = true
}
const closeCancel = (): void => {
  if (saving.value) return
  cancelMode.value = false
  error.value = ''
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
      await refreshAccess(cause)
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
  <ReturnRefundDialog
    :open="open && !cancelMode"
    instant
    title="Chi tiết phiếu hoàn tiền"
    :width="850"
    :saving="saving"
    @update:open="emit('update:open', false)"
  >
    <a-spin :spinning="loading">
      <a-alert v-if="error" type="error" :message="error" show-icon />
      <template v-if="detail">
        <SettlementAmountSummary :code="detail.code" label="Số tiền hoàn" :amount="detail.amount">
          <template #status
            ><a-tag :color="detail.status === 'ACTIVE' ? 'green' : 'red'">{{
              detail.status === 'ACTIVE' ? 'Hiệu lực' : 'Đã hủy'
            }}</a-tag></template
          >
        </SettlementAmountSummary>
        <dl class="rr-info">
          <div>
            <dt>Đơn nguồn</dt>
            <dd>{{ detail.salesOrderId }}</dd>
          </div>
          <div>
            <dt>Tham chiếu</dt>
            <dd>{{ detail.reference ?? '—' }}</dd>
          </div>
          <div>
            <dt>Khách hàng</dt>
            <dd>{{ detail.customerId ?? 'Khách lẻ' }}</dd>
          </div>
          <div>
            <dt>Lý do</dt>
            <dd>{{ detail.reason }}</dd>
          </div>
          <div>
            <dt>Kho</dt>
            <dd>
              {{
                warehouses.warehouses.find((w) => w.id === detail?.warehouseId)?.name ??
                detail.warehouseId
              }}
            </dd>
          </div>
          <div>
            <dt>Ghi chú</dt>
            <dd>{{ detail.note ?? '—' }}</dd>
          </div>
          <div>
            <dt>Ngày hoàn</dt>
            <dd>{{ formatDate(detail.refundDate) }}</dd>
          </div>
          <div>
            <dt>Người tạo</dt>
            <dd>{{ detail.createdBy }}</dd>
          </div>
          <div>
            <dt>Hình thức</dt>
            <dd>{{ detail.method === 'CASH' ? 'Tiền mặt' : 'Chuyển khoản' }}</dd>
          </div>
          <div>
            <dt>Thời gian tạo</dt>
            <dd>{{ formatDateTime(detail.createdAt) }}</dd>
          </div>
        </dl>
        <section v-if="detail.status === 'CANCELLED'" class="refund-cancellation">
          <h3 class="rr-section-title">Thông tin hủy ghi nhận</h3>
          <dl class="rr-info">
            <div>
              <dt>Người hủy</dt>
              <dd>{{ detail.cancelledBy ?? '—' }}</dd>
            </div>
            <div>
              <dt>Thời gian hủy</dt>
              <dd>{{ detail.cancelledAt ? formatDateTime(detail.cancelledAt) : '—' }}</dd>
            </div>
            <div class="rr-wide">
              <dt>Lý do hủy</dt>
              <dd>{{ detail.cancellationReason ?? '—' }}</dd>
            </div>
          </dl>
        </section>
        <details class="rr-identifiers">
          <summary>Thông tin định danh</summary>
          <dl class="rr-info">
            <div>
              <dt>ID phiếu</dt>
              <dd>{{ detail.id }}</dd>
            </div>
            <div>
              <dt>ID đơn nguồn</dt>
              <dd>{{ detail.salesOrderId }}</dd>
            </div>
            <div>
              <dt>ID kho</dt>
              <dd>{{ detail.warehouseId }}</dd>
            </div>
            <div>
              <dt>ID khách</dt>
              <dd>{{ detail.customerId ?? 'Khách lẻ' }}</dd>
            </div>
            <div>
              <dt>ID người tạo</dt>
              <dd>{{ detail.createdBy }}</dd>
            </div>
            <div v-if="detail.cancelledBy">
              <dt>ID người hủy</dt>
              <dd>{{ detail.cancelledBy }}</dd>
            </div>
          </dl>
        </details>
      </template>
      <a-empty
        v-else-if="!loading && !error"
        description="Không có dữ liệu phiếu hoàn trong phạm vi được phép."
      />
    </a-spin>
    <template #footer>
      <a-button :disabled="saving" @click="emit('update:open', false)">Đóng</a-button>
      <a-button :disabled="saving || loading" @click="load">Tải lại</a-button>
      <a-button
        v-if="detail?.status === 'ACTIVE' && can('REFUND_CANCEL')"
        danger
        :disabled="saving || loading"
        @click="openCancel"
        >Hủy ghi nhận sai</a-button
      >
    </template>
  </ReturnRefundDialog>
  <RefundCancelDialog
    v-model:reason="reason"
    :open="open && cancelMode"
    :refund="detail"
    :saving="saving"
    :error="error"
    @close="closeCancel"
    @submit="cancel"
  />
</template>
<style scoped>
.refund-cancellation {
  padding: 14px;
  border: 1px solid #ffd7dc;
  border-radius: 10px;
  background: #fff7f8;
}
</style>
