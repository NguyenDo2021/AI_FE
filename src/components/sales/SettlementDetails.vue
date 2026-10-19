<script setup lang="ts">
import type { OrderPaymentSummary } from '@/types/payments'
import { reportValue } from '@/utils/reports'
defineProps<{ settlement: Omit<OrderPaymentSummary, 'salesOrderId'> }>()
const fields = [
  ['totalAmount', 'Tổng đơn gốc'],
  ['returnedAmount', 'Giá trị hàng đã trả'],
  ['adjustedTotalAmount', 'Tổng sau trả'],
  ['paidAmount', 'Đã thu (hiệu lực)'],
  ['refundedAmount', 'Đã hoàn (hiệu lực)'],
  ['netPaidAmount', 'Thu ròng (thu trừ hoàn)'],
  ['remainingAmount', 'Còn phải thu'],
  ['refundableAmount', 'Còn cần hoàn'],
] as const
</script>
<template>
  <a-descriptions bordered :column="2"
    ><a-descriptions-item v-for="[key, label] in fields" :key="key" :label="label">{{
      reportValue(settlement[key], true)
    }}</a-descriptions-item></a-descriptions
  >
  <a-tag
    v-if="settlement.refundableAmount !== undefined && BigInt(settlement.refundableAmount) > 0n"
    color="orange"
    >Cần hoàn tiền</a-tag
  >
</template>
