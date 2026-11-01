<script setup lang="ts">
import { computed, ref, watch, onBeforeUnmount } from 'vue'
import { ReloadOutlined } from '@ant-design/icons-vue'
import { BasicModal } from '@/components'
import ReceivableOrders from './ReceivableOrders.vue'
import { getCustomerReceivables } from '@/api/payments/payments.api'
import { usePaymentScope } from '@/composables/usePaymentScope'
import { usePaymentsStore } from '@/stores/payments'
import { paymentError } from '@/utils/payments'
import { formatStockInteger } from '@/utils/stock'
import type { CustomerReceivables } from '@/types/payments'
import type { NormalizedApiError } from '@/utils/request'
const props = defineProps<{ open: boolean; customerId?: string; customerName?: string }>()
const emit = defineEmits<{ 'update:open': [value: boolean]; reload: [] }>()
const { can, warehouses, inScope, contextKey, refreshAccess } = usePaymentScope()
const payments = usePaymentsStore()
const detail = ref<CustomerReceivables>()
const page = ref(1)
const pageSize = ref(10)
const loading = ref(false)
const error = ref('')
let sequence = 0
const warehouseName = computed(
  () =>
    warehouses.warehouses.find((item) => item.id === detail.value?.warehouseId)?.name ??
    detail.value?.warehouseId,
)
const load = async (): Promise<void> => {
  const current = ++sequence
  error.value = ''
  loading.value = false
  if (!props.open || !props.customerId || !can('RECEIVABLE_VIEW')) return
  loading.value = true
  try {
    const result = await getCustomerReceivables(props.customerId, {
      page: page.value,
      pageSize: pageSize.value,
    })
    if (current === sequence && inScope(result.warehouseId)) {
      detail.value = result
      payments.syncOrders(result.orders.items)
    }
  } catch (cause) {
    if (current !== sequence) return
    error.value = paymentError(cause)
    if ((cause as NormalizedApiError).status === 403) await refreshAccess(cause)
  } finally {
    if (current === sequence) loading.value = false
  }
}
watch(
  () => [props.open, props.customerId, payments.revision],
  (value, previous) => {
    if (!previous || value[0] !== previous[0] || value[1] !== previous[1]) {
      detail.value = undefined
      page.value = 1
    }
    void load()
  },
  { immediate: true },
)
watch(
  contextKey,
  () => {
    ++sequence
    detail.value = undefined
    emit('update:open', false)
  },
  { flush: 'sync' },
)
onBeforeUnmount(() => ++sequence)
const changePage = (next: number, size: number): void => {
  page.value = size !== pageSize.value ? 1 : next
  pageSize.value = size
  void load()
}
const reload = (): void => {
  void load()
  emit('reload')
}
</script>
<template>
  <BasicModal
    :open="open"
    title="Chi tiết công nợ khách hàng"
    :width="1400"
    wrap-class-name="customer-receivables-dialog"
    @update:open="emit('update:open', false)"
  >
    <a-alert v-if="error" type="error" :message="error" show-icon />
    <a-spin :spinning="loading">
      <template v-if="detail">
        <div class="customer-debt-summary">
          <div>
            <span>Khách hàng</span>
            <h2>{{ customerName || detail.customerId }}</h2>
          </div>
          <div class="customer-debt-total">
            <span>Tổng công nợ hiện tại</span
            ><strong>{{ formatStockInteger(detail.remainingAmount) }} VND</strong>
          </div>
        </div>
        <div class="customer-debt-scope">
          <span>Phạm vi: {{ warehouseName }}</span>
          <p>Tổng toàn bộ đơn còn nợ trong phạm vi, không phụ thuộc trang đang xem.</p>
        </div>
        <details class="customer-debt-identifiers">
          <summary>Thông tin định danh</summary>
          <dl>
            <dt>UUID khách</dt>
            <dd>{{ detail.customerId }}</dd>
            <dt>UUID kho</dt>
            <dd>{{ detail.warehouseId }}</dd>
          </dl>
        </details>
        <ReceivableOrders
          :rows="detail.orders.items"
          :loading="loading"
          :page="page"
          :page-size="pageSize"
          :total="detail.orders.total"
          :body-max-height="360"
          @reload="reload"
          @page-change="changePage"
        />
      </template>
      <a-empty
        v-else-if="!loading && !error"
        description="Không có dữ liệu công nợ trong phạm vi được phép."
      />
      <div v-else-if="loading" class="customer-debt-loading" aria-busy="true">
        Đang tải công nợ…
      </div>
    </a-spin>
    <template #footer
      ><a-button @click="emit('update:open', false)">Đóng</a-button
      ><a-button type="primary" :loading="loading" aria-label="Tải lại công nợ" @click="reload"
        ><template #icon><ReloadOutlined /></template>Tải lại công nợ</a-button
      ></template
    >
  </BasicModal>
</template>

<style scoped>
.customer-debt-summary {
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
  align-items: center;
  gap: 20px;
  padding: 18px;
  border-radius: 10px;
  background: #f3eefc;
  color: #443257;
}
.customer-debt-summary > div {
  min-width: 0;
}
.customer-debt-summary span {
  font-size: 13px;
}
.customer-debt-summary h2 {
  margin: 4px 0 0;
  color: #302640;
  font-size: 24px;
  overflow-wrap: anywhere;
}
.customer-debt-total {
  text-align: right;
}
.customer-debt-total strong {
  display: block;
  margin-top: 4px;
  color: #7357cf;
  font-size: 28px;
  line-height: 36px;
  font-variant-numeric: tabular-nums;
  overflow-wrap: anywhere;
}
.customer-debt-scope {
  display: flex;
  flex-wrap: wrap;
  gap: 6px 20px;
  margin: 12px 0;
  overflow-wrap: anywhere;
}
.customer-debt-scope p {
  margin: 0;
  color: #797184;
  font-size: 13px;
}
.customer-debt-identifiers {
  margin-bottom: 12px;
  padding: 10px 14px;
  border: 1px solid #e9e4f1;
  border-radius: 8px;
  background: #faf9fc;
}
.customer-debt-identifiers summary {
  cursor: pointer;
  color: #443257;
}
.customer-debt-identifiers dl {
  display: grid;
  grid-template-columns: auto minmax(0, 1fr);
  gap: 8px 16px;
  margin-bottom: 0;
}
.customer-debt-identifiers dd {
  margin: 0;
  overflow-wrap: anywhere;
}
.customer-debt-loading {
  min-height: 160px;
  padding: 60px 0;
  text-align: center;
  color: #797184;
}
:global(.customer-receivables-dialog .ant-modal) {
  top: 20px;
  max-width: calc(100% - 24px);
  padding-bottom: 20px;
}
:global(.customer-receivables-dialog .ant-modal-content) {
  display: flex;
  flex-direction: column;
  max-height: calc(100dvh - 40px);
  padding: 0;
  border-radius: 16px;
}
:global(.customer-receivables-dialog .ant-modal-header) {
  flex-shrink: 0;
  margin: 0;
  padding: 20px 48px 16px 24px;
  border-bottom: 1px solid #eee8f6;
  border-radius: 16px 16px 0 0;
}
:global(.customer-receivables-dialog .ant-modal-body) {
  min-width: 0;
  min-height: 0;
  overflow: auto;
  padding: 18px 24px;
}
:global(.customer-receivables-dialog .ant-modal-footer) {
  flex-shrink: 0;
  margin: 0;
  padding: 14px 24px;
  border-top: 1px solid #eee8f6;
}
@media (max-width: 767px) {
  .customer-debt-summary {
    grid-template-columns: minmax(0, 1fr);
    gap: 14px;
    padding: 14px;
  }
  .customer-debt-total {
    text-align: left;
  }
  .customer-debt-total strong {
    font-size: 24px;
  }
  :global(.customer-receivables-dialog .ant-modal-body) {
    padding: 14px 12px;
  }
  :global(.customer-receivables-dialog .ant-modal-footer .ant-btn) {
    min-height: 44px;
  }
}
@media (max-height: 320px) {
  :global(.customer-receivables-dialog .ant-modal-content) {
    max-height: none;
  }
}
</style>
