<script setup lang="ts">
import type { OrderPaymentSummary } from '@/types/payments'
import { reportValue } from '@/utils/reports'
defineProps<{
  settlement: Partial<Omit<OrderPaymentSummary, 'salesOrderId'>>
  compact?: boolean
  presentation?: 'receivable'
}>()
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
  <dl
    v-if="compact || presentation === 'receivable'"
    class="settlement-grid"
    :class="{ 'settlement-grid--receivable': presentation === 'receivable' }"
  >
    <div
      v-for="[key, label] in fields"
      :key="key"
      :class="{ 'settlement-remaining': key === 'remainingAmount' }"
    >
      <dt>{{ label }}</dt>
      <dd :class="{ 'settlement-refund': key === 'refundableAmount' }">
        {{ reportValue(settlement[key], true) }}
      </dd>
    </div>
  </dl>
  <a-descriptions v-else bordered :column="2"
    ><a-descriptions-item v-for="[key, label] in fields" :key="key" :label="label">{{
      reportValue(settlement[key], true)
    }}</a-descriptions-item></a-descriptions
  >
  <a-tag
    v-if="
      !compact &&
      settlement.refundableAmount !== undefined &&
      BigInt(settlement.refundableAmount) > 0n
    "
    color="orange"
    >Cần hoàn tiền</a-tag
  >
</template>
<style scoped>
.settlement-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  margin: 0;
  border: 1px solid #ece7f3;
  border-radius: 8px;
  overflow: hidden;
}
.settlement-grid > div {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  flex-wrap: wrap;
  gap: 4px 12px;
  min-width: 0;
  padding: 9px 12px;
  border-bottom: 1px solid #f0edf5;
  background: #fdfcfe;
}
.settlement-grid dt {
  color: #625b70;
  font-size: 13px;
}
.settlement-grid dd {
  margin: 0 0 0 auto;
  text-align: right;
  font-variant-numeric: tabular-nums;
  overflow-wrap: anywhere;
}
.settlement-refund {
  color: #7357cf;
  font-weight: 600;
}
.settlement-grid--receivable {
  gap: 0 28px;
  border: 0;
  border-radius: 0;
  overflow: visible;
}
.settlement-grid--receivable > div {
  padding: 12px 0;
  background: transparent;
}
.settlement-grid--receivable dt {
  font-size: 14px;
}
.settlement-grid--receivable .settlement-remaining {
  padding-inline: 12px;
  border-radius: 8px;
  background: #f3eefc;
}
.settlement-grid--receivable .settlement-remaining dt,
.settlement-grid--receivable .settlement-remaining dd {
  color: #7357cf;
  font-weight: 650;
}
@media (max-width: 767px) {
  .settlement-grid--receivable {
    grid-template-columns: minmax(0, 1fr);
  }
}
@media (max-width: 550px) {
  .settlement-grid {
    grid-template-columns: minmax(0, 1fr);
  }
}
</style>
