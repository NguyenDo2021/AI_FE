<script setup lang="ts">
import { formatStockInteger } from '@/utils/stock'
import type { Payment } from '@/types/payments'

defineProps<{ payment: Payment }>()
</script>

<template>
  <section class="payment-amount-summary" aria-label="Số tiền của lần thu">
    <p class="payment-summary-code">{{ payment.code }}</p>
    <p class="payment-summary-label">Số tiền của lần thu</p>
    <div class="payment-summary-row">
      <strong class="payment-summary-amount"
        >{{ formatStockInteger(payment.amount) }} <span>₫</span></strong
      >
      <a-tag :color="payment.status === 'ACTIVE' ? 'green' : 'red'" class="payment-summary-status">
        <span aria-hidden="true">●</span>
        {{ payment.status === 'ACTIVE' ? 'Có hiệu lực' : 'Đã hủy' }}
      </a-tag>
    </div>
  </section>
</template>

<style scoped>
.payment-amount-summary {
  padding: 20px;
  border-radius: 12px;
  background: #f2ecfc;
}
.payment-summary-code {
  margin: 0 0 22px;
  color: #797184;
  font-size: 12px;
  overflow-wrap: anywhere;
}
.payment-summary-label {
  margin: 0 0 10px;
  color: #797184;
  font-size: 13px;
}
.payment-summary-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  flex-wrap: wrap;
  gap: 12px;
}
.payment-summary-amount {
  min-width: 0;
  color: #7950d7;
  font-size: clamp(24px, 4vw, 32px);
  font-weight: 650;
  line-height: 1.35;
  font-variant-numeric: tabular-nums;
  overflow-wrap: anywhere;
}
.payment-summary-amount span {
  font-size: 0.85em;
}
.payment-summary-status {
  margin: 0;
  padding: 6px 10px;
  border: 0;
  border-radius: 6px;
  white-space: nowrap;
}
.payment-summary-status > span {
  margin-right: 3px;
  font-size: 8px;
}
@media (max-width: 480px) {
  .payment-amount-summary {
    padding: 16px;
  }
}
</style>
