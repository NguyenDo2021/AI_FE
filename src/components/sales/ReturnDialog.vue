<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import { message, Modal } from 'ant-design-vue'
import { BasicTable } from '@/components'
import ReturnRefundDialog from './ReturnRefundDialog.vue'
import SettlementAmountSummary from './SettlementAmountSummary.vue'
import ReturnableOrderSelect from './ReturnableOrderSelect.vue'
import { usePaymentScope } from '@/composables/usePaymentScope'
import { useStockStore } from '@/stores/stock'
import { usePaymentsStore } from '@/stores/payments'
import {
  getReturn,
  getReturnableLines,
  createReturn,
  updateReturn,
  confirmReturn,
  cancelReturn,
} from '@/api/sales/returns.api'
import {
  todayLocal,
  validateReturn,
  returnInput,
  returnError,
  isReturnQuoteChanged,
  validReason,
  estimateReturn,
} from '@/utils/returns'
import { formatStockInteger as fmt, validStockInteger, stockFieldErrors } from '@/utils/stock'
import { formatDate, formatDateTime } from '@/utils/date'
import type {
  SalesReturn,
  ReturnableLine,
  ReturnForm,
  ReturnQuoteChanged,
  ReturnableOrder,
} from '@/types/returns'
import type { NormalizedApiError } from '@/utils/request'
const props = defineProps<{
  open: boolean
  id?: string
  salesOrderId?: string
  salesOrderCode?: string
  warehouseId?: string
}>()
const emit = defineEmits<{ 'update:open': [value: boolean]; saved: [value: SalesReturn] }>()
const { can, contextKey, inScope, refreshAccess, warehouses } = usePaymentScope()
const stock = useStockStore(),
  payments = usePaymentsStore()
const detail = ref<SalesReturn>(),
  limits = ref<ReturnableLine[]>([])
const quote = ref<ReturnQuoteChanged>()
const editing = ref(false),
  loading = ref(false),
  saving = ref(false),
  blocked = ref(false)
const received = ref(false),
  cancelMode = ref(false),
  reason = ref(''),
  error = ref('')
const fields = ref<Record<string, string>>({})
const sourceId = ref('')
const sourceOrder = ref<ReturnableOrder>()
const limitsSourceId = ref('')
let limitsSequence = 0
let limitsController: AbortController | undefined
let sourceChoiceSequence = 0
let sourceConfirmation: ReturnType<typeof Modal.confirm> | undefined
const sourceLabel = computed(() =>
  sourceOrder.value?.id === sourceId.value
    ? sourceOrder.value.code
    : props.salesOrderId === sourceId.value
      ? (props.salesOrderCode ?? sourceId.value)
      : sourceId.value,
)
const cancelSourceRequests = (): void => {
  ++limitsSequence
  limitsController?.abort()
  limitsController = undefined
  ++sourceChoiceSequence
  sourceConfirmation?.destroy()
  sourceConfirmation = undefined
}

const empty = (): ReturnForm => ({ returnDate: todayLocal(), reason: '', note: '', lines: [] })
const form = ref<ReturnForm>(empty())
let sequence = 0
const available = computed(
  () =>
    can('SALES_RETURN_VIEW') &&
    (!props.warehouseId || inScope(props.warehouseId)) &&
    (!detail.value || inScope(detail.value.warehouseId)),
)
const editable = computed(() =>
  !detail.value
    ? can('SALES_RETURN_CREATE')
    : detail.value.status === 'DRAFT' && can('SALES_RETURN_UPDATE'),
)
const columns = [
  ['productCode', 'Mã sản phẩm'],
  ['productName', 'Sản phẩm'],
  ['unit', 'Đơn vị'],
  ['soldQuantity', 'Đã bán'],
  ['returnedQuantity', 'Đã trả'],
  ['returnableQuantity', 'Còn được trả'],
  ['quantity', 'Số cây muốn trả'],
  ['estimate', 'Giá trị dự kiến'],
].map(([key, title]) => ({
  key,
  dataIndex: key,
  title,
  width:
    key === 'productName'
      ? 240
      : ['estimate', 'returnAmount', 'allocatedDiscountAmount', 'netLineAmount'].includes(key!)
        ? 220
        : 150,
  ...([
    'soldQuantity',
    'returnedQuantity',
    'returnableQuantity',
    'quantity',
    'estimate',
    'allocatedDiscountAmount',
    'netLineAmount',
    'returnAmount',
  ].includes(key!)
    ? { align: 'right' as const }
    : {}),
}))
const detailColumns = [
  ['productCode', 'Mã'],
  ['productName', 'Sản phẩm'],
  ['unit', 'Đơn vị'],
  ['quantity', 'Số lượng'],
  ['soldQuantity', 'Lượng bán'],
  ['allocatedDiscountAmount', 'Giảm giá phân bổ'],
  ['netLineAmount', 'Giá trị dòng sau giảm'],
  ['returnAmount', 'Giá trị trả'],
].map(([key, title]) => ({
  key,
  dataIndex: key,
  title,
  width:
    key === 'productName'
      ? 240
      : ['estimate', 'returnAmount', 'allocatedDiscountAmount', 'netLineAmount'].includes(key!)
        ? 220
        : 150,
  ...([
    'soldQuantity',
    'returnedQuantity',
    'returnableQuantity',
    'quantity',
    'estimate',
    'allocatedDiscountAmount',
    'netLineAmount',
    'returnAmount',
  ].includes(key!)
    ? { align: 'right' as const }
    : {}),
}))
const quantity = (id: string): string =>
  form.value.lines.find((line) => line.productId === id)?.quantity ?? ''
const setQuantity = (id: string, value: string): void => {
  const line = form.value.lines.find((line) => line.productId === id)
  if (line) line.quantity = value
  else form.value.lines.push({ productId: id, quantity: value })
}
const estimate = (line: ReturnableLine): string =>
  validStockInteger(quantity(line.productId), true)
    ? fmt(estimateReturn(line, BigInt(quantity(line.productId))))
    : '—'
const loadLimits = async (): Promise<void> => {
  if (!props.open || !available.value || !sourceId.value) return
  limitsController?.abort()
  const request = new AbortController()
  limitsController = request
  const current = sequence,
    currentLimits = ++limitsSequence,
    id = sourceId.value
  try {
    const result = await getReturnableLines(id, request.signal)
    if (
      current !== sequence ||
      currentLimits !== limitsSequence ||
      id !== sourceId.value ||
      request.signal.aborted ||
      !props.open
    )
      return
    limits.value = result
    limitsSourceId.value = id
  } catch (cause) {
    if (current !== sequence || currentLimits !== limitsSequence || request.signal.aborted) return
    throw cause
  } finally {
    if (currentLimits === limitsSequence) limitsController = undefined
  }
}
const deny = async (): Promise<void> => {
  ++sequence
  cancelSourceRequests()
  sourceOrder.value = undefined
  sourceId.value = ''
  limitsSourceId.value = ''
  detail.value = undefined
  limits.value = []
  form.value = empty()
  quote.value = undefined
  emit('update:open', false)
  await refreshAccess()
}
const load = async (): Promise<void> => {
  const current = ++sequence
  loading.value = true
  error.value = ''
  blocked.value = true
  try {
    if (!props.open || !available.value) return
    const returnId = props.id ?? detail.value?.id
    if (returnId) {
      const result = await getReturn(returnId)
      if (current !== sequence) return
      if (!inScope(result.warehouseId)) {
        await deny()
        return
      }
      detail.value = result
      sourceId.value = result.salesOrderId
      form.value = {
        returnDate: result.returnDate,
        reason: result.reason,
        note: result.note ?? '',
        lines: result.lines.map((line) => ({
          productId: line.productId,
          quantity: String(line.quantity),
        })),
      }
      editing.value = false
    } else {
      sourceId.value = props.salesOrderId ?? ''
      editing.value = true
    }
    quote.value = undefined
    received.value = false
    cancelMode.value = false
    fields.value = {}
    blocked.value = false
    if (!returnId && sourceId.value) await loadLimits()
  } catch (cause) {
    if (current !== sequence) return
    error.value = returnError(cause)
    if ((cause as NormalizedApiError).status === 403) await deny()
  } finally {
    if (current === sequence) loading.value = false
  }
}
const selectSource = (order: ReturnableOrder): void => {
  if (
    !props.open ||
    detail.value ||
    props.salesOrderId ||
    saving.value ||
    blocked.value ||
    !available.value ||
    !editable.value ||
    order.id === sourceId.value
  )
    return
  const choice = ++sourceChoiceSequence,
    current = sequence
  sourceConfirmation?.destroy()
  sourceConfirmation = undefined
  const commit = async (): Promise<void> => {
    if (
      choice !== sourceChoiceSequence ||
      current !== sequence ||
      !props.open ||
      detail.value ||
      saving.value ||
      !available.value ||
      !editable.value
    )
      return
    sourceConfirmation = undefined
    ++sequence
    const selectedSequence = sequence
    limitsController?.abort()
    limits.value = []
    limitsSourceId.value = ''
    form.value.lines = []
    sourceId.value = order.id
    sourceOrder.value = order
    fields.value = {}
    error.value = ''
    loading.value = true
    try {
      await loadLimits()
    } catch (cause) {
      if (selectedSequence !== sequence) return
      error.value = returnError(cause)
      if ((cause as NormalizedApiError).status === 403) await deny()
    } finally {
      if (selectedSequence === sequence) loading.value = false
    }
  }
  const hasInput =
    form.value.lines.some((line) => line.quantity !== '') ||
    !!form.value.reason ||
    !!form.value.note ||
    form.value.returnDate !== todayLocal()
  if (sourceId.value && hasInput) {
    sourceConfirmation = Modal.confirm({
      title: 'Đổi đơn bán hàng và bỏ các dòng trả đang nhập?',
      content:
        'Chỉ sau khi đồng ý, đơn nguồn mới được đổi và các dòng hàng cũ được bỏ. Ngày trả, lý do và ghi chú được giữ lại.',
      onOk: commit,
      onCancel: () => {
        if (choice === sourceChoiceSequence) sourceConfirmation = undefined
      },
    })
  } else void commit()
}
const startEdit = async (): Promise<void> => {
  if (!editable.value || blocked.value || saving.value) return
  const current = sequence
  editing.value = true
  received.value = false
  cancelMode.value = false
  loading.value = true
  try {
    await loadLimits()
  } catch (cause) {
    if (current !== sequence) return
    error.value = returnError(cause)
    if ((cause as NormalizedApiError).status === 403) await deny()
  } finally {
    if (current === sequence) loading.value = false
  }
}
const refreshLimits = async (): Promise<void> => {
  const current = sequence
  loading.value = true
  try {
    await loadLimits()
  } catch (cause) {
    if (current !== sequence) return
    error.value = returnError(cause)
    if ((cause as NormalizedApiError).status === 403) await deny()
  } finally {
    if (current === sequence) loading.value = false
  }
}
const reload = (): void => {
  Modal.confirm({ title: 'Tải lại sẽ thay bản nhập bằng dữ liệu đã lưu. Tiếp tục?', onOk: load })
}
const notify = (result: SalesReturn): void => {
  emit('saved', result)
  if (result.status === 'CONFIRMED') {
    stock.invalidate()
    ++payments.revision
  }
}
const save = async (): Promise<void> => {
  if (
    !props.open ||
    saving.value ||
    loading.value ||
    blocked.value ||
    !available.value ||
    !editable.value
  )
    return
  fields.value = validateReturn(form.value, limits.value)
  if (!sourceId.value) fields.value.salesOrderId = 'Chọn đơn bán hàng.'
  else if (limitsSourceId.value !== sourceId.value)
    fields.value.salesOrderId = 'Cần tải được dòng hàng của đơn đã chọn trước khi lưu.'
  if (Object.keys(fields.value).length) return
  const current = sequence
  saving.value = true
  error.value = ''
  try {
    const input = returnInput(form.value)
    const result = detail.value
      ? await updateReturn(detail.value.id, input, detail.value.version)
      : await createReturn(sourceId.value, input)
    if (current !== sequence) return
    if (!inScope(result.warehouseId)) {
      await deny()
      return
    }
    detail.value = result
    editing.value = false
    quote.value = undefined
    received.value = false
    message.success('Đã lưu phiếu trả nháp. Chưa nhập lại tồn.')
    emit('saved', result)
  } catch (cause) {
    if (current !== sequence) return
    await handleError(cause)
    const apiError = cause as NormalizedApiError
    if (!detail.value && (!apiError.status || apiError.status === 408 || apiError.status >= 500)) {
      blocked.value = true
      error.value +=
        ' Chưa xác định kết quả tạo nháp. Kiểm tra danh sách phiếu trước khi tạo lại để tránh trùng.'
    }
  } finally {
    if (current === sequence) saving.value = false
  }
}
const handleError = async (cause: unknown): Promise<void> => {
  const apiError = cause as NormalizedApiError
  error.value = returnError(cause)
  fields.value = stockFieldErrors(cause)
  if (apiError.code === 'RETURN_QUOTE_CHANGED' && isReturnQuoteChanged(apiError.details)) {
    quote.value = apiError.details
    received.value = false
    if (detail.value && BigInt(detail.value.version) !== BigInt(apiError.details.version))
      blocked.value = true
  }
  if (apiError.code === 'VERSION_CONFLICT') blocked.value = true
  if (apiError.code === 'RETURN_EXCEEDS_QUANTITY') {
    try {
      await loadLimits()
    } catch {
      error.value += ' Không tải được hạn mức; dùng nút tải lại hạn mức.'
    }
    if (apiError.details && typeof apiError.details === 'object') {
      const data = apiError.details as Record<string, unknown>
      if (typeof data.productId === 'string')
        fields.value[data.productId] = 'Dòng này vượt lượng còn được trả.'
    }
  }
  if (apiError.status === 403) await deny()
}
const act = async (kind: 'confirm' | 'cancel'): Promise<void> => {
  const original = detail.value
  if (
    !props.open ||
    !original ||
    original.status !== 'DRAFT' ||
    editing.value ||
    blocked.value ||
    quote.value ||
    saving.value ||
    !available.value ||
    !can(kind === 'confirm' ? 'SALES_RETURN_CONFIRM' : 'SALES_RETURN_CANCEL')
  )
    return
  if (kind === 'confirm' && !received.value) {
    error.value = 'Cần xác nhận đã nhận đủ hàng còn bán được.'
    return
  }
  if (kind === 'cancel' && !validReason(reason.value)) {
    fields.value.reason = 'Lý do bắt buộc, tối đa 2000 ký tự.'
    return
  }
  const current = sequence
  saving.value = true
  error.value = ''
  try {
    const result =
      kind === 'confirm'
        ? await confirmReturn(original.id, original.version)
        : await cancelReturn(original.id, original.version, reason.value)
    if (current !== sequence) return
    detail.value = result
    received.value = false
    cancelMode.value = false
    notify(result)
    message.success(
      result.status === 'CONFIRMED'
        ? 'Đã xác nhận trả hàng và nhập lại tồn. Chưa tạo phiếu hoàn tiền.'
        : 'Đã hủy phiếu trả nháp.',
    )
  } catch (cause) {
    if (current !== sequence) return
    await handleError(cause)
    const apiError = cause as NormalizedApiError
    if (
      (!apiError.status || apiError.status === 408 || apiError.status >= 500) &&
      available.value
    ) {
      blocked.value = true
      try {
        const latest = await getReturn(original.id)
        if (current !== sequence) return
        if (!inScope(latest.warehouseId)) {
          await deny()
          return
        }
        detail.value = latest
        notify(latest)
        error.value +=
          ' Đã kiểm tra trạng thái: ' + latest.status + '. Tải lại trước thao tác tiếp.'
      } catch {
        if (current === sequence)
          error.value += ' Kết quả chưa xác định. Tải lại chi tiết để kiểm tra.'
      }
    }
  } finally {
    if (current === sequence) saving.value = false
  }
}
watch(
  () => [props.open, props.id, props.salesOrderId],
  () => {
    ++sequence
    cancelSourceRequests()
    sourceId.value = ''
    sourceOrder.value = undefined
    limitsSourceId.value = ''
    detail.value = undefined
    limits.value = []
    quote.value = undefined
    form.value = empty()
    received.value = false
    cancelMode.value = false
    reason.value = ''
    fields.value = {}
    editing.value = !props.id
    saving.value = false
    error.value = ''
    if (props.open) void load()
  },
  { immediate: true },
)
watch(
  contextKey,
  () => {
    ++sequence
    cancelSourceRequests()
    sourceId.value = ''
    sourceOrder.value = undefined
    limitsSourceId.value = ''
    detail.value = undefined
    limits.value = []
    quote.value = undefined
    form.value = empty()
    error.value = ''
    fields.value = {}
    emit('update:open', false)
  },
  { flush: 'sync' },
)
onBeforeUnmount(() => {
  ++sequence
  cancelSourceRequests()
})
</script>
<template>
  <ReturnRefundDialog
    :open="open"
    :title="editing ? (detail ? 'Sửa phiếu trả nháp' : 'Tạo phiếu trả hàng') : 'Chi tiết phiếu trả'"
    :width="1150"
    :saving="saving"
    @update:open="emit('update:open', false)"
  >
    <a-spin :spinning="loading">
      <a-alert v-if="error" type="error" :message="error" show-icon />
      <a-alert
        type="info"
        show-icon
        message="Chỉ nhận hàng còn bán được. Xác nhận nhập lại kho gốc và giảm giá trị phải trả; hoàn tiền là thao tác riêng."
      />
      <template v-if="available">
        <template v-if="detail">
          <SettlementAmountSummary
            :code="detail.code"
            :label="
              detail.status === 'DRAFT'
                ? 'Giá trị trả dự kiến'
                : detail.status === 'CONFIRMED'
                  ? 'Giá trị trả đã xác nhận'
                  : 'Giá trị phiếu trả đã hủy'
            "
            :amount="detail.totalAmount"
          >
            <template #status
              ><a-tag
                :color="
                  detail.status === 'DRAFT'
                    ? 'orange'
                    : detail.status === 'CONFIRMED'
                      ? 'green'
                      : 'red'
                "
                >{{ $t('sales.' + detail.status) }}</a-tag
              ></template
            >
          </SettlementAmountSummary>
          <dl v-if="!editing" class="rr-info">
            <div>
              <dt>Đơn bán hàng</dt>
              <dd>{{ sourceLabel || detail.salesOrderId }}</dd>
            </div>
            <div>
              <dt>Ngày trả</dt>
              <dd>{{ formatDate(detail.returnDate) }}</dd>
            </div>
            <div>
              <dt>Khách hàng</dt>
              <dd>{{ detail.customerId ?? 'Khách lẻ' }}</dd>
            </div>
            <div>
              <dt>Kho</dt>
              <dd>
                {{
                  warehouses.warehouses.find((w) => w.id === detail?.warehouseId)?.name ??
                  detail.warehouseId
                }}
              </dd>
            </div>
            <div>
              <dt>Lý do</dt>
              <dd>{{ detail.reason }}</dd>
            </div>
            <div>
              <dt>Ghi chú</dt>
              <dd>{{ detail.note ?? '—' }}</dd>
            </div>
          </dl>
          <details class="rr-identifiers">
            <summary>Thông tin định danh</summary>
            <dl class="rr-info">
              <div>
                <dt>ID phiếu</dt>
                <dd>{{ detail.id }}</dd>
              </div>
              <div>
                <dt>Phiên bản</dt>
                <dd>{{ String(detail.version) }}</dd>
              </div>
              <div>
                <dt>ID đơn nguồn</dt>
                <dd>{{ detail.salesOrderId }}</dd>
              </div>
              <div>
                <dt>ID kho / khách</dt>
                <dd>{{ detail.warehouseId }} / {{ detail.customerId ?? 'Khách lẻ' }}</dd>
              </div>
              <div>
                <dt>Người / thời gian tạo</dt>
                <dd>{{ detail.createdBy }} / {{ formatDateTime(detail.createdAt) }}</dd>
              </div>
              <div>
                <dt>Cập nhật</dt>
                <dd>{{ detail.updatedBy }} / {{ formatDateTime(detail.updatedAt) }}</dd>
              </div>
              <div v-if="detail.confirmedAt">
                <dt>Xác nhận</dt>
                <dd>{{ detail.confirmedBy }} / {{ formatDateTime(detail.confirmedAt) }}</dd>
              </div>
              <div v-if="detail.cancelledAt">
                <dt>Hủy</dt>
                <dd>
                  {{ detail.cancelledBy }} / {{ formatDateTime(detail.cancelledAt) }} /
                  {{ detail.cancellationReason }}
                </dd>
              </div>
            </dl>
          </details>
        </template>
        <template v-if="quote && detail">
          <a-alert
            type="warning"
            :message="
              'Chưa xác nhận, tồn chưa đổi. Nháp cũ: ' +
              fmt(detail.totalAmount) +
              ' VND; báo giá mới: ' +
              fmt(quote.quote.totalAmount) +
              ' VND. Xem xét từng dòng rồi lưu lại nháp.'
            "
          />
          <p v-for="line in quote.quote.lines" :key="line.productId">
            {{ line.productCode }} · {{ line.productName }}: nháp cũ
            {{
              detail.lines.find((old) => old.productId === line.productId)?.returnAmount ===
              undefined
                ? '—'
                : fmt(detail.lines.find((old) => old.productId === line.productId)!.returnAmount)
            }}
            VND → báo giá mới {{ fmt(line.returnAmount) }} VND
          </p>
          <BasicTable
            class="rr-table"
            :columns="detailColumns"
            :data-source="quote.quote.lines"
            row-key="productId"
            :scroll="{ x: 1850 }"
          >
            <template #bodyCell="{ column, record }"
              ><template
                v-if="
                  [
                    'quantity',
                    'soldQuantity',
                    'returnAmount',
                    'allocatedDiscountAmount',
                    'netLineAmount',
                  ].includes(String(column.key))
                "
                >{{ fmt(record[column.key]) }}</template
              ></template
            >
          </BasicTable>
          <a-button v-if="editable && !blocked" :disabled="saving || loading" @click="startEdit"
            >Xem xét và sửa / lưu lại nháp</a-button
          >
          <p v-else>Cần SALES_RETURN_UPDATE để lưu lại nháp trước khi xác nhận.</p>
        </template>

        <template v-if="editing">
          <a-form
            layout="vertical"
            class="rr-form"
            :disabled="saving || loading || blocked || !editable"
          >
            <a-form-item
              label="Đơn bán hàng"
              html-for="return-source"
              required
              :help="fields.salesOrderId"
              :validate-status="fields.salesOrderId ? 'error' : undefined"
            >
              <ReturnableOrderSelect
                v-if="open && !detail && !salesOrderId"
                :value="sourceId || undefined"
                :selected="sourceOrder"
                :disabled="saving || blocked || !editable"
                @selected="selectSource"
                @denied="deny"
              />
              <a-input
                v-else
                id="return-source"
                :value="sourceLabel"
                readonly
                :title="sourceLabel"
              />
            </a-form-item>
            <a-form-item
              label="Ngày trả"
              html-for="return-date"
              required
              :help="fields.returnDate"
              :validate-status="fields.returnDate ? 'error' : undefined"
              ><a-date-picker
                id="return-date"
                v-model:value="form.returnDate"
                value-format="YYYY-MM-DD"
                format="DD/MM/YYYY"
            /></a-form-item>
            <a-form-item label="Khách hàng"
              ><a-input
                :value="
                  sourceOrder?.customerName ?? (detail ? (detail.customerId ?? 'Khách lẻ') : '—')
                "
                readonly
            /></a-form-item>
            <a-form-item label="Kho"
              ><a-input
                :value="
                  sourceOrder?.warehouseName ??
                  warehouses.warehouses.find((w) => w.id === (detail?.warehouseId ?? warehouseId))
                    ?.name ??
                  detail?.warehouseId ??
                  warehouseId ??
                  '—'
                "
                readonly
            /></a-form-item>
            <dl v-if="sourceOrder" class="rr-info rr-wide">
              <div>
                <dt>Ngày bán</dt>
                <dd>{{ formatDate(sourceOrder.saleDate) }}</dd>
              </div>
              <div>
                <dt>Tổng đơn gốc</dt>
                <dd>{{ fmt(sourceOrder.totalAmount) }} VND</dd>
              </div>
            </dl>
            <a-form-item
              label="Lý do"
              html-for="return-reason"
              required
              :help="fields.reason"
              :validate-status="fields.reason ? 'error' : undefined"
              ><a-textarea
                id="return-reason"
                v-model:value="form.reason"
                :maxlength="2000"
                :rows="2"
                show-count
            /></a-form-item>
            <a-form-item
              label="Ghi chú"
              html-for="return-note"
              :help="fields.note"
              :validate-status="fields.note ? 'error' : undefined"
              ><a-textarea
                id="return-note"
                v-model:value="form.note"
                :maxlength="2000"
                :rows="2"
                show-count
                placeholder="Nhập ghi chú (nếu có)…"
            /></a-form-item>
            <div class="rr-wide rr-stack">
              <a-alert
                v-for="(text, key) in fields"
                :key="key"
                type="error"
                :message="String(key) + ': ' + text"
                show-icon
              />
              <h3 class="rr-section-title">Danh sách sản phẩm trả</h3>
              <BasicTable
                class="rr-table"
                :columns="columns"
                :data-source="limits"
                row-key="productId"
                :scroll="{ x: 1450 }"
              >
                <template #bodyCell="{ column, record }">
                  <template v-if="column.key === 'quantity'"
                    ><a-input
                      class="rr-quantity"
                      :aria-label="'Số cây muốn trả: ' + record.productName"
                      :value="quantity(record.productId)"
                      inputmode="numeric"
                      :disabled="
                        saving || loading || blocked || BigInt(record.returnableQuantity) <= 0n
                      "
                      @update:value="setQuantity(record.productId, $event)"
                    /><small class="rr-field-error">{{
                      fields[record.productId] ??
                      fields[
                        'lines[' +
                          form.lines.findIndex((line) => line.productId === record.productId) +
                          '].quantity'
                      ] ??
                      fields[
                        'lines.' +
                          form.lines.findIndex((line) => line.productId === record.productId) +
                          '.quantity'
                      ]
                    }}</small></template
                  >

                  <span v-else-if="column.key === 'estimate'" class="rr-money"
                    >{{ estimate(record) }} VND</span
                  >
                  <template
                    v-else-if="
                      ['soldQuantity', 'returnedQuantity', 'returnableQuantity'].includes(
                        String(column.key),
                      )
                    "
                    >{{ fmt(record[column.key]) }}</template
                  >
                  <a-tooltip v-else :title="record[column.dataIndex]"
                    ><span class="rr-text">{{ record[column.dataIndex] }}</span></a-tooltip
                  >
                </template>
              </BasicTable>
              <div class="rr-line-toolbar">
                <p class="rr-help">
                  Nháp không giữ chỗ số lượng. Giá trị dự kiến tính từ đơn gốc; backend kiểm tra lại
                  khi xác nhận.
                </p>
                <a-button :disabled="saving || loading" @click="refreshLimits"
                  >Cập nhật hạn mức, giữ bản nhập</a-button
                >
              </div>
            </div>
          </a-form>
        </template>
        <template v-else-if="detail">
          <h3 class="rr-section-title">Danh sách sản phẩm</h3>
          <BasicTable
            class="rr-table"
            :columns="detailColumns"
            :data-source="detail.lines"
            row-key="productId"
            :scroll="{ x: 1850 }"
          >
            <template #bodyCell="{ column, record }">
              <span
                v-if="
                  [
                    'quantity',
                    'soldQuantity',
                    'returnAmount',
                    'allocatedDiscountAmount',
                    'netLineAmount',
                  ].includes(String(column.key))
                "
                :class="{ 'rr-money': column.key === 'returnAmount' }"
                >{{ fmt(record[column.key])
                }}{{
                  ['returnAmount', 'allocatedDiscountAmount', 'netLineAmount'].includes(
                    String(column.key),
                  )
                    ? ' VND'
                    : ''
                }}</span
              >
              <a-tooltip v-else :title="record[column.dataIndex]"
                ><span class="rr-text">{{ record[column.dataIndex] }}</span></a-tooltip
              >
            </template>
          </BasicTable>
        </template>
        <template v-if="detail?.status === 'DRAFT' && !editing && !quote && !blocked">
          <a-checkbox
            v-if="can('SALES_RETURN_CONFIRM')"
            v-model:checked="received"
            :disabled="saving"
            >Tôi xác nhận đã nhận đủ số hàng còn bán được vào kho.</a-checkbox
          >
          <a-form-item
            v-if="cancelMode"
            label="Lý do hủy nháp"
            required
            :help="fields.reason"
            :validate-status="fields.reason ? 'error' : undefined"
            ><a-textarea
              v-model:value="reason"
              :maxlength="2000"
              :rows="3"
              show-count
              :disabled="saving"
          /></a-form-item>
        </template>
        <a-alert
          v-if="detail?.status === 'CONFIRMED'"
          type="info"
          show-icon
          message="Phiếu đã xác nhận không sửa / hủy đảo. Chưa hỗ trợ điều chỉnh phiếu trả đã xác nhận."
        />
      </template>
      <a-empty
        v-else-if="!loading && !error"
        description="Không có dữ liệu trong phạm vi được phép."
      />
    </a-spin>
    <template #footer>
      <a-button :disabled="saving" @click="emit('update:open', false)">Đóng</a-button>
      <a-button :disabled="saving || loading" @click="reload">Tải lại chi tiết</a-button>
      <a-button
        v-if="editing && editable"
        type="primary"
        :loading="saving"
        :disabled="blocked || loading"
        @click="save"
        >Lưu phiếu trả nháp</a-button
      >
      <template v-if="detail?.status === 'DRAFT' && !editing && !blocked">
        <a-button v-if="editable && !quote" :disabled="saving || loading" @click="startEdit"
          >Sửa nháp</a-button
        >
        <a-button
          v-if="can('SALES_RETURN_CONFIRM') && !quote && !cancelMode"
          type="primary"
          :loading="saving"
          :disabled="!received || loading"
          @click="act('confirm')"
          >Xác nhận nhận hàng</a-button
        >
        <a-button
          v-if="can('SALES_RETURN_CANCEL') && !quote"
          danger
          :disabled="saving || loading"
          @click="cancelMode ? act('cancel') : (cancelMode = true)"
          >{{ cancelMode ? 'Xác nhận hủy nháp' : 'Hủy nháp' }}</a-button
        >
      </template>
    </template>
  </ReturnRefundDialog>
</template>
