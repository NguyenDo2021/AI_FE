<script setup lang="ts">
import { computed, ref } from 'vue'
import CollectPaymentDialog from './CollectPaymentDialog.vue'
import PaymentHistory from './PaymentHistory.vue'
import { usePaymentsStore } from '@/stores/payments'
import { usePaymentScope } from '@/composables/usePaymentScope'
import { applyPaymentSummary, canCollect, paymentLabel } from '@/utils/payments'
import { formatStockInteger } from '@/utils/stock'
import type { SalesOrder } from '@/types/sales'
const props = defineProps<{ order: SalesOrder }>()
const emit = defineEmits<{ updated: [order: SalesOrder]; refreshRequested: [] }>()
const { can, inScope } = usePaymentScope()
const payments = usePaymentsStore()
const open = ref(false)
const current = computed(() =>
  payments.summaries[props.order.id]
    ? applyPaymentSummary(props.order, payments.summaries[props.order.id]!)
    : props.order,
)
</script>
<template>
  <section v-if="inScope(order.warehouseId)">
    <a-descriptions bordered :column="2">
      <a-descriptions-item label="Tổng tiền đơn"
        >{{ formatStockInteger(current.totalAmount) }} VND</a-descriptions-item
      >
      <a-descriptions-item label="Thanh toán">{{ paymentLabel(current) }}</a-descriptions-item>
      <a-descriptions-item label="Đã thu"
        >{{ formatStockInteger(current.paidAmount ?? 0) }} VND</a-descriptions-item
      >
      <a-descriptions-item label="Còn phải trả"
        >{{ formatStockInteger(current.remainingAmount ?? 0) }} VND</a-descriptions-item
      >
    </a-descriptions>
    <a-button
      v-if="can('PAYMENT_CREATE') && (canCollect(current) || payments.attempts[current.id])"
      type="primary"
      @click="open = true"
      >{{ payments.attempts[current.id] ? 'Kiểm tra / thử lại lần thu' : 'Thu tiền' }}</a-button
    >
    <template v-if="can('PAYMENT_VIEW')">
      <h3>Lịch sử thanh toán</h3>
      <PaymentHistory :order-id="order.id" />
    </template>
    <CollectPaymentDialog
      v-model:open="open"
      :order="current"
      @updated="emit('updated', $event)"
      @refresh-requested="emit('refreshRequested')"
    />
  </section>
</template>
