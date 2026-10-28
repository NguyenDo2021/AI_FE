<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import {
  EyeOutlined,
  WalletOutlined,
  FileTextOutlined,
  InboxOutlined,
  ReloadOutlined,
  RightOutlined,
} from '@ant-design/icons-vue'
import type { TableColumnsType } from 'ant-design-vue'
import { BasicModal } from '@/components'
import FittedListTable from '@/components/catalog/FittedListTable.vue'
import OrderPaymentPanel from './OrderPaymentPanel.vue'
import CollectPaymentDialog from './CollectPaymentDialog.vue'
import { usePaymentScope } from '@/composables/usePaymentScope'
import { usePaymentsStore } from '@/stores/payments'
import { applyPaymentSummary, canCollect, paymentLabel } from '@/utils/payments'
import { formatStockInteger } from '@/utils/stock'
import { formatDate, formatDateTime } from '@/utils/date'
import type { SalesOrder } from '@/types/sales'
import type { ReceiptLine } from '@/types/stock'
const props = defineProps<{
  rows: SalesOrder[]
  loading: boolean
  page: number
  pageSize: number
  total: number
  error?: string
  listTitle?: string
  bodyMaxHeight?: number
}>()
const emit = defineEmits<{ reload: []; pageChange: [page: number, pageSize: number] }>()
const { can, inScope, contextKey } = usePaymentScope()
const payments = usePaymentsStore()
const selected = ref<SalesOrder>()
const open = ref(false)
const collectOrder = ref<SalesOrder>()
const collectOpen = ref(false)
const current = (order: SalesOrder): SalesOrder =>
  payments.summaries[order.id] ? applyPaymentSummary(order, payments.summaries[order.id]!) : order
const rows = computed(() => props.rows.filter((order) => inScope(order.warehouseId)).map(current))
const detail = computed(() => (selected.value ? current(selected.value) : undefined))
const moneyKeys = [
  'totalAmount',
  'returnedAmount',
  'adjustedTotalAmount',
  'paidAmount',
  'refundedAmount',
  'netPaidAmount',
  'refundableAmount',
  'remainingAmount',
]
const columns: TableColumnsType<SalesOrder> = [
  ['code', 'Mã đơn'],
  ['saleDate', 'Ngày bán'],
  ['totalAmount', 'Tổng tiền đơn'],
  ['returnedAmount', 'Hàng đã trả'],
  ['adjustedTotalAmount', 'Tổng sau trả'],
  ['paidAmount', 'Đã thu'],
  ['refundedAmount', 'Đã hoàn'],
  ['netPaidAmount', 'Thu ròng'],
  ['refundableAmount', 'Còn cần hoàn'],
  ['remainingAmount', 'Còn phải trả'],
  ['paymentStatus', 'Thanh toán'],
  ['actions', 'Thao tác'],
].map(([key, title]) => ({
  key,
  dataIndex: key,
  title,
  width:
    key === 'code'
      ? 210
      : key === 'actions'
        ? 112
        : key === 'paymentStatus'
          ? 180
          : key === 'saleDate'
            ? 140
            : 220,
  ...(moneyKeys.includes(key!) ? { align: 'right' as const } : {}),
  ...(key === 'actions' ? { fixed: 'right' as const, align: 'center' as const } : {}),
}))
const lineColumns: TableColumnsType<ReceiptLine> = [
  { key: 'productCode', dataIndex: 'productCode', title: 'Mã sản phẩm', width: 170 },
  { key: 'productName', dataIndex: 'productName', title: 'Sản phẩm', width: 300 },
  { key: 'quantity', dataIndex: 'quantity', title: 'Số lượng', width: 140, align: 'right' },
  { key: 'unitPrice', dataIndex: 'unitPrice', title: 'Đơn giá', width: 220, align: 'right' },
  { key: 'lineTotal', dataIndex: 'lineTotal', title: 'Thành tiền', width: 220, align: 'right' },
]
watch(
  () => props.rows,
  (next) => {
    const latest = next.find((order) => order.id === selected.value?.id)
    if (latest) selected.value = latest
  },
)
const rangeLabel = computed(
  () =>
    `Hiển thị ${props.rows.length ? (props.page - 1) * props.pageSize + 1 : 0}–${props.rows.length ? (props.page - 1) * props.pageSize + props.rows.length : 0} / ${props.total} đơn hàng`,
)
watch(
  contextKey,
  () => {
    open.value = false
    collectOpen.value = false
    selected.value = undefined
    collectOrder.value = undefined
  },
  { flush: 'sync' },
)
const showDetail = (order: SalesOrder): void => {
  selected.value = order
  open.value = true
}
const showCollect = (order: SalesOrder): void => {
  collectOrder.value = order
  collectOpen.value = true
}
</script>
<template>
  <FittedListTable
    class="receivable-orders"
    :columns="columns"
    :rows="rows"
    :loading="loading"
    :error="error ?? ''"
    :page="page"
    :page-size="pageSize"
    :total="total"
    :reset-key="0"
    :row-height="56"
    :body-max-height="bodyMaxHeight"
    :list-title="listTitle ?? 'Các đơn còn nợ'"
    total-label=""
    :range-label="rangeLabel"
    @reload="emit('reload')"
    @page-change="(page, size) => emit('pageChange', page, size)"
  >
    <template #bodyCell="{ column, record }">
      <span
        v-if="
          [
            'totalAmount',
            'returnedAmount',
            'adjustedTotalAmount',
            'paidAmount',
            'refundedAmount',
            'netPaidAmount',
            'refundableAmount',
            'remainingAmount',
          ].includes(String(column.key))
        "
        class="receivable-money"
        :class="{ 'receivable-outstanding': column.key === 'remainingAmount' }"
        >{{
          record[column.key] === undefined || record[column.key] === null
            ? '—'
            : formatStockInteger(record[column.key]) + ' VND'
        }}</span
      >
      <a-tooltip v-else-if="column.key === 'code'" :title="record.code || record.id"
        ><span class="receivable-ellipsis">{{ record.code || record.id }}</span></a-tooltip
      >
      <a-tag
        v-else-if="column.key === 'paymentStatus'"
        :color="
          record.paymentStatus === 'PAID'
            ? 'success'
            : record.paymentStatus === 'PARTIALLY_PAID'
              ? 'warning'
              : 'default'
        "
        >{{ paymentLabel(record) }}</a-tag
      >
      <div v-else-if="column.key === 'actions'" class="receivable-order-actions">
        <a-tooltip title="Chi tiết đơn bán hàng"
          ><a-button
            class="receivable-action"
            aria-label="Chi tiết đơn bán hàng"
            @click="showDetail(record)"
            ><template #icon><EyeOutlined /></template></a-button
        ></a-tooltip>
        <a-tooltip
          v-if="can('PAYMENT_CREATE') && (canCollect(record) || payments.attempts[record.id])"
          :title="payments.attempts[record.id] ? 'Thử lại lần thu' : 'Thu tiền'"
        >
          <a-button
            class="receivable-action"
            :aria-label="payments.attempts[record.id] ? 'Thử lại lần thu' : 'Thu tiền'"
            @click="showCollect(record)"
            ><template #icon><WalletOutlined /></template
          ></a-button>
        </a-tooltip>
      </div>
    </template>
  </FittedListTable>
  <BasicModal
    :open="open"
    title="Chi tiết đơn còn nợ"
    width="88%"
    wrap-class-name="receivable-order-dialog"
    @update:open="open = false"
  >
    <div v-if="detail && can('RECEIVABLE_VIEW')" class="debt-order-content">
      <section class="debt-order-summary" aria-label="Tóm tắt công nợ đơn hàng">
        <div class="debt-order-identity">
          <span class="debt-order-icon"><FileTextOutlined aria-hidden="true" /></span>
          <div class="debt-order-summary-text">
            <a-tooltip :title="detail.code || detail.id"
              ><h2>Đơn: {{ detail.code || detail.id }}</h2></a-tooltip
            >
            <div class="debt-order-customer-row">
              <span class="debt-order-customer"
                >Khách hàng:
                {{ detail.customerSnapshot?.name ?? detail.customerId ?? 'Khách lẻ' }}</span
              >
              <a-tag
                :color="
                  detail.paymentStatus === 'PAID'
                    ? 'success'
                    : detail.paymentStatus === 'PARTIALLY_PAID'
                      ? 'warning'
                      : 'default'
                "
                >{{ paymentLabel(detail) }}</a-tag
              >
            </div>
          </div>
        </div>
        <div class="debt-order-remaining">
          <span>Còn phải thu</span
          ><strong>{{
            detail.remainingAmount == null ? '—' : formatStockInteger(detail.remainingAmount) + ' ₫'
          }}</strong>
        </div>
      </section>
      <dl class="debt-order-metadata">
        <div>
          <dt>Ngày bán</dt>
          <dd>{{ formatDate(detail.saleDate) || '—' }}</dd>
        </div>
        <div>
          <dt>Kho</dt>
          <dd>
            <a-tooltip :title="detail.warehouseId"
              ><span class="debt-order-ellipsis">{{ detail.warehouseId }}</span></a-tooltip
            >
          </dd>
        </div>
        <div>
          <dt>Ghi chú</dt>
          <dd class="debt-order-note">{{ detail.note ?? '—' }}</dd>
        </div>
      </dl>
      <details :key="detail.id" class="debt-order-audit">
        <summary>
          <RightOutlined aria-hidden="true" /><span
            ><strong>Thông tin định danh &amp; lịch sử xử lý</strong
            ><span>Xem mã đơn, ID kho, người tạo và thời gian xử lý.</span></span
          >
        </summary>
        <dl class="debt-order-metadata">
          <div>
            <dt>ID đơn</dt>
            <dd>{{ detail.id }}</dd>
          </div>
          <div>
            <dt>Mã đơn đầy đủ</dt>
            <dd>{{ detail.code || '—' }}</dd>
          </div>
          <div>
            <dt>ID kho</dt>
            <dd>{{ detail.warehouseId }}</dd>
          </div>
          <div v-if="detail.customerId">
            <dt>ID khách</dt>
            <dd>{{ detail.customerId }}</dd>
          </div>
          <div>
            <dt>Người tạo</dt>
            <dd>{{ detail.createdBy || '—' }}</dd>
          </div>
          <div>
            <dt>Thời gian tạo</dt>
            <dd>{{ formatDateTime(detail.createdAt) || '—' }}</dd>
          </div>
          <div v-if="detail.updatedAt">
            <dt>Cập nhật lúc</dt>
            <dd>{{ formatDateTime(detail.updatedAt) }}</dd>
          </div>
          <div>
            <dt>Người xác nhận</dt>
            <dd>{{ detail.confirmedBy ?? '—' }}</dd>
          </div>
          <div>
            <dt>Thời gian xác nhận</dt>
            <dd>{{ detail.confirmedAt ? formatDateTime(detail.confirmedAt) : '—' }}</dd>
          </div>
          <div v-if="detail.cancelledBy">
            <dt>Người hủy</dt>
            <dd>{{ detail.cancelledBy }}</dd>
          </div>
          <div v-if="detail.cancelledAt">
            <dt>Thời gian hủy</dt>
            <dd>{{ formatDateTime(detail.cancelledAt) }}</dd>
          </div>
          <div v-if="detail.cancellationReason">
            <dt>Lý do hủy</dt>
            <dd>{{ detail.cancellationReason }}</dd>
          </div>
        </dl>
      </details>
      <a-alert v-if="error" type="error" :message="error" show-icon />
      <section class="debt-order-products" aria-label="Sản phẩm">
        <header>
          <h3><InboxOutlined aria-hidden="true" />Sản phẩm</h3>
          <a-tooltip title="Tải lại sản phẩm"
            ><a-button aria-label="Tải lại sản phẩm" :loading="loading" @click="emit('reload')"
              ><template #icon><ReloadOutlined aria-hidden="true" /></template></a-button
          ></a-tooltip>
        </header>
        <a-table
          :columns="lineColumns"
          :data-source="detail.lines"
          :pagination="false"
          :loading="loading"
          row-key="productId"
          :scroll="{ x: 1050 }"
          table-layout="fixed"
          aria-label="Sản phẩm của đơn còn nợ"
        >
          <template #bodyCell="{ column, record }">
            <a-tooltip
              v-if="['productCode', 'productName'].includes(String(column.key))"
              :title="record[column.key]"
              ><span
                :class="
                  column.key === 'productCode' ? 'debt-order-ellipsis' : 'debt-order-product-name'
                "
                >{{ record[column.key] }}</span
              ></a-tooltip
            >
            <span
              v-else-if="['quantity', 'unitPrice', 'lineTotal'].includes(String(column.key))"
              class="debt-order-line-number"
              >{{ formatStockInteger(record[column.key])
              }}{{ column.key === 'quantity' ? '' : ' ₫' }}</span
            >
          </template>
        </a-table>
      </section>
      <OrderPaymentPanel
        :key="detail.id"
        :order="detail"
        presentation="receivable"
        @updated="selected = $event"
        @refresh-requested="emit('reload')"
      />
    </div>
    <template #footer><a-button @click="open = false">Đóng</a-button></template>
  </BasicModal>
  <CollectPaymentDialog
    v-if="collectOrder"
    v-model:open="collectOpen"
    :order="collectOrder"
    @updated="collectOrder = $event"
    @refresh-requested="emit('reload')"
  />
</template>

<style scoped>
.receivable-order-actions {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
}
@media (max-width: 767px) {
  .receivable-order-actions {
    flex-wrap: wrap;
  }
}
.debt-order-content {
  display: flex;
  flex-direction: column;
  gap: 20px;
  min-width: 0;
}
.debt-order-summary {
  display: grid;
  grid-template-columns: minmax(0, 1.7fr) minmax(0, 1fr);
  align-items: center;
  gap: 24px;
  padding: 22px;
  background: #f3eefc;
  border-radius: 12px;
}
.debt-order-identity {
  display: flex;
  align-items: center;
  gap: 16px;
  min-width: 0;
}
.debt-order-icon {
  display: grid;
  place-items: center;
  flex-shrink: 0;
  width: 52px;
  height: 52px;
  border-radius: 50%;
  background: #e5dafb;
  color: #7357cf;
  font-size: 26px;
}
.debt-order-summary-text {
  min-width: 0;
}
.debt-order-summary h2 {
  margin: 0 0 8px;
  font-size: 18px;
  color: #302640;
  font-weight: 650;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.debt-order-customer-row {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px 14px;
  min-width: 0;
}
.debt-order-customer {
  color: #797184;
  overflow-wrap: anywhere;
}
.debt-order-customer-row :deep(.ant-tag) {
  max-width: 100%;
  margin: 0;
  white-space: normal;
  padding: 3px 10px;
  border: 0;
  border-radius: 20px;
  line-height: 20px;
  font-size: 13px;
}
.debt-order-remaining {
  min-width: 0;
  padding-left: 26px;
  border-left: 1px solid #d6c5f5;
}
.debt-order-remaining > span {
  color: #797184;
  font-weight: 600;
}
.debt-order-remaining strong {
  display: block;
  margin-top: 6px;
  color: #7357cf;
  font-size: 30px;
  line-height: 38px;
  font-weight: 700;
  font-variant-numeric: tabular-nums;
  overflow-wrap: anywhere;
}
.debt-order-metadata {
  display: grid;
  gap: 14px;
  margin: 0;
}
.debt-order-metadata > div {
  display: grid;
  grid-template-columns: minmax(0, 180px) minmax(0, 1fr);
  gap: 8px 16px;
  min-width: 0;
}
.debt-order-metadata dt {
  color: #797184;
}
.debt-order-metadata dd {
  margin: 0;
  min-width: 0;
  overflow-wrap: anywhere;
}
.debt-order-note {
  white-space: pre-wrap;
}
.debt-order-ellipsis {
  display: block;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.debt-order-audit {
  padding: 14px 18px;
  border: 1px solid #e9e4f1;
  border-radius: 10px;
  background: #faf9fc;
}
.debt-order-audit summary {
  display: flex;
  align-items: center;
  gap: 14px;
  list-style: none;
  cursor: pointer;
  color: #302640;
}
.debt-order-audit summary::-webkit-details-marker {
  display: none;
}
.debt-order-audit summary > .anticon {
  flex-shrink: 0;
  transition: transform 0.15s;
}
.debt-order-audit[open] summary > .anticon {
  transform: rotate(90deg);
}
.debt-order-audit summary > span:last-child {
  min-width: 0;
}
.debt-order-audit summary strong {
  display: block;
  font-weight: 600;
}
.debt-order-audit summary > span:last-child > span {
  display: block;
  margin-top: 4px;
  color: #797184;
  font-size: 13px;
}
.debt-order-audit .debt-order-metadata {
  margin-top: 18px;
}
.debt-order-audit summary:focus-visible {
  outline: 2px solid #7357cf;
  outline-offset: 4px;
  border-radius: 4px;
}
.debt-order-products {
  min-width: 0;
  border: 1px solid #e9e4f1;
  border-radius: 12px;
}
.debt-order-products header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 14px 18px;
}
.debt-order-products h3 {
  display: flex;
  align-items: center;
  gap: 12px;
  margin: 0;
  color: #302640;
  font-size: 18px;
  font-weight: 650;
}
.debt-order-products h3 > .anticon {
  color: #7357cf;
  font-size: 21px;
}
.debt-order-products :deep(.ant-table-thead > tr > th) {
  background: #f8f6fc;
  color: #625b70;
  font-weight: 600;
}
.debt-order-products :deep(.ant-table-tbody > tr > td) {
  border-color: #f0edf5;
}
.debt-order-product-name {
  overflow-wrap: anywhere;
}
.debt-order-line-number {
  white-space: nowrap;
  font-variant-numeric: tabular-nums;
}
:global(.receivable-order-dialog .ant-modal) {
  top: 20px;
  max-width: min(1400px, calc(100% - 32px));
  padding-bottom: 20px;
}
:global(.receivable-order-dialog .ant-modal-content) {
  display: flex;
  flex-direction: column;
  max-height: calc(100vh - 40px);
  max-height: calc(100dvh - 40px);
  padding: 0;
  border-radius: 16px;
}
:global(.receivable-order-dialog .ant-modal-header) {
  flex-shrink: 0;
  margin: 0;
  padding: 22px 64px 20px 28px;
  border-radius: 16px 16px 0 0;
}
:global(.receivable-order-dialog .ant-modal-title) {
  color: #302640;
  font-size: 24px;
  line-height: 32px;
  font-weight: 700;
}
:global(.receivable-order-dialog .ant-modal-close) {
  top: 20px;
  inset-inline-end: 20px;
  width: 40px;
  height: 40px;
}
:global(.receivable-order-dialog .ant-modal-body) {
  min-height: 0;
  min-width: 0;
  padding: 0 28px 24px;
  overflow: auto;
  overscroll-behavior: contain;
}
:global(.receivable-order-dialog .ant-modal-footer) {
  flex-shrink: 0;
  margin: 0;
  padding: 12px 22px;
  border-top: 1px solid #eee8f6;
}
:global(.receivable-order-dialog .ant-modal-footer .ant-btn) {
  min-width: 90px;
  min-height: 40px;
}
@media (max-width: 1024px) {
  .debt-order-summary {
    padding: 18px;
    gap: 18px;
  }
  .debt-order-remaining {
    padding-left: 18px;
  }
}
@media (max-width: 767px) {
  .debt-order-content {
    gap: 16px;
  }
  .debt-order-summary {
    grid-template-columns: minmax(0, 1fr);
    gap: 16px;
    padding: 16px;
  }
  .debt-order-identity {
    align-items: flex-start;
    gap: 12px;
  }
  .debt-order-icon {
    width: 40px;
    height: 40px;
    font-size: 22px;
  }
  .debt-order-summary h2 {
    font-size: 16px;
  }
  .debt-order-remaining {
    padding: 14px 0 0;
    border-left: 0;
    border-top: 1px solid #d6c5f5;
  }
  .debt-order-remaining strong {
    font-size: 28px;
    line-height: 36px;
  }
  .debt-order-metadata > div {
    grid-template-columns: minmax(0, 1fr);
    gap: 4px;
  }
  .debt-order-audit {
    padding: 14px 12px;
  }
  .debt-order-audit summary {
    min-height: 44px;
    align-items: flex-start;
    gap: 10px;
  }
  .debt-order-audit summary > .anticon {
    margin-top: 4px;
  }
  .debt-order-products header {
    padding: 12px;
  }
  .debt-order-products header :deep(.ant-btn) {
    width: 44px;
    height: 44px;
    flex-shrink: 0;
  }
  :global(.receivable-order-dialog .ant-modal) {
    top: 8px;
    width: calc(100% - 16px) !important;
    max-width: calc(100% - 16px);
    padding-bottom: 8px;
  }
  :global(.receivable-order-dialog .ant-modal-content) {
    max-height: calc(100vh - 16px);
    max-height: calc(100dvh - 16px);
  }
  :global(.receivable-order-dialog .ant-modal-header) {
    padding: 16px 60px 16px 16px;
  }
  :global(.receivable-order-dialog .ant-modal-title) {
    font-size: 20px;
    line-height: 28px;
  }
  :global(.receivable-order-dialog .ant-modal-close) {
    top: 10px;
    inset-inline-end: 8px;
    width: 44px;
    height: 44px;
  }
  :global(.receivable-order-dialog .ant-modal-body) {
    padding: 0 12px 16px;
  }
  :global(.receivable-order-dialog .ant-modal-footer) {
    padding: 10px 12px;
  }
  :global(.receivable-order-dialog .ant-modal-footer .ant-btn) {
    min-height: 44px;
  }
}
@media (max-height: 500px) {
  :global(.receivable-order-dialog .ant-modal) {
    top: 8px;
    padding-bottom: 8px;
  }
  :global(.receivable-order-dialog .ant-modal-content) {
    max-height: calc(100vh - 16px);
    max-height: calc(100dvh - 16px);
  }
  :global(.receivable-order-dialog .ant-modal-header),
  :global(.receivable-order-dialog .ant-modal-footer) {
    padding-block: 10px;
  }
  :global(.receivable-order-dialog .ant-modal-close) {
    top: 8px;
  }
}
</style>
