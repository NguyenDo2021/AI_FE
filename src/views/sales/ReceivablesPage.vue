<script setup lang="ts">
import PendingPaymentRetries from '@/components/sales/PendingPaymentRetries.vue'
import { computed, reactive, ref, watch, onBeforeUnmount } from 'vue'
import { BasicTable } from '@/components'
import ReceivableOrders from '@/components/sales/ReceivableOrders.vue'
import CustomerReceivablesDialog from '@/components/sales/CustomerReceivablesDialog.vue'
import { getReceivables, getWalkInOrders } from '@/api/payments/payments.api'
import { usePaymentScope } from '@/composables/usePaymentScope'
import { usePaymentsStore } from '@/stores/payments'
import { paymentError } from '@/utils/payments'
import { formatStockInteger } from '@/utils/stock'
import type { Receivable } from '@/types/payments'
import type { SalesOrder } from '@/types/sales'
import type { NormalizedApiError } from '@/utils/request'
const { can, warehouses, inScope, contextKey, refreshAccess } = usePaymentScope()
const payments = usePaymentsStore()
const tab = ref('customers')
const rows = ref<Receivable[]>([])
const orders = ref<SalesOrder[]>([])
const page = ref(1)
const pageSize = ref(10)
const total = ref(0)
const loading = ref(false)
const error = ref('')
const filters = reactive({ warehouseId: warehouses.selectedId, customerId: '', keyword: '' })
const customerId = ref<string>()
const customerName = ref<string>()
const open = ref(false)
let sequence = 0
const warehouseOptions = computed(() =>
  warehouses.warehouses.map((item) => ({ value: item.id, label: item.code + ' — ' + item.name })),
)
const columns = [
  ['warehouseId', 'Kho'],
  ['customerCode', 'Mã khách'],
  ['customerName', 'Tên khách'],
  ['outstandingOrderCount', 'Số đơn còn nợ'],
  ['totalAmount', 'Giá trị các đơn còn nợ'],
  ['paidAmount', 'Đã thu trên các đơn còn nợ'],
  ['remainingAmount', 'Còn nợ'],
  ['actions', 'Thao tác'],
].map(([key, title]) => ({ key, dataIndex: key, title }))
const pagination = computed(() => ({
  current: page.value,
  pageSize: pageSize.value,
  total: total.value,
  showSizeChanger: true,
  pageSizeOptions: ['1', '10', '20', '50', '100'],
}))
const load = async (): Promise<void> => {
  const current = ++sequence
  rows.value = []
  orders.value = []
  total.value = 0
  error.value = ''
  loading.value = false
  if (
    !can('RECEIVABLE_VIEW') ||
    !warehouses.warehouses.length ||
    (filters.warehouseId && !inScope(filters.warehouseId))
  )
    return
  loading.value = true
  try {
    const paging = {
      page: page.value,
      pageSize: pageSize.value,
      ...(filters.warehouseId ? { warehouseId: filters.warehouseId } : {}),
    }
    if (tab.value === 'customers') {
      const result = await getReceivables({
        ...paging,
        ...(filters.customerId ? { customerId: filters.customerId } : {}),
        ...(filters.keyword ? { keyword: filters.keyword } : {}),
      })
      if (current !== sequence) return
      rows.value = result.items.filter((item) => inScope(item.warehouseId))
      total.value = result.total
    } else {
      const result = await getWalkInOrders(paging)
      if (current !== sequence) return
      orders.value = result.items.filter((item) => inScope(item.warehouseId))
      payments.syncOrders(orders.value)
      total.value = result.total
    }
  } catch (cause) {
    if (current === sequence) error.value = paymentError(cause)
    if ((cause as NormalizedApiError).status === 403) await refreshAccess()
  } finally {
    if (current === sequence) loading.value = false
  }
}
watch(
  () => [tab.value, ...Object.values(filters)],
  () => {
    page.value = 1
    void load()
  },
)
watch(
  contextKey,
  () => {
    ++sequence
    open.value = false
    customerId.value = undefined
    customerName.value = undefined
    filters.warehouseId = warehouses.selectedId
    page.value = 1
    void load()
  },
  { immediate: true, flush: 'sync' },
)
watch(
  () => payments.revision,
  () => void load(),
)
onBeforeUnmount(() => ++sequence)
const changePage = (next: number, size: number): void => {
  page.value = size !== pageSize.value ? 1 : next
  pageSize.value = size
  void load()
}
const showCustomer = (id: string, name?: string): void => {
  customerId.value = id
  customerName.value = name
  open.value = true
}
</script>
<template>
  <section>
    <PendingPaymentRetries />
    <h1>{{ $t('sales.receivables') }}</h1>
    <p>
      Công nợ hiện tại. Các giá trị theo khách/kho chỉ bao gồm đơn còn nợ, không bao gồm đơn đã trả
      đủ.
    </p>
    <a-alert v-if="error" type="error" :message="error" />
    <a-alert
      v-if="!can('RECEIVABLE_VIEW')"
      type="warning"
      message="Thiếu RECEIVABLE_VIEW để xem công nợ."
    />
    <template v-else>
      <a-alert
        v-if="!warehouses.warehouses.length"
        type="info"
        message="Không có kho trong phạm vi được phép. Tải lại kho trên thanh công cụ."
      />
      <a-tabs v-model:active-key="tab">
        <a-tab-pane key="customers" tab="Công nợ khách hàng" />
        <a-tab-pane key="walk-in" tab="Đơn khách lẻ chưa thanh toán" />
      </a-tabs>
      <div class="filters">
        <a-select
          v-model:value="filters.warehouseId"
          :options="warehouseOptions"
          placeholder="Tất cả kho được giao"
          allow-clear
        />
        <template v-if="tab === 'customers'">
          <a-input
            v-model:value="filters.keyword"
            placeholder="Mã / tên / điện thoại khách"
            allow-clear
          />
          <a-input v-model:value="filters.customerId" placeholder="UUID khách" allow-clear />
          <a-button :disabled="!filters.customerId" @click="showCustomer(filters.customerId)"
            >Xem công nợ theo UUID khách</a-button
          >
        </template>
        <a-button
          @click="Object.assign(filters, { warehouseId: undefined, customerId: '', keyword: '' })"
          >Đặt lại</a-button
        >
      </div>
      <BasicTable
        v-if="tab === 'customers'"
        :columns="columns"
        :data-source="rows"
        :row-key="(row) => row.warehouseId + ':' + row.customerId"
        :pagination="pagination"
        :loading="loading"
        :scroll="{ x: 1400 }"
        @reload="load"
        @page-change="changePage"
      >
        <template #bodyCell="{ column, record }">
          <template v-if="column.key === 'warehouseId'">{{
            warehouses.warehouses.find((item) => item.id === record.warehouseId)?.name ??
            record.warehouseId
          }}</template>
          <template
            v-else-if="
              ['totalAmount', 'paidAmount', 'remainingAmount'].includes(String(column.key))
            "
            >{{ formatStockInteger(record[column.key]) }} VND</template
          >
          <a-button
            v-else-if="column.key === 'actions'"
            size="small"
            @click="showCustomer(record.customerId, record.customerName)"
            >Chi tiết công nợ</a-button
          >
        </template>
      </BasicTable>
      <ReceivableOrders
        v-else
        :rows="orders"
        :loading="loading"
        :page="page"
        :page-size="pageSize"
        :total="total"
        @reload="load"
        @page-change="changePage"
      />
    </template>
    <CustomerReceivablesDialog
      v-model:open="open"
      :customer-id="customerId"
      :customer-name="customerName"
    />
  </section>
</template>
<style scoped>
.filters {
  display: flex;
  gap: 12px;
  flex-wrap: wrap;
  margin: 16px 0;
}
.filters > * {
  min-width: 180px;
  max-width: 280px;
}
</style>
