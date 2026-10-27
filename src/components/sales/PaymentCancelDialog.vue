<script setup lang="ts">
import { CloseCircleOutlined, FileTextOutlined } from '@ant-design/icons-vue'
import { BasicModal } from '@/components'
import { formatDate } from '@/utils/date'
import PaymentAmountSummary from './PaymentAmountSummary.vue'
import type { Payment } from '@/types/payments'
import './paymentDialogs.css'

defineProps<{
  open: boolean
  payment?: Payment
  warehouseName: string
  loading: boolean
  saving: boolean
  error: string
  fields: Record<string, string>
  reason: string
}>()
const emit = defineEmits<{
  close: []
  submit: []
  reload: []
  'update:reason': [value: string]
}>()
</script>

<template>
  <BasicModal
    :open="open"
    title="Hủy ghi nhận sai"
    :width="580"
    wrap-class-name="payment-dialog payment-cancel-dialog"
    :confirm-loading="saving"
    :focus-trigger-after-close="false"
    @update:open="emit('close')"
  >
    <template #title>
      <div class="payment-dialog-heading">
        <span class="payment-dialog-icon cancel-icon"><FileTextOutlined aria-hidden="true" /></span>
        <div>
          Hủy ghi nhận sai
          <small>Kiểm tra phiếu thu và nhập lý do trước khi hủy.</small>
        </div>
      </div>
    </template>
    <a-spin :spinning="loading">
      <div class="payment-dialog-body">
        <a-alert v-if="error" type="error" :message="error" show-icon />
        <template v-if="payment">
          <PaymentAmountSummary :payment="payment" />
          <dl class="payment-info-grid">
            <div>
              <dt>Khách hàng</dt>
              <dd>{{ payment.customerId ?? 'Khách lẻ' }}</dd>
            </div>
            <div>
              <dt>Kho</dt>
              <dd>{{ warehouseName }}</dd>
            </div>
            <div>
              <dt>Ngày thu</dt>
              <dd>{{ formatDate(payment.paymentDate) }}</dd>
            </div>
            <div>
              <dt>Hình thức</dt>
              <dd>{{ payment.method === 'CASH' ? 'Tiền mặt' : 'Chuyển khoản' }}</dd>
            </div>
          </dl>
          <a-alert type="warning" show-icon class="cancel-warning">
            <template #message>
              Thao tác này đảo ghi nhận thu tiền sai, <strong>không hoàn tiền cho khách.</strong>
              Phiếu vẫn được lưu để tra cứu.
            </template>
          </a-alert>
          <a-form layout="vertical" :disabled="saving" @finish="emit('submit')">
            <a-form-item
              label="Lý do hủy"
              html-for="payment-cancel-reason"
              required
              :help="fields.reason"
              :validate-status="fields.reason ? 'error' : undefined"
            >
              <a-textarea
                id="payment-cancel-reason"
                :value="reason"
                :maxlength="2000"
                :rows="3"
                show-count
                aria-required="true"
                placeholder="Ví dụ: Ghi nhận trùng phiếu thu của đơn hàng…"
                @update:value="emit('update:reason', $event)"
              />
            </a-form-item>
          </a-form>
        </template>
        <a-empty v-else-if="!loading && !error" description="Không có dữ liệu phiếu thu." />
      </div>
    </a-spin>
    <template #footer>
      <div class="payment-dialog-footer">
        <a-button :disabled="saving" @click="emit('close')">Quay lại</a-button>
        <a-button v-if="!payment && error" :disabled="loading" @click="emit('reload')"
          >Thử lại</a-button
        >
        <a-button
          type="primary"
          danger
          :loading="saving"
          :disabled="loading || !payment || payment.status !== 'ACTIVE'"
          @click="emit('submit')"
        >
          <template #icon><CloseCircleOutlined aria-hidden="true" /></template>
          Xác nhận hủy ghi nhận
        </a-button>
      </div>
    </template>
  </BasicModal>
</template>

<style scoped>
.cancel-icon {
  background: #fff0f2 !important;
  color: #d6394c !important;
}
.cancel-warning {
  border: 0;
  border-radius: 10px;
  background: #fff8eb;
}
.cancel-warning :deep(.ant-alert-message) {
  color: #756c5c;
  font-size: 13px;
  line-height: 1.7;
}
.cancel-warning strong {
  color: #302640;
  font-weight: 600;
}
:deep(.ant-form-item) {
  margin-bottom: 12px;
}
</style>
