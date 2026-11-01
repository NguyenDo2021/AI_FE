<script setup lang="ts">
import PaymentReceiptDialog from './PaymentReceiptDialog.vue'
import PaymentAmountSummary from './PaymentAmountSummary.vue'
import PaymentCancelDialog from './PaymentCancelDialog.vue'
import { usePaymentReceipt } from '@/composables/usePaymentReceipt'
import { computed, ref, watch, onBeforeUnmount } from 'vue'
import { message } from 'ant-design-vue'
import {
  CloseCircleOutlined,
  FileTextOutlined,
  PrinterOutlined,
  ReloadOutlined,
} from '@ant-design/icons-vue'
import { BasicModal } from '@/components'
import { getPayment, cancelPayment } from '@/api/payments/payments.api'
import { usePaymentScope } from '@/composables/usePaymentScope'
import { usePaymentsStore } from '@/stores/payments'
import { paymentError } from '@/utils/payments'
import { stockFieldErrors } from '@/utils/stock'
import { formatDate, formatDateTime } from '@/utils/date'
import type { Payment } from '@/types/payments'
import type { NormalizedApiError } from '@/utils/request'
import './paymentDialogs.css'

const props = defineProps<{ open: boolean; id?: string; cancel?: boolean }>()
const emit = defineEmits<{ 'update:open': [value: boolean] }>()
const { can, inScope, contextKey, refreshAccess, warehouses } = usePaymentScope()
const payments = usePaymentsStore()
const receipt = usePaymentReceipt()
const detail = ref<Payment>()
const loading = ref(false)
const saving = ref(false)
const error = ref('')
const fields = ref<Record<string, string>>({})
const cancelling = ref(false)
const reason = ref('')
const warehouseName = computed(
  () =>
    warehouses.warehouses.find((item) => item.id === detail.value?.warehouseId)?.name ??
    detail.value?.warehouseId ??
    '—',
)
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
    if (current === sequence && inScope(result.warehouseId)) {
      detail.value = result
      if (result.status !== 'ACTIVE' || !can('PAYMENT_CANCEL')) cancelling.value = false
    }
  } catch (cause) {
    if (current === sequence) error.value = paymentError(cause)
    if ((cause as NormalizedApiError).status === 403) await refreshAccess(cause)
  } finally {
    if (current === sequence) loading.value = false
  }
}
watch(
  () => [props.open, props.id],
  () => {
    receipt.close()
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
const closeDetail = (): void => {
  if (!saving.value) emit('update:open', false)
}
const openCancel = (): void => {
  if (saving.value || loading.value || detail.value?.status !== 'ACTIVE' || !can('PAYMENT_CANCEL'))
    return
  error.value = ''
  fields.value = {}
  reason.value = ''
  cancelling.value = true
}
const closeCancel = (): void => {
  if (saving.value) return
  cancelling.value = false
  error.value = ''
  fields.value = {}
  if (props.cancel) emit('update:open', false)
}
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
    if (props.cancel) emit('update:open', false)
  } catch (cause) {
    if (current !== sequence) return
    error.value = paymentError(cause)
    fields.value = stockFieldErrors(cause)
    const status = (cause as NormalizedApiError).status
    if (!status || status >= 500 || status === 408)
      error.value +=
        ' Chưa xác định kết quả. Có thể thử lại hủy với cùng lý do; backend không đảo tiền thêm.'
    if (status === 403) await refreshAccess(cause)
  } finally {
    saving.value = false
  }
}
</script>

<template>
  <a-config-provider :theme="{ token: { colorPrimary: '#7357cf', borderRadius: 8 } }">
    <BasicModal
      :open="open && !cancelling && !receipt.state.open"
      title="Chi tiết phiếu thu"
      :width="760"
      wrap-class-name="payment-dialog payment-detail-dialog"
      :confirm-loading="saving"
      :focus-trigger-after-close="false"
      @update:open="closeDetail"
    >
      <template #title>
        <div class="payment-dialog-heading">
          <span class="payment-dialog-icon"><FileTextOutlined aria-hidden="true" /></span>
          <span>Chi tiết phiếu thu</span>
        </div>
      </template>
      <a-spin :spinning="loading">
        <div class="payment-dialog-body">
          <a-alert v-if="error" type="error" :message="error" show-icon />
          <template v-if="detail">
            <PaymentAmountSummary :payment="detail" />
            <dl class="payment-info-grid">
              <div>
                <dt>Ngày thu</dt>
                <dd>{{ formatDate(detail.paymentDate) }}</dd>
              </div>
              <div>
                <dt>Hình thức</dt>
                <dd>{{ detail.method === 'CASH' ? 'Tiền mặt' : 'Chuyển khoản' }}</dd>
              </div>
              <div>
                <dt>Kho</dt>
                <dd>{{ warehouseName }}</dd>
              </div>
              <div>
                <dt>Khách hàng</dt>
                <dd>{{ detail.customerId ?? 'Khách lẻ' }}</dd>
              </div>
              <div class="payment-info-wide">
                <dt>Đơn nguồn</dt>
                <dd>{{ detail.salesOrderId }}</dd>
              </div>
              <div class="payment-info-wide">
                <dt>Tham chiếu</dt>
                <dd>{{ detail.reference ?? '—' }}</dd>
              </div>
              <div class="payment-info-wide">
                <dt>Ghi chú</dt>
                <dd>{{ detail.note ?? '—' }}</dd>
              </div>
              <div>
                <dt>Thời gian tạo</dt>
                <dd>{{ formatDateTime(detail.createdAt) }}</dd>
              </div>
            </dl>
            <section v-if="detail.status === 'CANCELLED'" class="payment-cancellation">
              <h3>Thông tin hủy ghi nhận</h3>
              <dl class="payment-info-grid">
                <div>
                  <dt>Thời gian hủy</dt>
                  <dd>{{ detail.cancelledAt ? formatDateTime(detail.cancelledAt) : '—' }}</dd>
                </div>
                <div class="payment-info-wide">
                  <dt>Lý do hủy</dt>
                  <dd>{{ detail.cancellationReason ?? '—' }}</dd>
                </div>
              </dl>
            </section>
            <details class="payment-identifiers">
              <summary>Thông tin định danh</summary>
              <dl class="payment-info-grid">
                <div class="payment-info-wide">
                  <dt>ID phiếu</dt>
                  <dd>{{ detail.id }}</dd>
                </div>
                <div>
                  <dt>ID kho</dt>
                  <dd>{{ detail.warehouseId }}</dd>
                </div>
                <div>
                  <dt>ID đơn nguồn</dt>
                  <dd>{{ detail.salesOrderId }}</dd>
                </div>
                <div>
                  <dt>ID khách</dt>
                  <dd>{{ detail.customerId ?? 'Khách lẻ' }}</dd>
                </div>
                <div>
                  <dt>ID người tạo</dt>
                  <dd>{{ detail.createdBy }}</dd>
                </div>
                <div v-if="detail.status === 'CANCELLED'">
                  <dt>ID người hủy</dt>
                  <dd>{{ detail.cancelledBy ?? '—' }}</dd>
                </div>
              </dl>
            </details>
          </template>
          <a-empty v-else-if="!loading && !error" description="Không có dữ liệu phiếu thu." />
        </div>
      </a-spin>
      <template #footer>
        <div class="payment-dialog-footer">
          <a-button :disabled="saving" @click="closeDetail">Đóng</a-button>
          <a-button :disabled="saving || loading" @click="load">
            <template #icon><ReloadOutlined aria-hidden="true" /></template>Tải lại
          </a-button>
          <a-button
            v-if="detail && can('PAYMENT_VIEW')"
            :loading="receipt.state.loading"
            @click="receipt.show(detail)"
          >
            <template #icon><PrinterOutlined aria-hidden="true" /></template>Xem/in biên lai
          </a-button>
          <a-button
            v-if="detail?.status === 'ACTIVE' && can('PAYMENT_CANCEL')"
            danger
            :disabled="saving || loading"
            @click="openCancel"
          >
            <template #icon><CloseCircleOutlined aria-hidden="true" /></template>Hủy ghi nhận sai
          </a-button>
        </div>
      </template>
    </BasicModal>
    <PaymentCancelDialog
      v-model:reason="reason"
      :open="open && cancelling"
      :payment="detail"
      :warehouse-name="warehouseName"
      :loading="loading"
      :saving="saving"
      :error="error"
      :fields="fields"
      @close="closeCancel"
      @submit="submit"
      @reload="load"
    />
    <PaymentReceiptDialog :receipt="receipt" />
  </a-config-provider>
</template>
