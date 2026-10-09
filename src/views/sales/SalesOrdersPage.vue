<script setup lang="ts">
import { computed, onBeforeUnmount, reactive, ref, watch } from 'vue'
import { BasicTable } from '@/components'
import SalesOrderDialog from '@/components/sales/SalesOrderDialog.vue'
import CustomerSelect from '@/components/sales/CustomerSelect.vue'
import { getSalesOrders, getCustomer } from '@/api/sales/sales.api'
import { useSalesScope } from '@/composables/useSalesScope'
import { salesCustomerName, salesError } from '@/utils/sales'
import { formatStockInteger } from '@/utils/stock'
import type { SalesOrder, Customer } from '@/types/sales'
import type { ReceiptStatus } from '@/types/stock'
const { can, warehouses, scopeKey, inScope, refreshScope } = useSalesScope()
const rows = ref<SalesOrder[]>([])
const customers = ref<Customer[]>([])
const page = ref(1)
const pageSize = ref(10)
const total = ref(0)
const loading = ref(false)
const error = ref('')
const filters = reactive({
  warehouseId: warehouses.selectedId,
  customerId: undefined as string | undefined,
  status: undefined as ReceiptStatus | undefined,
  from: '',
  to: '',
})
const open = ref(false)
const id = ref<string>()
const mode = ref<'create' | 'edit' | 'view' | 'confirm' | 'cancel'>('view')
let sequence = 0
const columns = [
  'code',
  'warehouse',
  'customer',
  'saleDate',
  'subtotal',
  'discountAmount',
  'totalAmount',
  'status',
  'actions',
].map((key, index) => ({
  key,
  dataIndex: key,
  title: [
    'Mã đơn',
    'Kho',
    'Khách',
    'Ngày bán',
    'Tạm tính',
    'Giảm giá',
    'Tổng tiền',
    'Trạng thái',
    'Thao tác',
  ][index],
}))
const warehouseOptions = computed(() =>
  warehouses.warehouses.map((item) => ({ value: item.id, label: item.code + ' — ' + item.name })),
)
const pagination = computed(() => ({
  current: page.value,
  pageSize: pageSize.value,
  total: total.value,
  showSizeChanger: true,
  pageSizeOptions: ['10', '20', '50', '100'],
}))
const load = async (): Promise<void> => {
  const current = ++sequence
  rows.value = []
  customers.value = []
  total.value = 0
  error.value = ''
  loading.value = false
  if (
    !can('SALES_ORDER_VIEW') ||
    !warehouses.warehouses.length ||
    (filters.warehouseId && !inScope(filters.warehouseId))
  )
    return
  if (filters.from && filters.to && filters.from > filters.to) {
    error.value = 'Ngày bắt đầu không được sau ngày kết thúc.'
    return
  }
  loading.value = true
  try {
    const result = await getSalesOrders({
      page: page.value,
      pageSize: pageSize.value,
      ...(filters.warehouseId ? { warehouseId: filters.warehouseId } : {}),
      ...(filters.customerId ? { customerId: filters.customerId } : {}),
      ...(filters.status ? { status: filters.status } : {}),
      ...(filters.from ? { from: filters.from } : {}),
      ...(filters.to ? { to: filters.to } : {}),
    })
    if (current !== sequence) return
    rows.value = result.items.filter((item) => inScope(item.warehouseId))
    total.value = result.total
    if (can('CUSTOMER_VIEW')) {
      const ids = [
        ...new Set(
          rows.value
            .filter((item) => !item.customerSnapshot && item.customerId)
            .map((item) => item.customerId!),
        ),
      ]
      const results = await Promise.allSettled(ids.map(getCustomer))
      if (current !== sequence) return
      customers.value = results.flatMap((result) =>
        result.status === 'fulfilled' && inScope(result.value.warehouseId) ? [result.value] : [],
      )
      if (
        results.some(
          (result) =>
            result.status === 'rejected' && (result.reason as { status?: number }).status === 403,
        )
      )
        await refreshScope()
    }
  } catch (cause) {
    if (current === sequence) error.value = salesError(cause)
    if ((cause as { status?: number }).status === 403) await refreshScope()
  } finally {
    if (current === sequence) loading.value = false
  }
}
watch(
  () => filters.warehouseId,
  () => {
    filters.customerId = undefined
  },
)
watch(
  () => [filters.warehouseId, filters.customerId, filters.status, filters.from, filters.to],
  () => {
    page.value = 1
    void load()
  },
)
watch(
  () => warehouses.selectedId,
  (value) => {
    filters.warehouseId = value
  },
)
watch(
  scopeKey,
  () => {
    ++sequence
    open.value = false
    if (filters.warehouseId && !inScope(filters.warehouseId)) filters.warehouseId = undefined
    page.value = 1
    void load()
  },
  { immediate: true, flush: 'sync' },
)
onBeforeUnmount(() => ++sequence)
const show = (value: typeof mode.value, order?: SalesOrder): void => {
  mode.value = value
  id.value = order?.id
  open.value = true
}
const changePage = (next: number, size: number): void => {
  page.value = size !== pageSize.value ? 1 : next
  pageSize.value = size
  void load()
}
</script>
<template>
  <section>
    <div class="heading">
      <h1>{{ $t('sales.orders') }}</h1>
      <a-button v-if="can('SALES_ORDER_CREATE')" type="primary" @click="show('create')"
        >Tạo đơn bán hàng</a-button
      >
    </div>
    <a-alert v-if="error" type="error" :message="error" />
    <a-alert
      v-if="!can('SALES_ORDER_VIEW')"
      type="warning"
      message="Thiếu SALES_ORDER_VIEW để xem danh sách."
    />
    <a-alert
      v-else-if="!warehouses.warehouses.length"
      type="info"
      message="Không có kho trong phạm vi được phép. Tải lại kho trên thanh công cụ."
    />
    <template v-else>
      <div class="filters">
        <a-select
          v-model:value="filters.warehouseId"
          :options="warehouseOptions"
          placeholder="Tất cả kho được giao"
          allow-clear
        />
        <CustomerSelect v-model:value="filters.customerId" :warehouse-id="filters.warehouseId" />
        <a-select
          v-model:value="filters.status"
          :options="[
            { value: 'DRAFT', label: $t('sales.DRAFT') },
            { value: 'CONFIRMED', label: $t('sales.CONFIRMED') },
            { value: 'CANCELLED', label: $t('sales.CANCELLED') },
          ]"
          placeholder="Tất cả trạng thái"
          allow-clear
        />
        <a-date-picker
          v-model:value="filters.from"
          value-format="YYYY-MM-DD"
          placeholder="Từ ngày"
        />
        <a-date-picker
          v-model:value="filters.to"
          value-format="YYYY-MM-DD"
          placeholder="Đến ngày (bao gồm)"
        />
        <a-button
          @click="
            Object.assign(filters, {
              warehouseId: undefined,
              customerId: undefined,
              status: undefined,
              from: '',
              to: '',
            })
          "
          >Đặt lại</a-button
        >
      </div>
      <BasicTable
        :columns="columns"
        :data-source="rows"
        :loading="loading"
        :pagination="pagination"
        :scroll="{ x: 1400 }"
        @reload="load"
        @page-change="changePage"
      >
        <template #bodyCell="{ column, record }">
          <template v-if="column.key === 'warehouse'">{{
            warehouses.warehouses.find((item) => item.id === record.warehouseId)?.name ??
            record.warehouseId
          }}</template>
          <template v-else-if="column.key === 'customer'">{{
            salesCustomerName(record, customers)
          }}</template>
          <template
            v-else-if="['subtotal', 'discountAmount', 'totalAmount'].includes(String(column.key))"
            >{{ formatStockInteger(record[column.key]) }} VND</template
          >
          <a-tag
            v-else-if="column.key === 'status'"
            :color="
              record.status === 'CONFIRMED'
                ? 'green'
                : record.status === 'CANCELLED'
                  ? 'red'
                  : 'default'
            "
            >{{ $t('sales.' + record.status) }}</a-tag
          >
          <a-space v-else-if="column.key === 'actions'" wrap>
            <a-button size="small" @click="show('view', record)">Chi tiết</a-button>
            <a-button
              v-if="record.status === 'DRAFT' && can('SALES_ORDER_UPDATE')"
              size="small"
              @click="show('edit', record)"
              >Sửa</a-button
            >
            <a-button
              v-if="record.status === 'DRAFT' && can('SALES_ORDER_CONFIRM')"
              size="small"
              type="primary"
              @click="show('confirm', record)"
              >Xác nhận xuất</a-button
            >
            <a-button
              v-if="record.status !== 'CANCELLED' && can('SALES_ORDER_CANCEL')"
              size="small"
              danger
              @click="show('cancel', record)"
              >Hủy</a-button
            >
          </a-space>
        </template>
      </BasicTable>
    </template>
    <SalesOrderDialog :id="id" v-model:open="open" :mode="mode" @saved="load" />
  </section>
</template>
<style scoped>
.heading {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 20px;
}
.filters {
  display: flex;
  gap: 12px;
  flex-wrap: wrap;
  margin: 20px 0;
}
.filters > * {
  min-width: 180px;
}
</style>
