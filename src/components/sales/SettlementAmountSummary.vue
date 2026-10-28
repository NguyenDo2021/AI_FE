<script setup lang="ts">
import { formatStockInteger } from '@/utils/stock'
import type { StockInteger } from '@/types/stock'

defineProps<{ code: string; label: string; amount?: StockInteger; customer?: string }>()
</script>

<template>
  <section class="settlement-summary" :aria-label="label">
    <div class="summary-identity">
      <span class="summary-label">{{ customer ? 'Đơn bán hàng' : 'Mã phiếu' }}</span>
      <a-tooltip :title="code"
        ><strong class="summary-code">{{ code }}</strong></a-tooltip
      >
      <span v-if="customer" class="summary-customer">{{ customer }}</span>
    </div>
    <div class="summary-value">
      <span class="summary-label">{{ label }}</span>
      <strong class="summary-amount"
        >{{ amount === undefined ? '—' : formatStockInteger(amount) }} ₫</strong
      >
    </div>
    <div v-if="$slots.status" class="summary-status">
      <span class="summary-label">Trạng thái</span>
      <slot name="status" />
    </div>
  </section>
</template>

<style scoped>
.settlement-summary {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 16px 24px;
  padding: 18px 20px;
  border: 1px solid #e9e0fc;
  border-radius: 12px;
  background: #f2ecfc;
}
.summary-identity,
.summary-value,
.summary-status {
  display: flex;
  flex-direction: column;
  gap: 6px;
  min-width: 0;
}
.summary-identity {
  flex: 1 1 160px;
}
.summary-value {
  flex: 2 1 220px;
}
.summary-label {
  color: #797184;
  font-size: 13px;
}
.summary-code {
  display: block;
  max-width: 100%;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  color: #302640;
}
.summary-customer {
  overflow-wrap: anywhere;
  color: #625b70;
}
.summary-amount {
  color: #7950d7;
  font-size: clamp(24px, 3vw, 30px);
  line-height: 1.3;
  font-weight: 650;
  font-variant-numeric: tabular-nums;
  overflow-wrap: anywhere;
}
.summary-status :deep(.ant-tag) {
  align-self: flex-start;
  margin: 0;
  padding: 4px 10px;
  border-radius: 7px;
}
@media (max-width: 480px) {
  .settlement-summary {
    padding: 16px;
    gap: 14px;
  }
  .summary-value {
    flex-basis: 100%;
  }
}
</style>
