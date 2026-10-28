<script setup lang="ts">
import { computed, ref } from 'vue'
import {
  FileTextOutlined,
  HistoryOutlined,
  RollbackOutlined,
  WalletOutlined,
  TransactionOutlined,
  SolutionOutlined,
} from '@ant-design/icons-vue'
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
const props = defineProps<{ order: SalesOrder; presentation?: 'receivable' }>()
const emit = defineEmits<{ updated: [order: SalesOrder]; refreshRequested: [] }>()
const { can, inScope } = usePaymentScope()
const payments = usePaymentsStore()
const open = ref(false),
  returnOpen = ref(false),
  refundOpen = ref(false)
const collectionSelection = ref<SalesOrder>()
const refundSelection = ref<OrderSettlementSummary>()
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
// Child dialogs already watch authoritative summaries. Keep their order prop
// stable during a mutation so a summary refresh does not restart their form.
const showCollection = (): void => {
  collectionSelection.value = current.value
  open.value = true
}
const showRefund = (): void => {
  refundSelection.value = refundOrder.value
  refundOpen.value = true
}
</script>
<template>
  <section
    v-if="inScope(order.warehouseId)"
    :class="{ 'order-payment-panel--receivable': presentation === 'receivable' }"
  >
    <section
      :class="{ 'order-settlement-section': presentation === 'receivable' }"
      :aria-label="presentation === 'receivable' ? 'Thanh toán và trả hàng' : undefined"
    >
      <h3 v-if="presentation === 'receivable'" class="order-section-heading">
        <FileTextOutlined aria-hidden="true" />Thanh toán và trả hàng
      </h3>
      <SettlementDetails :settlement="current" :presentation="presentation" />
    </section>
    <p v-if="presentation !== 'receivable'">Thanh toán: {{ paymentLabel(current) }}</p>
    <div :class="{ 'order-payment-actions': presentation === 'receivable' }">
      <a-button
        v-if="
          current.status === 'CONFIRMED' && can('SALES_RETURN_VIEW') && can('SALES_RETURN_CREATE')
        "
        @click="returnOpen = true"
        ><template v-if="presentation === 'receivable'" #icon
          ><RollbackOutlined aria-hidden="true" /></template
        >Trả hàng</a-button
      >
      <a-button
        v-if="
          current.status === 'CONFIRMED' &&
          current.refundableAmount !== undefined &&
          BigInt(current.refundableAmount) > 0n &&
          can('REFUND_CREATE')
        "
        @click="showRefund"
        ><template v-if="presentation === 'receivable'" #icon
          ><TransactionOutlined aria-hidden="true" /></template
        >Hoàn tiền</a-button
      >
      <router-link
        v-if="can('REFUND_VIEW')"
        :to="{ path: '/sales/refunds', query: { salesOrderId: current.id } }"
        :class="{ 'order-refund-history-link': presentation === 'receivable' }"
        ><HistoryOutlined v-if="presentation === 'receivable'" aria-hidden="true" />Lịch sử hoàn
        tiền</router-link
      >
      <a-button
        v-if="can('PAYMENT_CREATE') && (canCollect(current) || payments.attempts[current.id])"
        type="primary"
        @click="showCollection"
        ><template v-if="presentation === 'receivable'" #icon
          ><WalletOutlined aria-hidden="true" /></template
        >{{ payments.attempts[current.id] ? 'Kiểm tra / thử lại lần thu' : 'Thu tiền' }}</a-button
      >
    </div>
    <section
      v-if="can('PAYMENT_VIEW')"
      :class="{ 'order-payment-history-section': presentation === 'receivable' }"
      aria-label="Lịch sử thanh toán"
    >
      <h3 :class="{ 'order-section-heading': presentation === 'receivable' }">
        <SolutionOutlined v-if="presentation === 'receivable'" aria-hidden="true" />Lịch sử thanh
        toán
      </h3>
      <PaymentHistory :order-id="order.id" :flow-layout="presentation === 'receivable'" />
    </section>
    <ReturnDialog
      v-model:open="returnOpen"
      :sales-order-id="current.id"
      :sales-order-code="current.code"
      :warehouse-id="current.warehouseId"
      @saved="emit('refreshRequested')"
    />
    <RefundDialog
      v-model:open="refundOpen"
      :order="presentation === 'receivable' ? (refundSelection ?? refundOrder) : refundOrder"
      @updated="emit('refreshRequested')"
      @refresh-requested="emit('refreshRequested')"
    />
    <CollectPaymentDialog
      v-model:open="open"
      :order="presentation === 'receivable' ? (collectionSelection ?? current) : current"
      @updated="emit('updated', $event)"
      @refresh-requested="emit('refreshRequested')"
    />
  </section>
</template>

<style scoped>
.order-payment-panel--receivable {
  display: flex;
  flex-direction: column;
  gap: 18px;
  min-width: 0;
}
.order-settlement-section,
.order-payment-history-section {
  min-width: 0;
  padding: 18px;
  border: 1px solid #e9e4f1;
  border-radius: 12px;
  background: #fff;
}
.order-section-heading {
  display: flex;
  align-items: center;
  gap: 12px;
  margin: 0 0 14px;
  color: #302640;
  font-size: 18px;
  font-weight: 650;
}
.order-section-heading > :first-child {
  flex-shrink: 0;
  color: #7357cf;
  font-size: 21px;
}
.order-payment-actions {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 10px 16px;
}
.order-payment-actions :deep(.ant-btn),
.order-refund-history-link {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  min-height: 40px;
  height: auto;
  max-width: 100%;
  padding: 8px 14px;
  white-space: normal;
  overflow-wrap: anywhere;
}
.order-refund-history-link {
  color: #7357cf;
  border-radius: 8px;
}
.order-refund-history-link:focus-visible {
  outline: 2px solid #7357cf;
  outline-offset: 2px;
}
@media (max-width: 767px) {
  .order-settlement-section,
  .order-payment-history-section {
    padding: 14px 12px;
  }
  .order-payment-actions :deep(.ant-btn),
  .order-refund-history-link {
    min-height: 44px;
  }
  .order-payment-history-section :deep(.payment-filters--embedded) {
    grid-template-columns: minmax(0, 1fr);
  }
  .order-payment-history-section :deep(.payment-filters .ant-btn),
  .order-payment-history-section :deep(.products-toolbar .ant-btn),
  .order-payment-history-section :deep(.payment-actions .ant-btn) {
    min-height: 44px;
    min-width: 44px;
  }
  .order-payment-history-section :deep(.payment-filter .ant-select-selector) {
    min-height: 44px;
  }
}
</style>
