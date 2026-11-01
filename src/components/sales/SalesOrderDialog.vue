<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import { message, Modal } from 'ant-design-vue'
import { BasicModal, BasicTable } from '@/components'
import { PlusOutlined } from '@ant-design/icons-vue'
import type { TableColumnsType } from 'ant-design-vue'
import SettlementDetails from './SettlementDetails.vue'
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
import { formatDate, formatDateTime } from '@/utils/date'
import type { SalesOrder, SalesForm, Customer } from '@/types/sales'
import type { ReceiptLine, StockInteger } from '@/types/stock'
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
const columns: TableColumnsType<ReceiptLine> = [
  { key: 'productCode', dataIndex: 'productCode', title: 'Mã sản phẩm', width: 200 },
  { key: 'productName', dataIndex: 'productName', title: 'Sản phẩm', width: 280 },
  { key: 'unit', dataIndex: 'unit', title: 'Đơn vị', width: 100 },
  { key: 'quantity', dataIndex: 'quantity', title: 'Số lượng', width: 220, align: 'right' },
  { key: 'unitPrice', dataIndex: 'unitPrice', title: 'Đơn giá (VND)', width: 224, align: 'right' },
  {
    key: 'lineTotal',
    dataIndex: 'lineTotal',
    title: 'Thành tiền (VND)',
    width: 224,
    align: 'right',
  },
]
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
    if ((cause as NormalizedApiError).status === 403) await refreshScope(cause)
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
    if ((cause as NormalizedApiError).status === 403) await refreshScope(cause)
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
          if ((result.reason as NormalizedApiError).status === 403) void refreshScope(result.reason)
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
      props.mode === 'cancel'
        ? 'Đã hủy đơn bán hàng ' + result.code
        : props.mode === 'confirm'
          ? 'Đã xác nhận đơn bán hàng ' + result.code
          : 'Đã lưu ' +
            result.code +
            '. Tổng tiền: ' +
            formatStockInteger(result.totalAmount) +
            ' VND.',
    )
    emit('saved', result)
    emit('update:open', false)
  } catch (cause) {
    if (current !== sequence) return
    const apiError = cause as NormalizedApiError
    error.value = salesError(cause)
    fields.value = salesFieldErrors(cause)
    if ([409, 403, 404].includes(apiError.status ?? 0)) blocked.value = true
    if (apiError.status === 403) await refreshScope(cause)
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
          await refreshScope(cause)
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
    :width="1440"
    wrap-class-name="sales-order-dialog"
    :confirm-loading="saving"
    @update:open="emit('update:open', false)"
    @confirm="submit"
  >
    <a-spin :spinning="loading">
      <div class="order-dialog-body">
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
          <div v-if="detail" class="order-identity">
            <span class="order-detail-code">{{ detail.code }}</span>
            <a-tag
              :color="
                detail.status === 'CONFIRMED'
                  ? 'green'
                  : detail.status === 'CANCELLED'
                    ? 'red'
                    : 'default'
              "
            >
              {{ $t('sales.' + detail.status) }}
            </a-tag>
          </div>
          <a-alert
            v-if="detail && mode === 'cancel' && BigInt(detail.paidAmount ?? 0) > 0n"
            type="warning"
            message="Đơn đã có khoản thu hiệu lực. Chức năng hủy đơn kèm hoàn tiền chưa được hỗ trợ."
          />
          <a-form v-if="!readOnly" layout="vertical" :disabled="saving || blocked || !eligible">
            <div class="order-editor">
              <div class="order-editor-main">
                <section class="order-section">
                  <h2>{{ $t('sales.orderInformation') }}</h2>
                  <div class="order-info-grid">
                    <a-form-item
                      label="Kho"
                      html-for="sale-warehouse"
                      required
                      :help="fields.warehouseId"
                      :validate-status="fields.warehouseId ? 'error' : undefined"
                    >
                      <a-select
                        v-if="mode === 'create'"
                        id="sale-warehouse"
                        v-model:value="form.warehouseId"
                        :options="warehouseOptions"
                      />
                      <a-input
                        v-else
                        id="sale-warehouse"
                        :value="warehouseName(form.warehouseId)"
                        disabled
                      />
                    </a-form-item>
                    <a-form-item
                      label="Khách hàng"
                      html-for="sale-customer"
                      :help="fields.customerId"
                      :validate-status="fields.customerId ? 'error' : undefined"
                    >
                      <CustomerSelect
                        v-model:value="form.customerId"
                        input-id="sale-customer"
                        :warehouse-id="form.warehouseId"
                        :seed="customer"
                        active-only
                        :disabled="saving || blocked"
                        @selected="selectCustomer"
                      />
                      <p v-if="form.customerId && !customer" class="order-help">
                        Khách hiện tại: {{ form.customerId }}
                      </p>
                      <a-button
                        v-if="form.customerId"
                        size="small"
                        class="retail-action"
                        :disabled="saving || blocked"
                        @click="useRetailCustomer"
                        >Chuyển sang khách lẻ</a-button
                      >
                    </a-form-item>
                    <a-form-item
                      label="Ngày bán"
                      html-for="sale-date"
                      required
                      :help="fields.saleDate"
                      :validate-status="fields.saleDate ? 'error' : undefined"
                    >
                      <a-date-picker
                        id="sale-date"
                        v-model:value="form.saleDate"
                        value-format="YYYY-MM-DD"
                      />
                    </a-form-item>
                    <a-form-item
                      label="Ghi chú"
                      html-for="sale-note"
                      :help="fields.note"
                      :validate-status="fields.note ? 'error' : undefined"
                    >
                      <a-textarea
                        id="sale-note"
                        v-model:value="form.note"
                        :maxlength="2000"
                        :rows="2"
                      />
                    </a-form-item>
                  </div>
                </section>
                <section class="order-section order-products-section">
                  <div class="order-section-heading">
                    <h2>{{ $t('sales.orderProducts') }}</h2>
                    <span class="order-help">{{ $t('sales.orderCurrency') }}</span>
                  </div>
                  <a-alert
                    v-if="!can('PRODUCT_VIEW')"
                    type="warning"
                    message="Thiếu PRODUCT_VIEW để tìm sản phẩm và giá mặc định. Có thể giữ dòng cũ hoặc nhập ID đã biết; backend kiểm tra sản phẩm."
                  />
                  <a-alert v-if="fields.lines" type="error" :message="fields.lines" show-icon />
                  <div
                    class="order-lines-scroll"
                    tabindex="0"
                    :aria-label="$t('sales.orderProducts')"
                  >
                    <table class="order-lines-table">
                      <colgroup>
                        <col class="line-product-col" />
                        <col class="line-quantity-col" />
                        <col class="line-price-col" />
                        <col class="line-total-col" />
                        <col class="line-remove-col" />
                      </colgroup>
                      <thead>
                        <tr>
                          <th scope="col">Sản phẩm</th>
                          <th scope="col" class="number-heading">Số lượng</th>
                          <th scope="col" class="number-heading">Đơn giá</th>
                          <th scope="col" class="number-heading">Thành tiền</th>
                          <th scope="col">Bỏ dòng</th>
                        </tr>
                      </thead>
                      <tbody>
                        <tr v-for="(line, index) in form.lines" :key="line.key">
                          <td>
                            <a-form-item
                              :help="fieldError(index, 'productId')"
                              :validate-status="
                                fieldError(index, 'productId') ? 'error' : undefined
                              "
                            >
                              <ProductSelect
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
                              />
                            </a-form-item>
                            <small
                              v-if="
                                can('INVENTORY_VIEW') && inventory[line.productId] !== undefined
                              "
                              class="order-help"
                            >
                              Tồn tham khảo: {{ formatStockInteger(inventory[line.productId]!) }}
                            </small>
                          </td>
                          <td>
                            <a-form-item
                              :help="fieldError(index, 'quantity')"
                              :validate-status="fieldError(index, 'quantity') ? 'error' : undefined"
                            >
                              <a-input
                                v-model:value="line.quantity"
                                class="number-input"
                                inputmode="numeric"
                                :aria-label="'Số lượng dòng ' + (index + 1)"
                              />
                            </a-form-item>
                          </td>
                          <td>
                            <a-form-item
                              :help="fieldError(index, 'unitPrice')"
                              :validate-status="
                                fieldError(index, 'unitPrice') ? 'error' : undefined
                              "
                            >
                              <a-input
                                v-model:value="line.unitPrice"
                                class="number-input"
                                inputmode="numeric"
                                :aria-label="'Đơn giá dòng ' + (index + 1)"
                              />
                            </a-form-item>
                          </td>
                          <td class="line-total">
                            {{ formatStockInteger(lineTotal(line.quantity, line.unitPrice)) }}
                          </td>
                          <td class="line-remove">
                            <a-button
                              danger
                              size="small"
                              :disabled="saving || blocked"
                              :aria-label="'Bỏ dòng ' + (index + 1)"
                              @click="form.lines.splice(index, 1)"
                              >Bỏ dòng</a-button
                            >
                          </td>
                        </tr>
                      </tbody>
                    </table>
                  </div>
                  <a-button
                    class="add-line"
                    :disabled="saving || blocked || form.lines.length >= 1000"
                    @click="form.lines.push(newLine())"
                  >
                    <template #icon><PlusOutlined aria-hidden="true" /></template>
                    Thêm dòng
                  </a-button>
                  <a-alert
                    v-if="inventoryError"
                    type="warning"
                    :message="'Không tải được tồn tham khảo: ' + inventoryError"
                  />
                  <p v-if="can('INVENTORY_VIEW')" class="order-help inventory-help">
                    Tồn chỉ để tham khảo. Backend kiểm tra khi xác nhận.
                  </p>
                </section>
              </div>
              <aside class="order-section order-summary">
                <h2>{{ $t('sales.orderSummary') }}</h2>
                <div class="summary-subtotal">
                  <span>Tạm tính</span
                  ><strong>{{ formatStockInteger(totals.subtotal) }} VND</strong>
                </div>
                <a-form-item
                  label="Giảm giá toàn đơn (VND)"
                  html-for="sale-discount"
                  :help="fields.discountAmount"
                  :validate-status="fields.discountAmount ? 'error' : undefined"
                >
                  <a-input
                    id="sale-discount"
                    v-model:value="form.discountAmount"
                    class="number-input"
                    inputmode="numeric"
                  />
                </a-form-item>
                <div class="summary-total">
                  <span>Tổng dự kiến</span>
                  <strong>{{ formatStockInteger(totals.totalAmount) }} <small>VND</small></strong>
                </div>
              </aside>
            </div>
          </a-form>
          <template v-else-if="detail">
            <section class="order-section">
              <h2>{{ $t('sales.orderInformation') }}</h2>
              <dl class="order-detail-grid">
                <div>
                  <dt>Kho</dt>
                  <dd>{{ warehouseName(detail.warehouseId) }}</dd>
                </div>
                <div>
                  <dt>Ngày bán</dt>
                  <dd>{{ formatDate(detail.saleDate) }}</dd>
                </div>
                <div class="order-detail-wide">
                  <dt>Khách (thông tin lịch sử)</dt>
                  <dd>
                    {{
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
                    }}
                  </dd>
                </div>
                <div class="order-detail-wide">
                  <dt>Ghi chú</dt>
                  <dd>{{ detail.note ?? '—' }}</dd>
                </div>
              </dl>
            </section>
            <section class="order-section">
              <h2>{{ $t('sales.orderProducts') }}</h2>
              <BasicTable
                :columns="columns"
                :data-source="detail.lines"
                row-key="productId"
                :scroll="{ x: 1248 }"
                @reload="reload"
              >
                <template #bodyCell="{ column, record }">
                  <span
                    v-if="['quantity', 'unitPrice', 'lineTotal'].includes(String(column.key))"
                    class="detail-number"
                  >
                    {{ formatStockInteger(record[column.key]) }}
                  </span>
                  <a-tooltip v-else :title="record[column.dataIndex]">
                    <span class="detail-line-text">{{ record[column.dataIndex] ?? '—' }}</span>
                  </a-tooltip>
                </template>
              </BasicTable>
            </section>
            <section class="order-section order-settlement">
              <h2>{{ $t('sales.orderSettlement') }}</h2>
              <dl class="order-detail-grid">
                <div>
                  <dt>Tạm tính</dt>
                  <dd class="detail-number">{{ formatStockInteger(detail.subtotal) }} VND</dd>
                </div>
                <div>
                  <dt>Giảm giá</dt>
                  <dd class="detail-number">{{ formatStockInteger(detail.discountAmount) }} VND</dd>
                </div>
              </dl>
              <div class="order-settlement-content">
                <OrderPaymentPanel
                  v-if="mode === 'view'"
                  class="order-payment-panel"
                  :order="detail"
                  @updated="detail = $event"
                  @refresh-requested="load"
                />
                <SettlementDetails v-else :settlement="detail" />
              </div>
            </section>
            <section class="order-section">
              <h2>{{ $t('sales.orderAudit') }}</h2>
              <dl class="order-detail-grid">
                <div>
                  <dt>Người / thời gian tạo</dt>
                  <dd>{{ detail.createdBy }} · {{ formatDateTime(detail.createdAt) }}</dd>
                </div>
                <div>
                  <dt>Cập nhật</dt>
                  <dd>{{ formatDateTime(detail.updatedAt) }}</dd>
                </div>
                <div v-if="detail.confirmedAt">
                  <dt>Người / thời gian xác nhận</dt>
                  <dd>{{ detail.confirmedBy }} · {{ formatDateTime(detail.confirmedAt) }}</dd>
                </div>
                <div v-if="detail.cancelledAt">
                  <dt>Người / thời gian hủy</dt>
                  <dd>{{ detail.cancelledBy }} · {{ formatDateTime(detail.cancelledAt) }}</dd>
                </div>
                <div v-if="detail.cancellationReason" class="order-detail-wide">
                  <dt>Lý do hủy</dt>
                  <dd>{{ detail.cancellationReason }}</dd>
                </div>
                <div v-if="detail.goodsReturned !== undefined && detail.goodsReturned !== null">
                  <dt>Đã xác nhận thu hồi hàng</dt>
                  <dd>{{ detail.goodsReturned ? 'Có' : 'Không' }}</dd>
                </div>
              </dl>
            </section>
            <a-alert
              v-if="mode === 'confirm'"
              type="warning"
              show-icon
              message="Xác nhận sẽ xuất toàn bộ hàng và trừ tồn kho của tất cả dòng trong đơn."
            />
            <section v-if="mode === 'cancel'" class="order-section">
              <a-alert
                type="warning"
                show-icon
                :message="
                  detail.status === 'CONFIRMED'
                    ? 'Hủy sẽ cộng lại toàn bộ hàng vào kho. Không dùng thao tác này cho trả hàng một phần.'
                    : 'Hủy đơn nháp không thay đổi tồn kho.'
                "
              />
              <a-form-item
                label="Lý do hủy"
                required
                :help="fields.reason"
                :validate-status="fields.reason ? 'error' : undefined"
              >
                <a-textarea
                  v-model:value="reason"
                  :maxlength="2000"
                  :rows="3"
                  :disabled="saving || blocked"
                />
              </a-form-item>
              <a-form-item
                v-if="detail.status === 'CONFIRMED'"
                :help="fields.goodsReturned"
                :validate-status="fields.goodsReturned ? 'error' : undefined"
              >
                <a-checkbox v-model:checked="goodsReturned" :disabled="saving || blocked">
                  Tôi xác nhận đã thu hồi toàn bộ hàng hoặc hàng chưa được giao
                </a-checkbox>
              </a-form-item>
            </section>
          </template>
        </template>
      </div>
    </a-spin>
    <template #footer>
      <div class="order-dialog-footer">
        <a-button :disabled="saving" @click="emit('update:open', false)">Đóng</a-button>
        <a-button v-if="id" :disabled="saving || loading" @click="reload"
          >Tải lại chi tiết</a-button
        >
        <a-button
          v-if="mode !== 'view'"
          type="primary"
          :danger="mode === 'cancel'"
          :loading="saving"
          :disabled="loading || blocked || !allowed || !eligible"
          @click="submit"
        >
          {{
            mode === 'confirm' ? 'Xác nhận xuất hàng' : mode === 'cancel' ? 'Hủy đơn' : 'Lưu nháp'
          }}
        </a-button>
      </div>
    </template>
  </BasicModal>
</template>
<style scoped>
.order-dialog-body,
.order-editor-main {
  display: flex;
  flex-direction: column;
  gap: 16px;
  min-width: 0;
}
.order-identity {
  display: flex;
  align-items: center;
  gap: 12px;
  flex-wrap: wrap;
}
.order-detail-code {
  color: #61469c;
  font-weight: 600;
  overflow-wrap: anywhere;
}
.order-editor {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 300px;
  gap: 20px;
  align-items: start;
}
.order-section {
  min-width: 0;
  padding: 20px;
  border: 1px solid #e9e4f1;
  border-radius: 12px;
  background: #fff;
}
.order-section h2 {
  margin: 0 0 16px;
  color: #302640;
  font-size: 16px;
  line-height: 24px;
  font-weight: 600;
}
.order-section-heading {
  display: flex;
  justify-content: space-between;
  align-items: baseline;
  gap: 12px;
  flex-wrap: wrap;
}
.order-info-grid {
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
  gap: 0 16px;
}
.order-info-grid :deep(.ant-select),
.order-info-grid :deep(.ant-picker) {
  width: 100%;
  min-width: 0 !important;
}
.order-info-grid :deep(.ant-form-item) {
  margin-bottom: 16px;
}
.order-help {
  color: #757080;
  font-size: 13px;
  line-height: 20px;
  overflow-wrap: anywhere;
}
.retail-action {
  margin-top: 8px;
}
.order-lines-scroll {
  overflow-x: auto;
  max-width: 100%;
}
.order-lines-table {
  width: 100%;
  min-width: 900px;
  table-layout: fixed;
  border-collapse: collapse;
}
.line-product-col {
  width: auto;
}
.line-quantity-col {
  width: 130px;
}
.line-price-col {
  width: 170px;
}
.line-total-col {
  width: 218px;
}
.line-remove-col {
  width: 100px;
}
.order-lines-table th {
  padding: 12px 10px;
  background: #f8f6fc;
  color: #625b70;
  text-align: left;
  font-size: 13px;
  font-weight: 600;
  white-space: nowrap;
}
.order-lines-table td {
  padding: 14px 10px;
  vertical-align: top;
  border-bottom: 1px solid #f0edf5;
}
.order-lines-table :deep(.ant-form-item) {
  margin-bottom: 0;
}
.order-lines-table :deep(.ant-form-item-explain) {
  margin-top: 4px;
}
.order-lines-table small {
  display: block;
  margin-top: 6px;
}
.order-lines-table .number-heading,
.number-input,
.line-total {
  text-align: right;
  font-variant-numeric: tabular-nums;
}
.line-total {
  padding-top: 19px !important;
  white-space: nowrap;
  font-weight: 600;
}
.line-remove {
  text-align: center;
}
.add-line {
  margin-top: 16px;
}
.inventory-help {
  margin: 12px 0 0;
}
.order-products-section > :deep(.ant-alert) {
  margin-bottom: 12px;
}
.summary-subtotal {
  display: flex;
  flex-direction: column;
  gap: 8px;
  margin-bottom: 20px;
}
.summary-subtotal strong {
  align-self: flex-end;
  font-size: 16px;
  font-weight: 600;
  font-variant-numeric: tabular-nums;
}
.summary-total {
  display: flex;
  flex-direction: column;
  gap: 8px;
  border-top: 1px solid #e9e4f1;
  padding-top: 20px;
}
.summary-total strong {
  color: #7357cf;
  text-align: right;
  font-size: 24px;
  font-weight: 650;
  font-variant-numeric: tabular-nums;
  overflow-wrap: anywhere;
}
.summary-total small {
  font-size: 14px;
  font-weight: 500;
}
.order-detail-grid {
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
  gap: 18px 24px;
  margin: 0;
}
.order-detail-wide {
  grid-column: 1 / -1;
}
.order-detail-grid > div {
  min-width: 0;
}
.order-detail-grid dt {
  color: #757080;
  font-size: 13px;
}
.order-detail-grid dd {
  margin: 6px 0 0;
  white-space: pre-wrap;
  overflow-wrap: anywhere;
}
.detail-number {
  font-variant-numeric: tabular-nums;
  white-space: nowrap;
}
.detail-line-text {
  display: block;
  overflow: hidden;
  white-space: nowrap;
  text-overflow: ellipsis;
}
.order-settlement > .order-detail-grid {
  margin-bottom: 20px;
}
.order-settlement-content {
  min-width: 0;
  overflow-x: auto;
}
.order-settlement-content :deep(.ant-descriptions) {
  min-width: 620px;
}
.order-settlement-content :deep(.ant-descriptions-item-content) {
  font-variant-numeric: tabular-nums;
  white-space: nowrap;
}
.order-settlement-content :deep(.order-payment-panel > .ant-btn),
.order-settlement-content :deep(.order-payment-panel > a) {
  margin: 8px 8px 8px 0;
}
.order-dialog-footer {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  flex-wrap: wrap;
  gap: 8px;
}
.order-dialog-footer :deep(.ant-btn + .ant-btn) {
  margin-inline-start: 0;
}
:global(.sales-order-dialog .ant-modal) {
  top: 16px;
  max-width: calc(100vw - 24px);
  padding-bottom: 16px;
}
:global(.sales-order-dialog .ant-modal-content) {
  display: flex;
  flex-direction: column;
  max-height: calc(100dvh - 32px);
}
:global(.sales-order-dialog .ant-modal-header),
:global(.sales-order-dialog .ant-modal-footer) {
  flex-shrink: 0;
}
:global(.sales-order-dialog .ant-modal-body) {
  min-height: 0;
  overflow: auto;
  padding-block: 4px;
}
:global(.sales-order-dialog .ant-modal-footer) {
  margin-top: 16px;
}
@media (max-width: 1100px) {
  .order-editor {
    grid-template-columns: minmax(0, 1fr);
  }
}
@media (max-width: 650px) {
  .order-info-grid,
  .order-detail-grid {
    grid-template-columns: minmax(0, 1fr);
  }
  .order-section {
    padding: 14px;
  }
  .order-dialog-footer {
    justify-content: flex-start;
  }
  .order-dialog-footer :deep(.ant-btn) {
    height: auto;
    min-height: 32px;
    white-space: normal;
  }
  :global(.sales-order-dialog .ant-modal-content) {
    padding: 16px 12px;
  }
}
@media (max-height: 450px) {
  :global(.sales-order-dialog .ant-modal-content) {
    max-height: none;
  }
  :global(.sales-order-dialog .ant-modal-body) {
    overflow: visible;
  }
}
</style>
