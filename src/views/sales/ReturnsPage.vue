<script setup lang="ts">
import { computed, onBeforeUnmount, reactive, ref, watch } from 'vue'
import { useRoute } from 'vue-router'
import ReturnRefundList from '@/components/sales/ReturnRefundList.vue'
import { EyeOutlined, PlusOutlined, ReloadOutlined, SearchOutlined } from '@ant-design/icons-vue'
import type { TableColumnsType } from 'ant-design-vue'
import ReturnDialog from '@/components/sales/ReturnDialog.vue'
import { usePaymentScope } from '@/composables/usePaymentScope'
import { getReturns } from '@/api/sales/returns.api'
import { returnError, returnStatusLabel } from '@/utils/returns'
import { formatStockInteger as fmt } from '@/utils/stock'
import { formatDate, formatDateTime } from '@/utils/date'
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
const columns: TableColumnsType<SalesReturn> = [
  { key: 'code', dataIndex: 'code', title: 'Mã phiếu', width: 200 },
  { key: 'salesOrderId', dataIndex: 'salesOrderId', title: 'Đơn bán', width: 240 },
  { key: 'customerId', dataIndex: 'customerId', title: 'Khách', width: 220 },
  { key: 'warehouseId', dataIndex: 'warehouseId', title: 'Kho', width: 200 },
  { key: 'returnDate', dataIndex: 'returnDate', title: 'Ngày trả', width: 130 },
  { key: 'reason', dataIndex: 'reason', title: 'Lý do', width: 240 },
  {
    key: 'totalAmount',
    dataIndex: 'totalAmount',
    title: 'Giá trị trả',
    width: 240,
    align: 'right',
  },
  { key: 'status', dataIndex: 'status', title: 'Trạng thái', width: 140 },
  { key: 'createdBy', dataIndex: 'createdBy', title: 'Người tạo', width: 200 },
  { key: 'createdAt', dataIndex: 'createdAt', title: 'Thời gian tạo', width: 190 },
  { key: 'actions', title: 'Thao tác', width: 88, fixed: 'right', align: 'center' },
]
const warehouseName = (id: string): string =>
  warehouses.warehouses.find((w) => w.id === id)?.name ?? id
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
  () => [filters.warehouseId, filters.salesOrderId, filters.status, filters.from, filters.to],
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
const changePage = (next: number, size: number): void => {
  if (loading.value || ![10, 20, 50, 100].includes(size)) return
  if (next === filters.page && size === filters.pageSize) return
  filters.page = size === filters.pageSize ? next : 1
  filters.pageSize = size
  void load()
}
const search = (): void => {
  if (loading.value) return
  filters.page = 1
  void load()
}
const resetFilters = (): void => {
  if (loading.value) return
  const defaults = {
    warehouseId: warehouses.selectedId,
    salesOrderId: '',
    status: undefined,
    from: '',
    to: '',
  }
  const changed = (Object.keys(defaults) as (keyof typeof defaults)[]).some(
    (key) => filters[key] !== defaults[key],
  )
  Object.assign(filters, defaults)
  if (!changed) search()
}
</script>
<template>
  <a-config-provider
    :theme="{ token: { colorPrimary: '#7357cf', colorLink: '#7357cf', borderRadius: 8 } }"
  >
    <section class="rr-page">
      <header class="rr-page-heading">
        <div>
          <h1>Trả hàng</h1>
          <p>Quản lý phiếu trả và xác nhận hàng nhập lại kho.</p>
        </div>
        <a-button
          v-if="can('SALES_RETURN_CREATE') && can('SALES_RETURN_VIEW')"
          type="primary"
          @click="show()"
          ><template #icon><PlusOutlined /></template>Tạo phiếu trả</a-button
        >
      </header>
      <a-alert v-if="error" type="error" :message="error" show-icon />
      <a-alert
        v-if="!warehouses.warehouses.length"
        type="info"
        message="Không có kho được giao. Tải lại phạm vi kho trên thanh công cụ."
        show-icon
      />
      <ReturnRefundList
        title="Danh sách phiếu trả hàng"
        item-label="phiếu trả hàng"
        :columns="columns"
        :rows="rows"
        :loading="loading"
        :error="error"
        :total="total"
        :page="filters.page"
        :page-size="filters.pageSize"
        @reload="load"
        @page-change="changePage"
      >
        <template #filters="{ popupAlign }">
          <a-form layout="vertical" class="rr-return-filters" @finish="search">
            <a-form-item label="Kho" html-for="return-filter-warehouse"
              ><a-select
                id="return-filter-warehouse"
                v-model:value="filters.warehouseId"
                :dropdown-align="popupAlign"
                :options="options"
                placeholder="Tất cả kho được giao"
                allow-clear
            /></a-form-item>
            <a-form-item label="ID đơn nguồn" html-for="return-filter-order"
              ><a-input
                id="return-filter-order"
                v-model:value="filters.salesOrderId"
                placeholder="Nhập ID đơn bán"
                allow-clear
                @press-enter.prevent="search"
            /></a-form-item>
            <a-form-item label="Trạng thái" html-for="return-filter-status"
              ><a-select
                id="return-filter-status"
                v-model:value="filters.status"
                :dropdown-align="popupAlign"
                allow-clear
                placeholder="Tất cả trạng thái"
                :options="
                  ['DRAFT', 'CONFIRMED', 'CANCELLED'].map((value) => ({
                    value,
                    label: $t('sales.' + value),
                  }))
                "
            /></a-form-item>
            <a-form-item label="Từ ngày trả" html-for="return-filter-from"
              ><a-date-picker
                id="return-filter-from"
                v-model:value="filters.from"
                :dropdown-align="popupAlign"
                value-format="YYYY-MM-DD"
                format="DD/MM/YYYY"
                placeholder="Từ ngày trả"
            /></a-form-item>
            <a-form-item label="Đến ngày trả (bao gồm)" html-for="return-filter-to"
              ><a-date-picker
                id="return-filter-to"
                v-model:value="filters.to"
                :dropdown-align="popupAlign"
                value-format="YYYY-MM-DD"
                format="DD/MM/YYYY"
                placeholder="Đến ngày trả (bao gồm)"
            /></a-form-item>
            <div class="rr-filter-actions">
              <a-button type="primary" :loading="loading" @click="search"
                ><template #icon><SearchOutlined aria-hidden="true" /></template>Tìm kiếm</a-button
              >
              <a-button :disabled="loading" @click="resetFilters"
                ><template #icon><ReloadOutlined aria-hidden="true" /></template>Đặt lại</a-button
              >
            </div>
          </a-form>
        </template>
        <template #bodyCell="{ column, record }">
          <a-tooltip v-if="column.key === 'warehouseId'" :title="warehouseName(record.warehouseId)"
            ><span class="rr-text">{{ warehouseName(record.warehouseId) }}</span></a-tooltip
          >
          <div v-else-if="column.key === 'totalAmount'" class="rr-money">
            <span :class="{ 'rr-money-emphasis': record.status === 'DRAFT' }"
              >{{ fmt(record.totalAmount) }} ₫</span
            >
            <div v-if="record.status === 'DRAFT'">Dự kiến</div>
          </div>
          <template v-else-if="column.key === 'returnDate'">{{
            formatDate(record.returnDate)
          }}</template>
          <template v-else-if="column.key === 'createdAt'">{{
            formatDateTime(record.createdAt)
          }}</template>
          <a-tag
            v-else-if="column.key === 'status'"
            :color="
              record.status === 'DRAFT' ? 'orange' : record.status === 'CONFIRMED' ? 'green' : 'red'
            "
            >{{ returnStatusLabel(record.status) }}</a-tag
          >
          <div v-else-if="column.key === 'actions'" class="rr-actions">
            <a-tooltip title="Chi tiết / xử lý" :trigger="['hover', 'focus']">
              <a-button type="text" aria-label="Chi tiết / xử lý" @click="show(record.id)">
                <template #icon><EyeOutlined aria-hidden="true" /></template>
              </a-button>
            </a-tooltip>
          </div>
          <a-tooltip
            v-else-if="['salesOrderId', 'customerId', 'createdBy'].includes(String(column.key))"
            :title="record[column.key] ? 'ID: ' + record[column.key] : undefined"
            ><span class="rr-text">{{
              column.key === 'customerId' && !record.customerId ? 'Khách lẻ' : '—'
            }}</span></a-tooltip
          >
          <a-tooltip
            v-else
            :title="record[column.dataIndex] ?? (column.key === 'customerId' ? 'Khách lẻ' : '—')"
            ><span class="rr-text" :class="{ 'rr-code': column.key === 'code' }">{{
              record[column.dataIndex] ?? (column.key === 'customerId' ? 'Khách lẻ' : '—')
            }}</span></a-tooltip
          >
        </template>
      </ReturnRefundList>
      <ReturnDialog :id="id" v-model:open="open" @saved="load" />
    </section>
  </a-config-provider>
</template>
<style scoped src="./returnRefundPage.css"></style>
