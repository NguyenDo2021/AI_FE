<script setup lang="ts">
import { computed, onBeforeUnmount, reactive, ref, watch } from 'vue'
import FittedListTable from '@/components/catalog/FittedListTable.vue'
import type { TableColumnsType } from 'ant-design-vue'
import { useI18n } from 'vue-i18n'
import {
  MoreOutlined,
  PlusOutlined,
  ReloadOutlined,
  EyeOutlined,
  EditOutlined,
} from '@ant-design/icons-vue'
import CustomerDialog from '@/components/sales/CustomerDialog.vue'
import { getCustomers } from '@/api/sales/sales.api'
import { useSalesScope } from '@/composables/useSalesScope'
import { salesError } from '@/utils/sales'
import type { Customer } from '@/types/sales'
const { can, warehouses, scopeKey, inScope, refreshScope } = useSalesScope()
const { t } = useI18n()
const scrollRevision = ref(0)
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
const columns: TableColumnsType<Customer> = [
  { key: 'code', dataIndex: 'code', title: 'Mã khách', width: 190 },
  { key: 'name', dataIndex: 'name', title: 'Tên khách', width: 220 },
  { key: 'warehouse', title: 'Kho', width: 200 },
  { key: 'phone', dataIndex: 'phone', title: 'Điện thoại', width: 156 },
  { key: 'address', dataIndex: 'address', title: 'Địa chỉ', width: 280 },
  { key: 'status', title: 'Trạng thái', width: 164 },
  { key: 'actions', title: 'Thao tác', width: 144, fixed: 'right' },
]
const warehouseName = (warehouseId: string): string =>
  warehouses.warehouses.find((item) => item.id === warehouseId)?.name ?? warehouseId
const options = computed(() =>
  warehouses.warehouses.map((item) => ({ value: item.id, label: item.code + ' — ' + item.name })),
)
const rangeLabel = computed(() =>
  t('catalog.customerRange', {
    from: rows.value.length ? (page.value - 1) * pageSize.value + 1 : 0,
    to: rows.value.length
      ? Math.min((page.value - 1) * pageSize.value + rows.value.length, total.value)
      : 0,
    total: total.value,
  }),
)
const load = async (): Promise<void> => {
  const current = ++sequence
  ++scrollRevision.value
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
  () => [filters.warehouseId, filters.keyword, filters.status, scopeKey.value],
  () => {
    page.value = 1
    void load()
  },
  { immediate: true },
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
  },
  { flush: 'sync' },
)
onBeforeUnmount(() => ++sequence)
const show = (value: typeof mode.value, customer?: Customer): void => {
  mode.value = value
  id.value = customer?.id
  open.value = true
}
const changePage = (next: number, size: number): void => {
  if (![10, 20, 50, 100].includes(size)) return
  const target = size !== pageSize.value ? 1 : next
  if (target === page.value && size === pageSize.value) return
  page.value = target
  pageSize.value = size
  void load()
}
</script>
<template>
  <a-config-provider :theme="{ token: { colorPrimary: '#7357cf', borderRadius: 8 } }">
    <section class="customers-page">
      <div class="heading">
        <div>
          <h1>{{ $t('sales.customers') }}</h1>
          <p>Quản lý thông tin khách hàng theo từng kho.</p>
        </div>
        <a-button v-if="can('CUSTOMER_CREATE')" type="primary" @click="show('create')">
          <template #icon><PlusOutlined aria-hidden="true" /></template>
          Thêm khách hàng
        </a-button>
      </div>
      <a-alert v-if="error" type="error" show-icon :message="error" />
      <a-alert
        v-if="!can('CUSTOMER_VIEW')"
        type="warning"
        show-icon
        message="Thiếu CUSTOMER_VIEW để xem danh sách."
      />
      <a-alert
        v-else-if="!warehouses.warehouses.length"
        type="info"
        show-icon
        message="Không có kho trong phạm vi được phép. Tải lại kho trên thanh công cụ."
      />
      <template v-else>
        <div class="filters">
          <div class="customer-filter">
            <label for="customer-filter-warehouse">Kho</label>
            <a-select
              id="customer-filter-warehouse"
              v-model:value="filters.warehouseId"
              :options="options"
              placeholder="Tất cả kho được giao"
              allow-clear
            />
          </div>
          <div class="customer-filter">
            <label for="customer-filter-keyword">Tìm khách hàng</label>
            <a-input
              id="customer-filter-keyword"
              v-model:value="filters.keyword"
              placeholder="Nhập mã / tên / điện thoại..."
              allow-clear
            />
          </div>
          <div class="customer-filter customer-filter-status">
            <label for="customer-filter-status">Trạng thái</label>
            <a-select
              id="customer-filter-status"
              v-model:value="filters.status"
              :options="[
                { value: 1, label: 'Hoạt động' },
                { value: 0, label: 'Ngừng hoạt động' },
              ]"
              placeholder="Tất cả trạng thái"
              allow-clear
            />
          </div>
          <a-button
            @click="
              Object.assign(filters, { warehouseId: undefined, keyword: '', status: undefined })
            "
          >
            <template #icon><ReloadOutlined aria-hidden="true" /></template>
            Đặt lại
          </a-button>
        </div>
        <FittedListTable
          class="customers-panel"
          :columns="columns"
          :rows="rows"
          :error="error"
          :total="total"
          :page="page"
          :page-size="pageSize"
          :reset-key="scrollRevision"
          :loading="loading"
          list-title="Danh sách khách hàng"
          :total-label="total + ' khách hàng'"
          :range-label="rangeLabel"
          @reload="load"
          @page-change="changePage"
        >
          <template #bodyCell="{ column, record, compact }">
            <a-tooltip v-if="column.key === 'warehouse'" :title="warehouseName(record.warehouseId)">
              <span class="customer-text">{{ warehouseName(record.warehouseId) }}</span>
            </a-tooltip>
            <a-tag
              v-else-if="column.key === 'status'"
              :color="record.status === 1 ? 'success' : 'default'"
            >
              {{ record.status === 1 ? 'Hoạt động' : 'Ngừng hoạt động' }}
            </a-tag>
            <div v-else-if="column.key === 'actions'" class="customer-actions">
              <a-tooltip v-if="!compact" title="Chi tiết">
                <a-button type="text" aria-label="Chi tiết" @click="show('view', record)">
                  <template #icon><EyeOutlined aria-hidden="true" /></template>
                </a-button>
              </a-tooltip>
              <a-tooltip v-if="!compact && can('CUSTOMER_UPDATE')" title="Sửa">
                <a-button type="text" aria-label="Sửa" @click="show('edit', record)">
                  <template #icon><EditOutlined aria-hidden="true" /></template>
                </a-button>
              </a-tooltip>
              <a-dropdown v-if="compact || can('CUSTOMER_UPDATE')" :trigger="['click']">
                <a-button type="text" aria-label="Thao tác">
                  <template #icon><MoreOutlined aria-hidden="true" /></template>
                </a-button>
                <template #overlay>
                  <a-menu>
                    <a-menu-item v-if="compact" key="view" @click="show('view', record)"
                      >Chi tiết</a-menu-item
                    >
                    <a-menu-item
                      v-if="compact && can('CUSTOMER_UPDATE')"
                      key="edit"
                      @click="show('edit', record)"
                      >Sửa</a-menu-item
                    >
                    <a-menu-item
                      v-if="can('CUSTOMER_UPDATE')"
                      key="toggle"
                      @click="show('toggle', record)"
                    >
                      {{ record.status === 1 ? 'Ngừng hoạt động' : 'Kích hoạt' }}
                    </a-menu-item>
                  </a-menu>
                </template>
              </a-dropdown>
            </div>
            <a-tooltip v-else :title="record[column.dataIndex] || '—'">
              <span
                :class="[
                  'customer-text',
                  {
                    'customer-code': column.key === 'code',
                    'customer-name': column.key === 'name',
                  },
                ]"
              >
                {{ record[column.dataIndex] || '—' }}
              </span>
            </a-tooltip>
          </template>
        </FittedListTable>
      </template>
      <CustomerDialog :id="id" v-model:open="open" :mode="mode" @saved="load" />
    </section>
  </a-config-provider>
</template>
<style scoped>
.customers-page {
  display: flex;
  flex: 1;
  flex-direction: column;
  gap: 12px;
  min-height: 0;
  min-width: 0;
}
.heading,
.filters,
.customers-page > .ant-alert {
  flex-shrink: 0;
}
.heading {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}
.heading h1 {
  margin: 0;
  color: #302640;
  font-size: 24px;
  line-height: 32px;
  font-weight: 650;
}
.heading p {
  margin: 4px 0 0;
  color: #797184;
  font-size: 14px;
  line-height: 20px;
}
.filters {
  display: grid;
  grid-template-columns: minmax(160px, 0.8fr) minmax(220px, 1.6fr) minmax(150px, 0.7fr) auto;
  align-items: end;
  gap: 10px;
  padding: 14px 16px;
  border: 1px solid #e9e4f1;
  border-radius: 12px;
  background: #fff;
}
.customer-filter {
  display: flex;
  flex-direction: column;
  gap: 6px;
  min-width: 0;
}
.customer-filter label {
  color: #757080;
  font-size: 13px;
}
.customer-filter :deep(.ant-select) {
  width: 100%;
  min-width: 0;
}
.customer-text {
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
  overflow-wrap: anywhere;
  max-height: 40px;
}
.customer-code {
  display: block;
  max-width: 200px;
  white-space: nowrap;
  text-overflow: ellipsis;
  color: #757080;
  font-variant-numeric: tabular-nums;
}
.customer-name {
  font-weight: 600;
}
.customer-actions {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 4px;
  white-space: nowrap;
}
.customer-actions :deep(.ant-btn) {
  width: 28px;
  min-width: 28px;
  padding: 0;
}
@container workspace (max-width: 900px) {
  .filters {
    grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
    padding: 12px;
  }
}
@container workspace (max-width: 500px) {
  .heading {
    align-items: flex-start;
    flex-wrap: wrap;
  }
  .heading > div {
    flex-basis: 100%;
  }
  .filters {
    grid-template-columns: minmax(0, 1fr);
  }
}
</style>
