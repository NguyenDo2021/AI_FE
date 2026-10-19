<script setup lang="ts">
import { computed, onBeforeUnmount, reactive, ref, watch } from 'vue'
import { useRoute } from 'vue-router'
import { BasicTable } from '@/components'
import ReturnDialog from '@/components/sales/ReturnDialog.vue'
import { usePaymentScope } from '@/composables/usePaymentScope'
import { getReturns } from '@/api/sales/returns.api'
import { returnError, hasNextPage } from '@/utils/returns'
import { formatStockInteger as fmt } from '@/utils/stock'
import { formatDateTime } from '@/utils/date'
import type { SalesReturn } from '@/types/returns'
import type { StockInteger, ReceiptStatus } from '@/types/stock'
const { warehouses, can, inScope, contextKey, refreshAccess } = usePaymentScope()
const route = useRoute()
const rows = ref<SalesReturn[]>([]),
  total = ref<StockInteger>(),
  loading = ref(false),
  error = ref('')
const open = ref(false),
  id = ref<string>()
const filters = reactive({
  warehouseId: warehouses.selectedId,
  salesOrderId: '',
  status: undefined as ReceiptStatus | undefined,
  from: '',
  to: '',
  page: 1,
  pageSize: 10,
})
let sequence = 0
const columns = [
  ['code', 'Mã phiếu'],
  ['warehouseId', 'Kho'],
  ['salesOrderId', 'Đơn nguồn'],
  ['returnDate', 'Ngày trả'],
  ['reason', 'Lý do'],
  ['totalAmount', 'Giá trị trả'],
  ['status', 'Trạng thái'],
  ['createdBy', 'Người tạo'],
  ['createdAt', 'Thời gian tạo'],
  ['actions', 'Thao tác'],
].map(([key, title]) => ({ key, dataIndex: key, title }))
const options = computed(() =>
  warehouses.warehouses.map((w) => ({ value: w.id, label: w.code + ' — ' + w.name })),
)
const show = (value?: string): void => {
  id.value = value
  open.value = true
}
const load = async (): Promise<void> => {
  const current = ++sequence
  rows.value = []
  total.value = undefined
  loading.value = false
  error.value = ''
  if (
    !can('SALES_RETURN_VIEW') ||
    !warehouses.loaded ||
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
    const result = await getReturns({
      ...filters,
      warehouseId: filters.warehouseId || undefined,
      salesOrderId: filters.salesOrderId || undefined,
      from: filters.from || undefined,
      to: filters.to || undefined,
    })
    if (current !== sequence) return
    rows.value = result.items.filter((row) => inScope(row.warehouseId))
    total.value = result.total
  } catch (cause) {
    if (current !== sequence) return
    error.value = returnError(cause)
    if ((cause as { status?: number }).status === 403) {
      rows.value = []
      open.value = false
      await refreshAccess()
    }
  } finally {
    if (current === sequence) loading.value = false
  }
}
watch(
  () => [
    filters.warehouseId,
    filters.salesOrderId,
    filters.status,
    filters.from,
    filters.to,
    filters.pageSize,
  ],
  () => {
    filters.page = 1
    void load()
  },
)
watch(
  contextKey,
  () => {
    ++sequence
    rows.value = []
    open.value = false
    id.value = undefined
    filters.warehouseId = warehouses.selectedId
    filters.page = 1
    void load()
  },
  { immediate: true, flush: 'sync' },
)
watch(
  () => [route.query.returnId, warehouses.loaded],
  () => {
    const value = route.query.returnId
    if (warehouses.loaded && typeof value === 'string' && can('SALES_RETURN_VIEW')) show(value)
  },
  { immediate: true },
)
onBeforeUnmount(() => ++sequence)
const change = (delta: number): void => {
  filters.page += delta
  void load()
}
</script>
<template>
  <section>
    <h1>Trả hàng</h1>
    <a-button
      v-if="can('SALES_RETURN_CREATE') && can('SALES_RETURN_VIEW')"
      type="primary"
      @click="show()"
      >Tạo phiếu trả nháp</a-button
    >
    <a-alert v-if="error" type="error" :message="error" />
    <a-alert
      v-if="!warehouses.warehouses.length"
      type="info"
      message="Không có kho được giao. Tải lại phạm vi kho trên thanh công cụ."
    />
    <a-form layout="inline" style="margin: 16px 0; gap: 12px">
      <a-form-item label="Kho"
        ><a-select
          v-model:value="filters.warehouseId"
          :options="options"
          allow-clear
          style="min-width: 200px"
      /></a-form-item>
      <a-form-item label="ID đơn nguồn"
        ><a-input v-model:value="filters.salesOrderId"
      /></a-form-item>
      <a-form-item label="Trạng thái"
        ><a-select
          v-model:value="filters.status"
          allow-clear
          style="min-width: 150px"
          :options="
            ['DRAFT', 'CONFIRMED', 'CANCELLED'].map((value) => ({
              value,
              label: $t('sales.' + value),
            }))
          "
      /></a-form-item>
      <a-form-item label="Từ ngày trả"
        ><a-date-picker v-model:value="filters.from" value-format="YYYY-MM-DD"
      /></a-form-item>
      <a-form-item label="Đến ngày trả (bao gồm)"
        ><a-date-picker v-model:value="filters.to" value-format="YYYY-MM-DD"
      /></a-form-item>
    </a-form>
    <BasicTable
      :columns="columns"
      :data-source="rows"
      :loading="loading"
      :scroll="{ x: 1600 }"
      @reload="load"
    >
      <template #bodyCell="{ column, record }">
        <template v-if="column.key === 'warehouseId'">{{
          warehouses.warehouses.find((w) => w.id === record.warehouseId)?.name ?? record.warehouseId
        }}</template>
        <template v-else-if="column.key === 'totalAmount'"
          >{{ fmt(record.totalAmount) }} VND<span v-if="record.status === 'DRAFT'">
            (Dự kiến)</span
          ></template
        >
        <template v-else-if="column.key === 'createdAt'">{{
          formatDateTime(record.createdAt)
        }}</template>
        <a-tag v-else-if="column.key === 'status'">{{ $t('sales.' + record.status) }}</a-tag>
        <a-button v-else-if="column.key === 'actions'" @click="show(record.id)"
          >Chi tiết / xử lý</a-button
        >
      </template>
    </BasicTable>
    <a-space
      ><span
        >Tổng {{ total === undefined ? '—' : fmt(total) }} phiếu ? Trang {{ filters.page }}</span
      ><a-button :disabled="filters.page <= 1 || loading" @click="change(-1)">Trước</a-button
      ><a-button
        :disabled="loading || !hasNextPage(total, filters.page, filters.pageSize)"
        @click="change(1)"
        >Sau</a-button
      ><a-select
        v-model:value="filters.pageSize"
        :options="[10, 20, 50, 100].map((value) => ({ value, label: String(value) }))"
    /></a-space>
    <ReturnDialog :id="id" v-model:open="open" @saved="load" />
  </section>
</template>
