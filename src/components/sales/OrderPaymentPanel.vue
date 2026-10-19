<script setup lang="ts">
import { computed, ref } from 'vue'
import ReturnDialog from './ReturnDialog.vue'
import RefundDialog from './RefundDialog.vue'
import SettlementDetails from './SettlementDetails.vue'
import type { OrderSettlementSummary } from '@/types/returns'
import CollectPaymentDialog from './CollectPaymentDialog.vue'
import PaymentHistory from './PaymentHistory.vue'
import { usePaymentsStore } from '@/stores/payments'
import { usePaymentScope } from '@/composables/usePaymentScope'
import { applyPaymentSummary, canCollect, paymentLabel } from '@/utils/payments'
import type { SalesOrder } from '@/types/sales'
const props = defineProps<{ order: SalesOrder }>()
const emit = defineEmits<{ updated: [order: SalesOrder]; refreshRequested: [] }>()
const { can, inScope } = usePaymentScope()
const payments = usePaymentsStore()
const open = ref(false),
  returnOpen = ref(false),
  refundOpen = ref(false)
const current = computed(() =>
  payments.summaries[props.order.id]
    ? applyPaymentSummary(props.order, payments.summaries[props.order.id]!)
    : props.order,
)
const refundOrder = computed<OrderSettlementSummary>(() => ({
  salesOrderId: current.value.id,
  code: current.value.code,
  warehouseId: current.value.warehouseId,
  customerId: current.value.customerId,
  customerSnapshot: current.value.customerSnapshot,
  saleDate: current.value.saleDate,
  status: current.value.status,
  totalAmount: current.value.totalAmount,
  returnedAmount: current.value.returnedAmount,
  adjustedTotalAmount: current.value.adjustedTotalAmount,
  paidAmount: current.value.paidAmount,
  refundedAmount: current.value.refundedAmount,
  netPaidAmount: current.value.netPaidAmount,
  remainingAmount: current.value.remainingAmount,
  refundableAmount: current.value.refundableAmount,
  paymentStatus: current.value.paymentStatus,
}))
</script>
<template>
  <section v-if="inScope(order.warehouseId)">
    <SettlementDetails :settlement="current" />
    <p>Thanh toán: {{ paymentLabel(current) }}</p>
    <a-button
      v-if="
        current.status === 'CONFIRMED' && can('SALES_RETURN_VIEW') && can('SALES_RETURN_CREATE')
      "
      @click="returnOpen = true"
      >Trả hàng</a-button
    >
    <a-button
      v-if="
        current.status === 'CONFIRMED' &&
        current.refundableAmount !== undefined &&
        BigInt(current.refundableAmount) > 0n &&
        can('REFUND_CREATE')
      "
      @click="refundOpen = true"
      >Hoàn tiền</a-button
    >
    <router-link
      v-if="can('REFUND_VIEW')"
      :to="{ path: '/sales/refunds', query: { salesOrderId: current.id } }"
      >Lịch sử hoàn tiền</router-link
    >
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
    <ReturnDialog
      v-model:open="returnOpen"
      :sales-order-id="current.id"
      :sales-order-code="current.code"
      :warehouse-id="current.warehouseId"
      @saved="emit('refreshRequested')"
    />
    <RefundDialog
      v-model:open="refundOpen"
      :order="refundOrder"
      @updated="emit('refreshRequested')"
      @refresh-requested="emit('refreshRequested')"
    />
    <CollectPaymentDialog
      v-model:open="open"
      :order="current"
      @updated="emit('updated', $event)"
      @refresh-requested="emit('refreshRequested')"
    />
  </section>
</template>
