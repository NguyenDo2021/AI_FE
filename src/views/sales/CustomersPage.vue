<script setup lang="ts">
import { computed, onBeforeUnmount, reactive, ref, watch } from 'vue'
import { BasicTable } from '@/components'
import CustomerDialog from '@/components/sales/CustomerDialog.vue'
import { getCustomers } from '@/api/sales/sales.api'
import { useSalesScope } from '@/composables/useSalesScope'
import { salesError } from '@/utils/sales'
import type { Customer } from '@/types/sales'
const { can, warehouses, scopeKey, inScope, refreshScope } = useSalesScope()
const rows = ref<Customer[]>([])
const page = ref(1)
const pageSize = ref(10)
const total = ref(0)
const loading = ref(false)
const error = ref('')
const filters = reactive({
  warehouseId: warehouses.selectedId,
  keyword: '',
  status: undefined as 0 | 1 | undefined,
})
const open = ref(false)
const id = ref<string>()
const mode = ref<'create' | 'edit' | 'view' | 'toggle'>('view')
let sequence = 0
const columns = [
  { key: 'code', dataIndex: 'code', title: 'Mã khách' },
  { key: 'name', dataIndex: 'name', title: 'Tên khách' },
  { key: 'warehouse', title: 'Kho' },
  { key: 'phone', dataIndex: 'phone', title: 'Điện thoại' },
  { key: 'address', dataIndex: 'address', title: 'Địa chỉ' },
  { key: 'status', title: 'Trạng thái' },
  { key: 'actions', title: 'Thao tác' },
]
const options = computed(() =>
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
  total.value = 0
  error.value = ''
  loading.value = false
  if (
    !can('CUSTOMER_VIEW') ||
    !warehouses.warehouses.length ||
    (filters.warehouseId && !inScope(filters.warehouseId))
  )
    return
  loading.value = true
  try {
    const result = await getCustomers({
      page: page.value,
      pageSize: pageSize.value,
      ...(filters.warehouseId ? { warehouseId: filters.warehouseId } : {}),
      ...(filters.keyword.trim() ? { keyword: filters.keyword.trim() } : {}),
      ...(filters.status !== undefined ? { status: filters.status } : {}),
    })
    if (current !== sequence) return
    rows.value = result.items.filter((item) => inScope(item.warehouseId))
    total.value = result.total
  } catch (cause) {
    if (current === sequence) error.value = salesError(cause)
    if ((cause as { status?: number }).status === 403) await refreshScope()
  } finally {
    if (current === sequence) loading.value = false
  }
}
watch(
  () => [filters.warehouseId, filters.keyword, filters.status],
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
const show = (value: typeof mode.value, customer?: Customer): void => {
  mode.value = value
  id.value = customer?.id
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
      <h1>{{ $t('sales.customers') }}</h1>
      <a-button v-if="can('CUSTOMER_CREATE')" type="primary" @click="show('create')"
        >Thêm khách hàng</a-button
      >
    </div>
    <a-alert v-if="error" type="error" :message="error" />
    <a-alert
      v-if="!can('CUSTOMER_VIEW')"
      type="warning"
      message="Thiếu CUSTOMER_VIEW để xem danh sách."
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
          :options="options"
          placeholder="Tất cả kho được giao"
          allow-clear
        />
        <a-input
          v-model:value="filters.keyword"
          placeholder="Tìm mã / tên / điện thoại"
          allow-clear
        />
        <a-select
          v-model:value="filters.status"
          :options="[
            { value: 1, label: 'Hoạt động' },
            { value: 0, label: 'Ngừng hoạt động' },
          ]"
          placeholder="Tất cả trạng thái"
          allow-clear
        />
        <a-button
          @click="
            Object.assign(filters, { warehouseId: undefined, keyword: '', status: undefined })
          "
          >Đặt lại</a-button
        >
      </div>
      <BasicTable
        :columns="columns"
        :data-source="rows"
        :pagination="pagination"
        :loading="loading"
        :scroll="{ x: 1000 }"
        @reload="load"
        @page-change="changePage"
      >
        <template #bodyCell="{ column, record }">
          <template v-if="column.key === 'warehouse'">{{
            warehouses.warehouses.find((item) => item.id === record.warehouseId)?.name ??
            record.warehouseId
          }}</template>
          <a-tag
            v-else-if="column.key === 'status'"
            :color="record.status === 1 ? 'green' : 'default'"
            >{{ record.status === 1 ? 'Hoạt động' : 'Ngừng hoạt động' }}</a-tag
          >
          <a-space v-else-if="column.key === 'actions'" wrap>
            <a-button size="small" @click="show('view', record)">Chi tiết</a-button>
            <a-button v-if="can('CUSTOMER_UPDATE')" size="small" @click="show('edit', record)"
              >Sửa</a-button
            >
            <a-button v-if="can('CUSTOMER_UPDATE')" size="small" @click="show('toggle', record)">{{
              record.status === 1 ? 'Ngừng hoạt động' : 'Kích hoạt'
            }}</a-button>
          </a-space>
        </template>
      </BasicTable>
    </template>
    <CustomerDialog :id="id" v-model:open="open" :mode="mode" @saved="load" />
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
  max-width: 320px;
}
</style>
