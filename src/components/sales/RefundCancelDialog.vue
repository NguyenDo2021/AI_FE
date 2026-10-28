<script setup lang="ts">
import ReturnRefundDialog from './ReturnRefundDialog.vue'
import SettlementAmountSummary from './SettlementAmountSummary.vue'
import type { Refund } from '@/types/returns'

defineProps<{ open: boolean; refund?: Refund; saving: boolean; error: string; reason: string }>()
const emit = defineEmits<{ close: []; submit: []; 'update:reason': [value: string] }>()
</script>

<template>
  <ReturnRefundDialog
    :open="open"
    instant
    title="Hủy ghi nhận hoàn tiền sai"
    :width="700"
    :saving="saving"
    danger
    @update:open="emit('close')"
  >
    <a-alert v-if="error" type="error" :message="error" show-icon />
    <SettlementAmountSummary
      v-if="refund"
      :code="refund.code"
      label="Số tiền hoàn"
      :amount="refund.amount"
    >
      <template #status
        ><a-tag :color="refund.status === 'ACTIVE' ? 'green' : 'red'">{{
          refund.status === 'ACTIVE' ? 'Hiệu lực' : 'Đã hủy'
        }}</a-tag></template
      >
    </SettlementAmountSummary>
    <a-alert
      type="info"
      show-icon
      message="Chỉ đảo ghi nhận hoàn tiền sai; không ghi nhận thu tiền từ khách."
    />
    <a-form layout="vertical" :disabled="saving" @finish="emit('submit')">
      <a-form-item label="Lý do hủy" html-for="refund-cancel-reason" required>
        <a-textarea
          id="refund-cancel-reason"
          :value="reason"
          :maxlength="2000"
          :rows="4"
          show-count
          aria-required="true"
          placeholder="Nhập lý do hủy ghi nhận sai…"
          @update:value="emit('update:reason', $event)"
        />
      </a-form-item>
    </a-form>
    <template #footer>
      <a-button :disabled="saving" @click="emit('close')">Quay lại</a-button>
      <a-button
        type="primary"
        danger
        :loading="saving"
        :disabled="!refund || refund.status !== 'ACTIVE'"
        @click="emit('submit')"
        >Xác nhận hủy ghi nhận</a-button
      >
    </template>
  </ReturnRefundDialog>
</template>
