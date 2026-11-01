<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { message } from 'ant-design-vue'
import { BasicModal } from '@/components'
import { WalletOutlined, InfoCircleOutlined } from '@ant-design/icons-vue'
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
      await refreshAccess(cause)
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
        if ((reloadCause as NormalizedApiError).status === 403) await refreshAccess(reloadCause)
      }
    }
  }
}
</script>
<template>
  <a-config-provider
    :theme="{ token: { colorPrimary: '#7357cf', colorLink: '#7357cf', borderRadius: 8 } }"
  >
    <BasicModal
      :open="open"
      title="Thu tiền đơn bán"
      :width="580"
      wrap-class-name="collect-payment-dialog"
      :confirm-loading="saving"
      @update:open="emit('update:open', false)"
    >
      <template #title>
        <div class="collection-heading">
          <span class="collection-heading-icon"><WalletOutlined aria-hidden="true" /></span>
          <span>Thu tiền đơn bán</span>
        </div>
      </template>
      <div class="collection-body">
        <a-alert v-if="error" type="error" :message="error" show-icon />
        <section class="collection-summary" :aria-label="$t('sales.orderInformation')">
          <div class="collection-code-row">
            <span>Đơn</span>
            <a-tooltip :title="detail.code || detail.id">
              <span class="collection-code">{{ detail.code || detail.id }}</span>
            </a-tooltip>
          </div>
          <dl class="collection-summary-values">
            <div>
              <dt>Tổng tiền đơn</dt>
              <dd>{{ formatStockInteger(detail.totalAmount) }} <small>VND</small></dd>
            </div>
            <div>
              <dt>Đã thu</dt>
              <dd>{{ formatStockInteger(detail.paidAmount ?? 0) }} <small>VND</small></dd>
            </div>
          </dl>
          <dl class="collection-remaining">
            <dt>Còn phải trả (tham khảo)</dt>
            <dd>{{ formatStockInteger(detail.remainingAmount ?? 0) }} <small>VND</small></dd>
          </dl>
        </section>
        <a-alert
          v-if="attempt"
          type="warning"
          show-icon
          :message="
            attempt.state === 'conflict'
              ? 'Khóa bị xung đột. Giữ request để kiểm tra, không tạo khóa thay thế.'
              : 'Có lần thu chưa xác định. Nội dung đã khóa; thử lại dùng nguyên khóa và request cũ.'
          "
        />
        <a-form
          class="collection-form"
          layout="vertical"
          :disabled="saving || !!attempt || !allowed"
        >
          <div class="collection-amount-heading">
            <label for="collection-amount">
              Số tiền thu <span class="collection-required" aria-hidden="true">*</span>
            </label>
            <a-button
              class="collection-fill"
              type="link"
              size="small"
              :disabled="saving || !!attempt || !allowed"
              @click="form.amount = String(detail.remainingAmount ?? 0)"
              >Điền số tiền còn lại</a-button
            >
          </div>
          <a-form-item
            required
            :help="fields.amount"
            :validate-status="fields.amount ? 'error' : undefined"
          >
            <a-input
              id="collection-amount"
              v-model:value="form.amount"
              class="collection-amount-input"
              size="large"
              inputmode="numeric"
              placeholder="0"
              suffix="VND"
              aria-required="true"
            />
          </a-form-item>
          <div class="collection-form-row">
            <a-form-item
              label="Ngày thu"
              html-for="collection-date"
              required
              :help="fields.paymentDate"
              :validate-status="fields.paymentDate ? 'error' : undefined"
            >
              <a-date-picker
                id="collection-date"
                v-model:value="form.paymentDate"
                size="large"
                value-format="YYYY-MM-DD"
              />
            </a-form-item>
            <a-form-item
              label="Hình thức"
              html-for="collection-method"
              required
              :help="fields.method"
              :validate-status="fields.method ? 'error' : undefined"
            >
              <a-select
                id="collection-method"
                v-model:value="form.method"
                size="large"
                :options="[
                  { value: 'CASH', label: 'Tiền mặt' },
                  { value: 'BANK_TRANSFER', label: 'Chuyển khoản' },
                ]"
              />
            </a-form-item>
          </div>
          <a-form-item
            label="Tham chiếu"
            html-for="collection-reference"
            :help="fields.reference"
            :validate-status="fields.reference ? 'error' : undefined"
          >
            <a-input
              id="collection-reference"
              v-model:value="form.reference"
              size="large"
              :maxlength="200"
            />
          </a-form-item>
          <a-form-item
            label="Ghi chú"
            html-for="collection-note"
            :help="fields.note"
            :validate-status="fields.note ? 'error' : undefined"
          >
            <a-textarea
              id="collection-note"
              v-model:value="form.note"
              :maxlength="2000"
              :rows="2"
            />
          </a-form-item>
        </a-form>
        <p class="collection-manual-note">
          <InfoCircleOutlined aria-hidden="true" />
          <span>Ghi nhận thanh toán thủ công. Chuyển khoản chưa được ngân hàng xác minh.</span>
        </p>
      </div>
      <template #footer>
        <div class="collection-footer">
          <a-button :disabled="saving" @click="emit('update:open', false)">Đóng</a-button>
          <a-button
            type="primary"
            :loading="saving"
            :disabled="
              !allowed || attempt?.state === 'conflict' || (!attempt && !canCollect(detail))
            "
            @click="submit"
            >{{ attempt ? 'Thử lại đúng request cũ' : 'Ghi nhận thu tiền' }}</a-button
          >
        </div>
      </template>
    </BasicModal>
  </a-config-provider>
</template>
<style scoped>
.collection-heading {
  display: flex;
  align-items: center;
  gap: 12px;
  padding-inline-end: 28px;
  color: #302640;
  font-size: 18px;
  line-height: 26px;
}
.collection-heading-icon {
  display: grid;
  place-items: center;
  flex-shrink: 0;
  width: 40px;
  height: 40px;
  border-radius: 12px;
  background: #f3eefc;
  color: #7357cf;
  font-size: 20px;
}
.collection-body {
  display: flex;
  flex-direction: column;
  gap: 18px;
  min-width: 0;
}
.collection-summary {
  min-width: 0;
  padding: 16px;
  border-radius: 12px;
  background: #f5f0fc;
}
.collection-code-row {
  display: flex;
  align-items: center;
  gap: 10px;
  min-width: 0;
  padding-bottom: 12px;
  border-bottom: 1px solid #eae2f5;
  font-size: 13px;
}
.collection-code-row > span:first-child {
  flex-shrink: 0;
  color: #80758f;
}
.collection-code {
  display: block;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  color: #443257;
}
.collection-summary-values {
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
  gap: 16px;
  margin: 14px 0;
}
.collection-summary-values > div {
  min-width: 0;
}
.collection-summary dt {
  color: #80758f;
  font-size: 12px;
  line-height: 18px;
}
.collection-summary dd {
  margin: 6px 0 0;
  color: #302640;
  font-size: 14px;
  font-weight: 600;
  font-variant-numeric: tabular-nums;
  overflow-wrap: anywhere;
}
.collection-summary small {
  font-size: 11px;
  font-weight: 500;
  white-space: nowrap;
}
.collection-remaining {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  flex-wrap: wrap;
  gap: 8px 16px;
  margin: 0;
  padding-top: 14px;
  border-top: 1px solid #eae2f5;
}
.collection-remaining dd {
  flex: 1;
  margin: 0;
  color: #7357cf;
  text-align: right;
  font-size: 26px;
  line-height: 34px;
  font-weight: 600;
}
.collection-remaining small {
  font-size: 13px;
}
.collection-form :deep(.ant-form-item) {
  margin-bottom: 16px;
}
.collection-form :deep(.ant-form-item:last-child) {
  margin-bottom: 0;
}
.collection-form :deep(.ant-form-item-label) {
  padding-bottom: 6px;
}
.collection-form :deep(.ant-form-item-label > label) {
  font-size: 13px;
}
.collection-amount-heading {
  display: flex;
  align-items: center;
  justify-content: space-between;
  flex-wrap: wrap;
  gap: 4px 12px;
  margin-bottom: 6px;
}
.collection-amount-heading > label {
  color: #302640;
  font-size: 13px;
}
.collection-required {
  color: #ff4d4f;
}
.collection-fill {
  height: auto;
  min-height: 22px;
  padding: 0;
  font-size: 12px;
  line-height: 22px;
}
.collection-amount-input {
  min-height: 56px;
}
.collection-amount-input :deep(.ant-input) {
  font-size: 24px;
  line-height: 32px;
  font-variant-numeric: tabular-nums;
}
.collection-amount-input :deep(.ant-input-suffix) {
  color: #8d829c;
  font-size: 12px;
}
.collection-form-row {
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
  gap: 16px;
  margin-bottom: 16px;
}
.collection-form-row :deep(.ant-form-item) {
  margin-bottom: 0;
}
.collection-form-row :deep(.ant-picker),
.collection-form-row :deep(.ant-select) {
  width: 100%;
}
.collection-manual-note {
  display: flex;
  align-items: flex-start;
  gap: 8px;
  margin: 0;
  color: #80758f;
  font-size: 12px;
  line-height: 18px;
}
.collection-manual-note > :first-child {
  flex-shrink: 0;
  margin-top: 3px;
}
.collection-footer {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  flex-wrap: wrap;
  gap: 10px;
}
.collection-footer :deep(.ant-btn + .ant-btn) {
  margin-inline-start: 0;
}
.collection-footer :deep(.ant-btn) {
  min-height: 38px;
  height: auto;
  white-space: normal;
}
:global(.collect-payment-dialog .ant-modal) {
  top: 20px;
  max-width: calc(100vw - 24px);
  padding-bottom: 20px;
}
:global(.collect-payment-dialog .ant-modal-content) {
  display: flex;
  flex-direction: column;
  max-height: calc(100dvh - 40px);
  padding: 0;
  border-radius: 16px;
}
:global(.collect-payment-dialog .ant-modal-header) {
  flex-shrink: 0;
  margin: 0;
  padding: 20px 24px;
  border-bottom: 1px solid #eee8f6;
  border-radius: 16px 16px 0 0;
}
:global(.collect-payment-dialog .ant-modal-body) {
  min-height: 0;
  overflow: auto;
  padding: 20px 24px;
}
:global(.collect-payment-dialog .ant-modal-footer) {
  flex-shrink: 0;
  margin: 0;
  padding: 16px 24px;
  border-top: 1px solid #eee8f6;
  border-radius: 0 0 16px 16px;
}
:global(.collect-payment-dialog .ant-modal-close) {
  top: 24px;
  inset-inline-end: 20px;
}
@media (max-width: 480px) {
  .collection-form-row {
    grid-template-columns: minmax(0, 1fr);
  }
  .collection-heading {
    font-size: 16px;
    gap: 10px;
  }
  .collection-heading-icon {
    width: 36px;
    height: 36px;
  }
  .collection-summary {
    padding: 14px;
  }
  .collection-remaining dt {
    flex-basis: 100%;
  }
  .collection-remaining dd {
    font-size: 24px;
  }
  :global(.collect-payment-dialog .ant-modal-header) {
    padding: 16px;
  }
  :global(.collect-payment-dialog .ant-modal-body) {
    padding: 18px 16px;
  }
  :global(.collect-payment-dialog .ant-modal-footer) {
    padding: 14px 16px;
  }
  :global(.collect-payment-dialog .ant-modal-close) {
    top: 20px;
    inset-inline-end: 12px;
  }
}
@media (max-height: 450px) {
  :global(.collect-payment-dialog .ant-modal) {
    top: 8px;
    padding-bottom: 8px;
  }
  :global(.collect-payment-dialog .ant-modal-content) {
    max-height: calc(100dvh - 16px);
  }
  :global(.collect-payment-dialog .ant-modal-header) {
    padding-block: 12px;
  }
  :global(.collect-payment-dialog .ant-modal-footer) {
    padding-block: 12px;
  }
  :global(.collect-payment-dialog .ant-modal-close) {
    top: 16px;
  }
}
@media (max-height: 260px) {
  :global(.collect-payment-dialog .ant-modal-content) {
    max-height: none;
  }
  :global(.collect-payment-dialog .ant-modal-body) {
    overflow: visible;
  }
}
</style>
