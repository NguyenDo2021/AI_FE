<script setup lang="ts">
import PaymentReceiptDialog from './PaymentReceiptDialog.vue'
import { usePaymentReceipt } from '@/composables/usePaymentReceipt'
import { computed, reactive, ref, watch, onBeforeUnmount } from 'vue'
import FittedListTable from '@/components/catalog/FittedListTable.vue'
import type { TableColumnsType } from 'ant-design-vue'
import {
  EyeOutlined,
  PrinterOutlined,
  CloseCircleOutlined,
  ReloadOutlined,
  MoreOutlined,
} from '@ant-design/icons-vue'
import { formatDate } from '@/utils/date'
import PaymentDetailDialog from './PaymentDetailDialog.vue'
import SalesOrderDialog from './SalesOrderDialog.vue'
import { getPayments, getOrderPayments } from '@/api/payments/payments.api'
import { usePaymentScope } from '@/composables/usePaymentScope'
import { usePaymentsStore } from '@/stores/payments'
import { paymentError } from '@/utils/payments'
import { formatStockInteger } from '@/utils/stock'
import type { Payment, PaymentParams } from '@/types/payments'
import type { NormalizedApiError } from '@/utils/request'
const props = defineProps<{ orderId?: string }>()
const { can, warehouses, inScope, contextKey, refreshAccess } = usePaymentScope()
const payments = usePaymentsStore()
const receipt = usePaymentReceipt()
const rows = ref<Payment[]>([])
const scrollRevision = ref(0)
const page = ref(1)
const pageSize = ref(10)
const total = ref(0)
const loading = ref(false)
const error = ref('')
const filters = reactive({
  warehouseId: warehouses.selectedId,
  salesOrderId: '',
  customerId: '',
  status: undefined as PaymentParams['status'],
  method: undefined as PaymentParams['method'],
  from: '',
  to: '',
})
const detailId = ref<string>()
const detailOpen = ref(false)
const cancelMode = ref(false)
const salesId = ref<string>()
const salesOpen = ref(false)
let sequence = 0
const columns: TableColumnsType<Payment> = [
  { key: 'code', dataIndex: 'code', title: 'Mã phiếu', width: 280 },
  { key: 'paymentDate', dataIndex: 'paymentDate', title: 'Ngày thu', width: 132 },
  { key: 'amount', dataIndex: 'amount', title: 'Số tiền', width: 220, align: 'right' },
  { key: 'method', dataIndex: 'method', title: 'Hình thức', width: 160 },
  { key: 'status', dataIndex: 'status', title: 'Trạng thái', width: 144 },
  { key: 'warehouseId', dataIndex: 'warehouseId', title: 'Kho', width: 200 },
  { key: 'salesOrderId', dataIndex: 'salesOrderId', title: 'Đơn nguồn', width: 260 },
  { key: 'actions', title: 'Thao tác', width: 148, fixed: 'right' },
]
const warehouseName = (id: string): string =>
  warehouses.warehouses.find((item) => item.id === id)?.name ?? id
const warehouseOptions = computed(() =>
  warehouses.warehouses.map((item) => ({ value: item.id, label: item.code + ' — ' + item.name })),
)
const rangeLabel = computed(() =>
  total.value
    ? `Hiển thị ${(page.value - 1) * pageSize.value + 1}–${Math.min(page.value * pageSize.value, total.value)} / ${total.value} phiếu`
    : 'Hiển thị 0 / 0 phiếu',
)
const load = async (): Promise<void> => {
  const current = ++sequence
  rows.value = []
  total.value = 0
  error.value = ''
  loading.value = false
  if (
    !can('PAYMENT_VIEW') ||
    !warehouses.warehouses.length ||
    (!props.orderId && filters.warehouseId && !inScope(filters.warehouseId))
  )
    return
  if (!props.orderId && filters.from && filters.to && filters.from > filters.to) {
    error.value = 'Ngày bắt đầu không được sau ngày kết thúc.'
    return
  }
  loading.value = true
  try {
    const paging = {
      page: page.value,
      pageSize: pageSize.value,
      ...(filters.status ? { status: filters.status } : {}),
    }
    const result = props.orderId
      ? await getOrderPayments(props.orderId, paging)
      : await getPayments({
          ...paging,
          ...(filters.warehouseId ? { warehouseId: filters.warehouseId } : {}),
          ...(filters.salesOrderId ? { salesOrderId: filters.salesOrderId } : {}),
          ...(filters.customerId ? { customerId: filters.customerId } : {}),
          ...(filters.method ? { method: filters.method } : {}),
          ...(filters.from ? { from: filters.from } : {}),
          ...(filters.to ? { to: filters.to } : {}),
        })
    if (current !== sequence) return
    rows.value = result.items.filter((item) => inScope(item.warehouseId))
    total.value = result.total
  } catch (cause) {
    if (current === sequence) error.value = paymentError(cause)
    if ((cause as NormalizedApiError).status === 403) await refreshAccess()
  } finally {
    if (current === sequence) loading.value = false
  }
}
watch(
  () => [props.orderId, ...Object.values(filters)],
  () => {
    page.value = 1
    ++scrollRevision.value
    void load()
  },
)
watch(
  contextKey,
  () => {
    ++sequence
    rows.value = []
    detailOpen.value = false
    salesOpen.value = false
    filters.warehouseId = warehouses.selectedId
    if (filters.warehouseId && !inScope(filters.warehouseId)) filters.warehouseId = undefined
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
  if (![10, 20, 50, 100].includes(size)) return
  if (next === page.value && size === pageSize.value) return
  page.value = size !== pageSize.value ? 1 : next
  pageSize.value = size
  void load()
}
const openSales = (id: string): void => {
  salesId.value = id
  salesOpen.value = true
}
const show = (payment: Payment, cancel = false): void => {
  receipt.close()
  detailId.value = payment.id
  cancelMode.value = cancel
  detailOpen.value = true
}
</script>
<template>
  <section class="payment-history" :class="{ 'payment-history--embedded': orderId }">
    <a-alert v-if="error" type="error" :message="error" show-icon />
    <a-alert
      v-if="!can('PAYMENT_VIEW')"
      type="warning"
      message="Thiếu PAYMENT_VIEW để xem phiếu thu."
    />
    <template v-else>
      <a-alert
        v-if="!warehouses.warehouses.length"
        type="info"
        message="Không có kho trong phạm vi được phép. Tải lại kho trên thanh công cụ."
        show-icon
      />
      <div class="payment-filters" :class="{ 'payment-filters--embedded': orderId }">
        <template v-if="!orderId">
          <div class="payment-filter">
            <label for="payment-filter-warehouse">Kho</label>
            <a-select
              id="payment-filter-warehouse"
              v-model:value="filters.warehouseId"
              :options="warehouseOptions"
              placeholder="Tất cả kho được giao"
              allow-clear
            />
          </div>
          <div class="payment-filter">
            <label for="payment-filter-order">UUID đơn nguồn</label>
            <a-input
              id="payment-filter-order"
              v-model:value="filters.salesOrderId"
              placeholder="Nhập UUID đơn bán"
              allow-clear
            />
          </div>
          <div class="payment-filter">
            <label for="payment-filter-customer">UUID khách</label>
            <a-input
              id="payment-filter-customer"
              v-model:value="filters.customerId"
              placeholder="Nhập UUID khách hàng"
              allow-clear
            />
          </div>
          <div class="payment-filter">
            <label for="payment-filter-method">Hình thức</label>
            <a-select
              id="payment-filter-method"
              v-model:value="filters.method"
              :options="[
                { value: 'CASH', label: 'Tiền mặt' },
                { value: 'BANK_TRANSFER', label: 'Chuyển khoản' },
              ]"
              placeholder="Tất cả hình thức"
              allow-clear
            />
          </div>
          <div class="payment-filter">
            <label for="payment-filter-from">Từ ngày thu</label>
            <a-date-picker
              id="payment-filter-from"
              v-model:value="filters.from"
              value-format="YYYY-MM-DD"
              placeholder="Từ ngày thu"
            />
          </div>
          <div class="payment-filter">
            <label for="payment-filter-to">Đến ngày thu (bao gồm)</label>
            <a-date-picker
              id="payment-filter-to"
              v-model:value="filters.to"
              value-format="YYYY-MM-DD"
              placeholder="Đến ngày thu (bao gồm)"
            />
          </div>
        </template>
        <div class="payment-filter">
          <label :for="'payment-filter-status-' + (orderId ?? 'all')">Trạng thái</label>
          <a-select
            :id="'payment-filter-status-' + (orderId ?? 'all')"
            v-model:value="filters.status"
            :options="[
              { value: 'ACTIVE', label: 'Có hiệu lực' },
              { value: 'CANCELLED', label: 'Đã hủy' },
            ]"
            placeholder="Tất cả trạng thái"
            allow-clear
          />
        </div>
        <a-button
          @click="
            Object.assign(filters, {
              warehouseId: undefined,
              salesOrderId: '',
              customerId: '',
              status: undefined,
              method: undefined,
              from: '',
              to: '',
            })
          "
        >
          <template #icon><ReloadOutlined aria-hidden="true" /></template>Đặt lại
        </a-button>
      </div>
      <FittedListTable
        class="payment-list-panel"
        :body-max-height="orderId ? 300 : undefined"
        :columns="columns"
        :rows="rows"
        :loading="loading"
        :error="error"
        :total="total"
        :page="page"
        :page-size="pageSize"
        :reset-key="scrollRevision"
        :row-height="60"
        :list-title="orderId ? 'Lịch sử phiếu thu' : 'Danh sách phiếu thu'"
        :total-label="total + ' phiếu'"
        :range-label="rangeLabel"
        @reload="load"
        @page-change="changePage"
      >
        <template #bodyCell="{ column, record, compact }">
          <a-tooltip v-if="column.key === 'code'" :title="record.code">
            <span class="payment-text payment-code">{{ record.code }}</span>
          </a-tooltip>
          <span v-else-if="column.key === 'paymentDate'" class="payment-date">{{
            formatDate(record.paymentDate)
          }}</span>
          <span v-else-if="column.key === 'amount'" class="payment-money"
            >{{ formatStockInteger(record.amount) }} ₫</span
          >
          <template v-else-if="column.key === 'method'">{{
            record.method === 'CASH' ? 'Tiền mặt' : 'Chuyển khoản'
          }}</template>
          <a-tag
            v-else-if="column.key === 'status'"
            :color="record.status === 'ACTIVE' ? 'green' : 'red'"
          >
            {{ record.status === 'ACTIVE' ? 'Có hiệu lực' : 'Đã hủy' }}
          </a-tag>
          <a-tooltip
            v-else-if="column.key === 'warehouseId'"
            :title="warehouseName(record.warehouseId)"
          >
            <span class="payment-text">{{ warehouseName(record.warehouseId) }}</span>
          </a-tooltip>
          <a-tooltip v-else-if="column.key === 'salesOrderId'" :title="record.salesOrderId">
            <a-button
              v-if="can('SALES_ORDER_VIEW')"
              type="link"
              class="payment-order-link"
              @click="openSales(record.salesOrderId)"
            >
              <span class="payment-text">{{ record.salesOrderId }}</span>
            </a-button>
            <span v-else class="payment-text">{{ record.salesOrderId }}</span>
          </a-tooltip>
          <div v-else-if="column.key === 'actions'" class="payment-actions">
            <template v-if="!compact">
              <a-tooltip title="Chi tiết">
                <a-button type="text" aria-label="Chi tiết" @click="show(record)">
                  <template #icon><EyeOutlined aria-hidden="true" /></template>
                </a-button>
              </a-tooltip>
              <a-tooltip v-if="can('PAYMENT_VIEW')" title="Xem/in biên lai">
                <a-button
                  type="text"
                  aria-label="Xem/in biên lai"
                  :loading="receipt.state.loading && receipt.state.paymentId === record.id"
                  @click="receipt.show(record)"
                >
                  <template #icon><PrinterOutlined aria-hidden="true" /></template>
                </a-button>
              </a-tooltip>
              <a-tooltip
                v-if="record.status === 'ACTIVE' && can('PAYMENT_CANCEL')"
                title="Hủy ghi nhận sai"
              >
                <a-button
                  type="text"
                  danger
                  aria-label="Hủy ghi nhận sai"
                  @click="show(record, true)"
                >
                  <template #icon><CloseCircleOutlined aria-hidden="true" /></template>
                </a-button>
              </a-tooltip>
            </template>
            <a-dropdown v-else :trigger="['click']">
              <a-button type="text" aria-label="Thao tác phiếu thu">
                <template #icon><MoreOutlined aria-hidden="true" /></template>
              </a-button>
              <template #overlay>
                <a-menu>
                  <a-menu-item key="detail" @click="show(record)"
                    ><EyeOutlined aria-hidden="true" /> Chi tiết</a-menu-item
                  >
                  <a-menu-item v-if="can('PAYMENT_VIEW')" key="print" @click="receipt.show(record)"
                    ><PrinterOutlined aria-hidden="true" /> Xem/in biên lai</a-menu-item
                  >
                  <a-menu-item
                    v-if="record.status === 'ACTIVE' && can('PAYMENT_CANCEL')"
                    key="cancel"
                    danger
                    @click="show(record, true)"
                    ><CloseCircleOutlined aria-hidden="true" /> Hủy ghi nhận sai</a-menu-item
                  >
                </a-menu>
              </template>
            </a-dropdown>
          </div>
        </template>
      </FittedListTable>
    </template>
    <PaymentReceiptDialog :receipt="receipt" />
    <PaymentDetailDialog :id="detailId" v-model:open="detailOpen" :cancel="cancelMode" />
    <SalesOrderDialog
      v-if="salesOpen && can('SALES_ORDER_VIEW')"
      :id="salesId"
      v-model:open="salesOpen"
      mode="view"
    />
  </section>
</template>
<style scoped>
.payment-history {
  display: flex;
  flex: 1;
  flex-direction: column;
  gap: 12px;
  min-height: 0;
  min-width: 0;
  container: payment-history / inline-size;
}
.payment-history > :not(.payment-list-panel) {
  flex-shrink: 0;
}
.payment-filters {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  align-items: end;
  gap: 12px;
  padding: 16px;
  border: 1px solid #e9e4f1;
  border-radius: 12px;
  background: #fff;
}
.payment-filter {
  display: flex;
  flex-direction: column;
  gap: 6px;
  min-width: 0;
}
.payment-filter > label {
  color: #797184;
  font-size: 13px;
}
.payment-filter :deep(.ant-select),
.payment-filter :deep(.ant-picker) {
  width: 100%;
  min-width: 0;
}
.payment-text {
  display: block;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.payment-code {
  color: #7357cf;
  font-variant-numeric: tabular-nums;
}
.payment-date,
.payment-money {
  white-space: nowrap;
  font-variant-numeric: tabular-nums;
}
.payment-money {
  color: #373047;
  font-weight: 600;
}
.payment-order-link {
  max-width: 100%;
  height: auto;
  padding: 0;
  text-align: left;
}
.payment-actions {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 4px;
  color: #7357cf;
}
.payment-actions :deep(.ant-btn) {
  width: 30px;
  min-width: 30px;
  padding: 0;
  color: inherit;
}
.payment-actions :deep(.ant-btn-dangerous) {
  color: #cf334b;
}
.payment-list-panel :deep(.ant-table-thead > tr > th) {
  white-space: nowrap;
}
.payment-list-panel :deep(.products-total) {
  padding: 2px 8px;
  border-radius: 4px;
  background: #f2ecfc;
  color: #7950d7;
}
.payment-history--embedded {
  flex: none;
}
.payment-history--embedded .payment-list-panel {
  flex: none;
}
.payment-filters--embedded {
  grid-template-columns: minmax(160px, 1fr) auto;
}
@container payment-history (max-width: 700px) {
  .payment-filters {
    grid-template-columns: repeat(2, minmax(0, 1fr));
    padding: 12px;
  }
}
@container payment-history (max-width: 360px) {
  .payment-filters {
    gap: 10px 8px;
  }
  .payment-filter > label {
    font-size: 12px;
  }
}
</style>
