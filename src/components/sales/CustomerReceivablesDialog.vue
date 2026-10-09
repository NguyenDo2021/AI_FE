<script setup lang="ts">
import { ref, watch, onBeforeUnmount } from 'vue'
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
const emit = defineEmits<{ 'update:open': [value: boolean] }>()
const { can, inScope, contextKey, refreshAccess } = usePaymentScope()
const payments = usePaymentsStore()
const detail = ref<CustomerReceivables>()
const page = ref(1)
const pageSize = ref(10)
const loading = ref(false)
const error = ref('')
let sequence = 0
const load = async (): Promise<void> => {
  const current = ++sequence
  detail.value = undefined
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
    if (current === sequence) error.value = paymentError(cause)
    if ((cause as NormalizedApiError).status === 403) await refreshAccess()
  } finally {
    if (current === sequence) loading.value = false
  }
}
watch(
  () => [props.open, props.customerId],
  () => {
    page.value = 1
    void load()
  },
  { immediate: true },
)
watch(
  () => payments.revision,
  () => void load(),
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
</script>
<template>
  <BasicModal
    :open="open"
    title="Công nợ hiện tại của khách"
    :width="1200"
    @update:open="emit('update:open', false)"
  >
    <a-alert v-if="error" type="error" :message="error" />
    <p>{{ customerName || customerId }}</p>
    <a-spin :spinning="loading">
      <template v-if="detail">
        <h3>Tổng công nợ khách: {{ formatStockInteger(detail.remainingAmount) }} VND</h3>
        <p>
          ID kho: {{ detail.warehouseId }}. Tổng do backend cung cấp cho toàn bộ đơn còn nợ, độc lập
          với trang đang xem.
        </p>
        <ReceivableOrders
          :rows="detail.orders.items"
          :loading="loading"
          :page="page"
          :page-size="pageSize"
          :total="detail.orders.total"
          @reload="load"
          @page-change="changePage"
        />
      </template>
    </a-spin>
    <template #footer
      ><a-button @click="emit('update:open', false)">Đóng</a-button
      ><a-button :disabled="loading" @click="load">Tải lại công nợ</a-button></template
    >
  </BasicModal>
</template>
