<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import { message, Modal } from 'ant-design-vue'
import { BasicModal, BasicTable } from '@/components'
import ProductSelect from '@/components/stock/ProductSelect.vue'
import CustomerSelect from './CustomerSelect.vue'
import OrderPaymentPanel from './OrderPaymentPanel.vue'
import { usePaymentsStore } from '@/stores/payments'
import {
  getSalesOrder,
  createSalesOrder,
  updateSalesOrder,
  confirmSalesOrder,
  cancelSalesOrder,
  getCustomer,
} from '@/api/sales/sales.api'
import { getInventory } from '@/api/stock/stock.api'
import { useSalesScope } from '@/composables/useSalesScope'
import { useStockStore } from '@/stores/stock'
import { formatStockInteger, validStockInteger } from '@/utils/stock'
import {
  salesInput,
  salesTotals,
  validateSales,
  salesError,
  salesFieldErrors,
  salesCustomerName,
} from '@/utils/sales'
import { formatDateTime } from '@/utils/date'
import type { SalesOrder, SalesForm, Customer } from '@/types/sales'
import type { StockInteger } from '@/types/stock'
import type { NormalizedApiError } from '@/utils/request'
const props = defineProps<{
  open: boolean
  id?: string
  mode: 'create' | 'edit' | 'view' | 'confirm' | 'cancel'
}>()
const emit = defineEmits<{ 'update:open': [value: boolean]; saved: [order: SalesOrder] }>()
const { can, warehouses, scopeKey, inScope, refreshScope } = useSalesScope()
const stock = useStockStore()
const payments = usePaymentsStore()
const detail = ref<SalesOrder>()
const customer = ref<Customer>()
const customerLookupFailed = ref(false)
const loading = ref(false)
const saving = ref(false)
const blocked = ref(false)
const error = ref('')
const fields = ref<Record<string, string>>({})
const reason = ref('')
const goodsReturned = ref(false)
const inventory = ref<Record<string, StockInteger>>({})
const inventoryError = ref('')
let sequence = 0
let inventorySequence = 0
let lineSequence = 0
const newLine = () => ({
  key: String(++lineSequence),
  productId: '',
  quantity: '1',
  unitPrice: '0',
})
const empty = (): SalesForm => ({
  warehouseId: warehouses.selectedId ?? '',
  customerId: undefined,
  saleDate: new Intl.DateTimeFormat('sv-SE', { timeZone: 'Asia/Bangkok' }).format(new Date()),
  note: '',
  discountAmount: '0',
  lines: [newLine()],
})
const form = ref<SalesForm>(empty())
const readOnly = computed(() => ['view', 'confirm', 'cancel'].includes(props.mode))
const allowed = computed(() =>
  can(
    'SALES_ORDER_' +
      { create: 'CREATE', edit: 'UPDATE', view: 'VIEW', confirm: 'CONFIRM', cancel: 'CANCEL' }[
        props.mode
      ],
  ),
)
const eligible = computed(
  () =>
    props.mode === 'create' ||
    (!!detail.value &&
      (props.mode === 'view' ||
        (props.mode === 'cancel'
          ? detail.value.status !== 'CANCELLED' && BigInt(detail.value.paidAmount ?? 0) === 0n
          : detail.value.status === 'DRAFT'))),
)
const warehouseOptions = computed(() =>
  warehouses.warehouses.map((item) => ({
    value: item.id,
    label: item.code + ' — ' + item.name,
    disabled: item.status !== 1,
  })),
)
const seeds = computed(
  () =>
    detail.value?.lines.map((line) => ({
      value: line.productId,
      label: line.productCode + ' — ' + line.productName,
    })) ?? [],
)
const totals = computed(() => salesTotals(form.value))
const lineTotal = (quantity: string, price: string): bigint =>
  validStockInteger(quantity, true) && validStockInteger(price)
    ? BigInt(quantity.trim()) * BigInt(price.trim())
    : 0n
const columns = ['productCode', 'productName', 'unit', 'quantity', 'unitPrice', 'lineTotal'].map(
  (key, index) => ({
    key,
    dataIndex: key,
    title: ['Mã sản phẩm', 'Sản phẩm', 'Đơn vị', 'Số lượng', 'Đơn giá', 'Thành tiền'][index],
  }),
)
const warehouseName = (id: string) =>
  warehouses.warehouses.find((item) => item.id === id)?.name ?? id
const loadCustomer = async (id: string, current: number): Promise<void> => {
  customerLookupFailed.value = false
  if (!can('CUSTOMER_VIEW')) return
  try {
    const result = await getCustomer(id)
    if (current !== sequence) return
    if (result.warehouseId !== form.value.warehouseId || !inScope(result.warehouseId)) {
      customerLookupFailed.value = true
      return
    }
    customer.value = result
  } catch (cause) {
    if (current === sequence) customerLookupFailed.value = true
    if ((cause as NormalizedApiError).status === 403) await refreshScope()
  }
}
const load = async (): Promise<void> => {
  if (saving.value || !props.open) return
  const current = ++sequence
  loading.value = true
  error.value = ''
  fields.value = {}
  customer.value = undefined
  customerLookupFailed.value = false
  try {
    if (!props.id || !allowed.value || !can('SALES_ORDER_VIEW')) return
    const result = await getSalesOrder(props.id)
    if (current !== sequence) return
    if (!inScope(result.warehouseId)) {
      blocked.value = true
      error.value = 'Kho không còn trong phạm vi được phép.'
      return
    }
    detail.value = result
    payments.syncOrders([result])
    form.value = {
      warehouseId: result.warehouseId,
      customerId: result.customerId ?? undefined,
      saleDate: result.saleDate,
      note: result.note ?? '',
      discountAmount: String(result.discountAmount),
      lines: result.lines.map((line) => ({
        key: String(++lineSequence),
        productId: line.productId,
        quantity: String(line.quantity),
        unitPrice: String(line.unitPrice),
      })),
    }
    blocked.value = false
    if (result.customerId && !result.customerSnapshot)
      await loadCustomer(result.customerId, current)
  } catch (cause) {
    if (current === sequence) error.value = salesError(cause)
    if ((cause as NormalizedApiError).status === 403) await refreshScope()
  } finally {
    if (current === sequence) loading.value = false
  }
}
watch(
  () => [props.open, props.id, props.mode],
  () => {
    ++sequence
    detail.value = undefined
    customer.value = undefined
    form.value = empty()
    fields.value = {}
    reason.value = ''
    goodsReturned.value = false
    blocked.value = false
    loading.value = false
    error.value = ''
    customerLookupFailed.value = false
    if (props.open && props.id) void load()
  },
  { immediate: true },
)
watch(
  scopeKey,
  () => {
    ++sequence
    ++inventorySequence
    inventory.value = {}
    detail.value = undefined
    customer.value = undefined
    form.value = empty()
    loading.value = false
    blocked.value = true
    emit('update:open', false)
  },
  { flush: 'sync' },
)
watch(
  () => form.value.warehouseId,
  (value, old) => {
    if (props.mode === 'create' && old && value !== old) {
      form.value.customerId = undefined
      customer.value = undefined
      message.info(
        'Đã đổi kho và bỏ khách đã chọn. Các dòng hàng được giữ nguyên; tồn tham khảo sẽ tải lại.',
      )
    }
  },
)
watch(
  () => [
    props.open,
    form.value.warehouseId,
    form.value.lines.map((line) => line.productId).join(','),
    can('INVENTORY_VIEW'),
    stock.revision,
  ],
  async () => {
    const current = ++inventorySequence
    inventory.value = {}
    inventoryError.value = ''
    if (!props.open || readOnly.value || !can('INVENTORY_VIEW') || !inScope(form.value.warehouseId))
      return
    const warehouseId = form.value.warehouseId
    const ids = [...new Set(form.value.lines.map((line) => line.productId).filter(Boolean))]
    for (let offset = 0; offset < ids.length; offset += 8) {
      if (current !== inventorySequence) return
      const batch = ids.slice(offset, offset + 8)
      const results = await Promise.allSettled(
        batch.map((productId) => getInventory(warehouseId, { productId, page: 1, pageSize: 1 })),
      )
      if (current !== inventorySequence) return
      results.forEach((result, index) => {
        if (result.status === 'fulfilled') {
          const item = result.value.items.find((item) => item.productId === batch[index])
          if (item) inventory.value[item.productId] = item.quantity
        } else {
          inventoryError.value = salesError(result.reason)
          if ((result.reason as NormalizedApiError).status === 403) void refreshScope()
        }
      })
    }
  },
  { immediate: true },
)
onBeforeUnmount(() => {
  ++sequence
  ++inventorySequence
})
const fieldError = (index: number, key: string) =>
  fields.value['lines[' + index + '].' + key] ?? fields.value['lines.' + index + '.' + key]
const selectCustomer = (value: Customer | undefined): void => {
  customer.value = value
  customerLookupFailed.value = false
}
const useRetailCustomer = (): void => {
  form.value.customerId = undefined
  customer.value = undefined
  customerLookupFailed.value = false
}
const submit = async (): Promise<void> => {
  if (
    saving.value ||
    loading.value ||
    blocked.value ||
    !allowed.value ||
    !eligible.value ||
    props.mode === 'view'
  )
    return
  fields.value = {}
  error.value = ''
  if (!inScope(form.value.warehouseId)) {
    error.value = 'Kho không còn trong phạm vi được phép.'
    return
  }
  if (!readOnly.value) {
    fields.value = validateSales(form.value)
    if (
      props.mode === 'create' &&
      !warehouses.warehouses.some((item) => item.id === form.value.warehouseId && item.status === 1)
    )
      fields.value.warehouseId = 'Chọn kho hoạt động.'
    if (
      form.value.customerId &&
      customer.value &&
      (customer.value.status !== 1 || customer.value.warehouseId !== form.value.warehouseId)
    )
      fields.value.customerId =
        'Khách đã ngừng hoạt động hoặc khác kho. Chọn khách khác / khách lẻ.'
    if (form.value.customerId && customerLookupFailed.value)
      fields.value.customerId =
        'Không kiểm tra được khách hiện tại. Tải lại hoặc chọn khách khác / khách lẻ.'
    if (
      form.value.customerId &&
      props.mode === 'create' &&
      (!customer.value || !can('CUSTOMER_VIEW'))
    )
      fields.value.customerId = 'Cần chọn khách hợp lệ qua CUSTOMER_VIEW.'
  }
  if (props.mode === 'cancel') {
    if (!reason.value.trim() || reason.value.trim().length > 2000)
      fields.value.reason = 'Lý do bắt buộc, tối đa 2000 ký tự.'
    if (detail.value?.status === 'CONFIRMED' && !goodsReturned.value)
      fields.value.goodsReturned = 'Cần xác nhận thu hồi toàn bộ hàng.'
  }
  if (Object.keys(fields.value).length) return
  const current = sequence
  saving.value = true
  try {
    let result: SalesOrder
    if (props.mode === 'create')
      result = await createSalesOrder({
        ...salesInput(form.value),
        warehouseId: form.value.warehouseId,
      })
    else {
      const original = detail.value
      if (!original) return
      if (props.mode === 'edit')
        result = await updateSalesOrder(original.id, {
          ...salesInput(form.value),
          version: original.version,
        })
      else if (props.mode === 'confirm')
        result = await confirmSalesOrder(original.id, original.version)
      else
        result = await cancelSalesOrder(
          original.id,
          original.version,
          reason.value.trim(),
          original.status === 'CONFIRMED' && goodsReturned.value ? true : undefined,
        )
    }
    if (props.mode === 'confirm' || props.mode === 'cancel') stock.invalidate()
    if (current !== sequence) return
    detail.value = result
    message.success(
      'Đã lưu ' + result.code + '. Tổng tiền: ' + formatStockInteger(result.totalAmount) + ' VND.',
    )
    emit('saved', result)
    emit('update:open', false)
  } catch (cause) {
    if (current !== sequence) return
    const apiError = cause as NormalizedApiError
    error.value = salesError(cause)
    fields.value = salesFieldErrors(cause)
    if ([409, 403, 404].includes(apiError.status ?? 0)) blocked.value = true
    if (apiError.status === 403) await refreshScope()
    if (
      (!apiError.status || apiError.status === 408 || apiError.status >= 500) &&
      ['confirm', 'cancel'].includes(props.mode) &&
      detail.value
    ) {
      blocked.value = true
      try {
        const latest = await getSalesOrder(detail.value.id)
        if (current !== sequence) return
        if (!inScope(latest.warehouseId)) {
          await refreshScope()
          return
        }
        detail.value = latest
        stock.invalidate()
        emit('saved', latest)
        error.value +=
          ' Đã tải lại trạng thái: ' + latest.status + '. Xem lại chi tiết trước khi thử tiếp.'
      } catch {
        if (current === sequence)
          error.value += ' Chưa xác định được kết quả. Hãy tải lại chi tiết trước khi thử tiếp.'
      }
    }
  } finally {
    saving.value = false
  }
}
const reload = (): void => {
  if (props.mode === 'edit')
    Modal.confirm({ title: 'Tải lại sẽ bỏ bản nhập chưa lưu. Tiếp tục?', onOk: load })
  else void load()
}
</script>
<template>
  <BasicModal
    :open="open"
    :title="
      mode === 'create'
        ? 'Tạo đơn bán hàng'
        : mode === 'edit'
          ? 'Sửa đơn bán hàng'
          : mode === 'confirm'
            ? 'Xác nhận bán hàng'
            : mode === 'cancel'
              ? 'Hủy đơn bán hàng'
              : 'Chi tiết đơn bán hàng'
    "
    :width="1100"
    :confirm-loading="saving"
    @update:open="emit('update:open', false)"
    @confirm="submit"
  >
    <a-spin :spinning="loading">
      <a-alert v-if="error" type="error" :message="error" show-icon />
      <a-alert
        v-if="id && !can('SALES_ORDER_VIEW')"
        type="warning"
        message="Cần SALES_ORDER_VIEW để tải chi tiết trước thao tác."
      />
      <a-alert
        v-if="detail && !eligible"
        type="warning"
        message="Trạng thái đơn không cho phép thao tác này."
      />
      <template v-if="allowed && (!id || detail)">
        <a-descriptions v-if="detail" bordered :column="2">
          <a-descriptions-item label="Mã đơn">{{ detail.code }}</a-descriptions-item>
          <a-descriptions-item label="Trạng thái">{{
            $t('sales.' + detail.status)
          }}</a-descriptions-item>
          <a-descriptions-item label="Kho">{{
            warehouseName(detail.warehouseId)
          }}</a-descriptions-item>
          <a-descriptions-item label="Khách">{{
            salesCustomerName(detail, customer ? [customer] : [])
          }}</a-descriptions-item>
          <a-descriptions-item label="Tạm tính"
            >{{ formatStockInteger(detail.subtotal) }} VND</a-descriptions-item
          >
          <a-descriptions-item label="Giảm giá"
            >{{ formatStockInteger(detail.discountAmount) }} VND</a-descriptions-item
          >
          <a-descriptions-item label="Tổng tiền"
            >{{ formatStockInteger(detail.totalAmount) }} VND</a-descriptions-item
          >
        </a-descriptions>
        <OrderPaymentPanel
          v-if="detail && mode === 'view'"
          :order="detail"
          @updated="detail = $event"
        />
        <a-alert
          v-if="detail && mode === 'cancel' && BigInt(detail.paidAmount ?? 0) > 0n"
          type="warning"
          message="Đơn đã có khoản thu hiệu lực. Chức năng hủy đơn kèm hoàn tiền chưa được hỗ trợ."
        />
        <a-form v-if="!readOnly" layout="vertical" :disabled="saving || blocked || !eligible">
          <div class="grid">
            <a-form-item label="Kho" required :help="fields.warehouseId"
              ><a-select
                v-if="mode === 'create'"
                v-model:value="form.warehouseId"
                :options="warehouseOptions" /><a-input
                v-else
                :value="warehouseName(form.warehouseId)"
                disabled
            /></a-form-item>
            <a-form-item label="Khách hàng" :help="fields.customerId">
              <CustomerSelect
                v-model:value="form.customerId"
                :warehouse-id="form.warehouseId"
                :seed="customer"
                active-only
                :disabled="saving || blocked"
                @selected="selectCustomer"
              />
              <p v-if="form.customerId && !customer">Khách hiện tại: {{ form.customerId }}</p>
              <a-button
                v-if="form.customerId"
                :disabled="saving || blocked"
                @click="useRetailCustomer"
                >Chuyển sang khách lẻ</a-button
              >
            </a-form-item>
            <a-form-item label="Ngày bán" required :help="fields.saleDate"
              ><a-date-picker v-model:value="form.saleDate" value-format="YYYY-MM-DD"
            /></a-form-item>
            <a-form-item label="Ghi chú" :help="fields.note"
              ><a-textarea v-model:value="form.note" :maxlength="2000"
            /></a-form-item>
          </div>
          <a-alert
            v-if="!can('PRODUCT_VIEW')"
            type="warning"
            message="Thiếu PRODUCT_VIEW để tìm sản phẩm và giá mặc định. Có thể giữ dòng cũ hoặc nhập ID đã biết; backend kiểm tra sản phẩm."
          />
          <a-alert v-if="fields.lines" type="error" :message="fields.lines" />
          <div v-for="(line, index) in form.lines" :key="line.key" class="lines">
            <a-form-item label="Sản phẩm" :help="fieldError(index, 'productId')"
              ><ProductSelect
                v-model:value="line.productId"
                :seeds="seeds"
                active-only
                sale-pricing
                :disabled="saving || blocked"
                @selected-price="
                  (price) => {
                    if (price !== undefined) line.unitPrice = String(price)
                  }
                "
            /></a-form-item>
            <a-form-item label="Số lượng" :help="fieldError(index, 'quantity')"
              ><a-input v-model:value="line.quantity" inputmode="numeric"
            /></a-form-item>
            <a-form-item label="Đơn giá" :help="fieldError(index, 'unitPrice')"
              ><a-input v-model:value="line.unitPrice" inputmode="numeric"
            /></a-form-item>
            <div>
              Thành tiền:
              {{ formatStockInteger(lineTotal(line.quantity, line.unitPrice)) }} VND<small
                v-if="can('INVENTORY_VIEW') && inventory[line.productId] !== undefined"
                >Tồn tham khảo: {{ formatStockInteger(inventory[line.productId]!) }}</small
              >
            </div>
            <a-button danger :disabled="saving || blocked" @click="form.lines.splice(index, 1)"
              >Bỏ dòng</a-button
            >
          </div>
          <a-button
            :disabled="saving || blocked || form.lines.length >= 1000"
            @click="form.lines.push(newLine())"
            >Thêm dòng</a-button
          >
          <a-alert
            v-if="inventoryError"
            type="warning"
            :message="'Không tải được tồn tham khảo: ' + inventoryError"
          />
          <p v-if="can('INVENTORY_VIEW')">Tồn chỉ để tham khảo. Backend kiểm tra khi xác nhận.</p>
          <a-form-item label="Giảm giá toàn đơn" :help="fields.discountAmount"
            ><a-input v-model:value="form.discountAmount" inputmode="numeric"
          /></a-form-item>
          <p>
            Tạm tính dự kiến: {{ formatStockInteger(totals.subtotal) }} VND · Tổng dự kiến:
            {{ formatStockInteger(totals.totalAmount) }} VND
          </p>
        </a-form>
        <template v-else-if="detail">
          <a-descriptions bordered :column="2">
            <a-descriptions-item label="Ngày bán">{{ detail.saleDate }}</a-descriptions-item>
            <a-descriptions-item label="Ghi chú">{{ detail.note ?? '—' }}</a-descriptions-item>
            <a-descriptions-item label="Khách (thông tin lịch sử)" :span="2">{{
              detail.customerSnapshot
                ? [
                    detail.customerSnapshot.code,
                    detail.customerSnapshot.name,
                    detail.customerSnapshot.phone,
                    detail.customerSnapshot.address,
                  ]
                    .filter(Boolean)
                    .join(' · ')
                : salesCustomerName(detail, customer ? [customer] : [])
            }}</a-descriptions-item>
            <a-descriptions-item label="Người / thời gian tạo"
              >{{ detail.createdBy }} · {{ formatDateTime(detail.createdAt) }}</a-descriptions-item
            >
            <a-descriptions-item label="Cập nhật">{{
              formatDateTime(detail.updatedAt)
            }}</a-descriptions-item>
            <a-descriptions-item v-if="detail.confirmedAt" label="Người / thời gian xác nhận"
              >{{ detail.confirmedBy }} ·
              {{ formatDateTime(detail.confirmedAt) }}</a-descriptions-item
            >
            <a-descriptions-item v-if="detail.cancelledAt" label="Người / thời gian hủy"
              >{{ detail.cancelledBy }} ·
              {{ formatDateTime(detail.cancelledAt) }}</a-descriptions-item
            >
            <a-descriptions-item v-if="detail.cancellationReason" label="Lý do hủy">{{
              detail.cancellationReason
            }}</a-descriptions-item>
            <a-descriptions-item
              v-if="detail.goodsReturned !== undefined && detail.goodsReturned !== null"
              label="Đã xác nhận thu hồi hàng"
              >{{ detail.goodsReturned ? 'Có' : 'Không' }}</a-descriptions-item
            >
          </a-descriptions>
          <BasicTable
            :columns="columns"
            :data-source="detail.lines"
            row-key="productId"
            :scroll="{ x: 700 }"
            @reload="reload"
          >
            <template #bodyCell="{ column, record }"
              ><template
                v-if="['quantity', 'unitPrice', 'lineTotal'].includes(String(column.key))"
                >{{ formatStockInteger(record[column.key]) }}</template
              ></template
            >
          </BasicTable>
          <a-alert
            v-if="mode === 'confirm'"
            type="warning"
            message="Xác nhận sẽ xuất toàn bộ hàng và trừ tồn kho của tất cả dòng trong đơn."
          />
          <template v-if="mode === 'cancel'">
            <a-alert
              type="warning"
              :message="
                detail.status === 'CONFIRMED'
                  ? 'Hủy sẽ cộng lại toàn bộ hàng vào kho. Không dùng thao tác này cho trả hàng một phần.'
                  : 'Hủy đơn nháp không thay đổi tồn kho.'
              "
            />
            <a-form-item label="Lý do hủy" required :help="fields.reason"
              ><a-textarea v-model:value="reason" :maxlength="2000" :disabled="saving || blocked"
            /></a-form-item>
            <a-form-item v-if="detail.status === 'CONFIRMED'" :help="fields.goodsReturned"
              ><a-checkbox v-model:checked="goodsReturned" :disabled="saving || blocked"
                >Tôi xác nhận đã thu hồi toàn bộ hàng hoặc hàng chưa được giao</a-checkbox
              ></a-form-item
            >
          </template>
        </template>
      </template>
    </a-spin>
    <template #footer>
      <a-button :disabled="saving" @click="emit('update:open', false)">Đóng</a-button>
      <a-button v-if="id" :disabled="saving || loading" @click="reload">Tải lại chi tiết</a-button>
      <a-button
        v-if="mode !== 'view'"
        type="primary"
        :danger="mode === 'cancel'"
        :loading="saving"
        :disabled="loading || blocked || !allowed || !eligible"
        @click="submit"
        >{{
          mode === 'confirm' ? 'Xác nhận xuất hàng' : mode === 'cancel' ? 'Hủy đơn' : 'Lưu nháp'
        }}</a-button
      >
    </template>
  </BasicModal>
</template>
<style scoped>
.grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 16px;
  margin-top: 16px;
}
.lines {
  display: grid;
  grid-template-columns: 2fr 1fr 1fr 1.4fr auto;
  gap: 12px;
  align-items: center;
}
small {
  display: block;
}
:deep(.ant-alert) {
  margin: 12px 0;
}
@media (max-width: 700px) {
  .grid,
  .lines {
    grid-template-columns: 1fr;
  }
}
</style>
