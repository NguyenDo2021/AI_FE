<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { message } from 'ant-design-vue'
import { BasicModal, BasicTable } from '@/components'
import type { TableColumnsType } from 'ant-design-vue'
import {
  PlusOutlined,
  DeleteOutlined,
  SaveOutlined,
  CheckOutlined,
  ReloadOutlined,
  InfoCircleOutlined,
} from '@ant-design/icons-vue'
import ProductSelect from './ProductSelect.vue'
import ReceiptSummary from './ReceiptSummary.vue'
import {
  getReceipt,
  createReceipt,
  updateReceipt,
  confirmReceipt,
  cancelReceipt,
} from '@/api/stock/stock.api'
import { useWarehouseStore } from '@/stores/warehouse'
import { useStockStore } from '@/stores/stock'
import { useCatalogPermission } from '@/composables/useCatalogPermission'
import {
  formatStockInteger,
  receiptInput,
  validateReceipt,
  validStockInteger,
  stockError,
  stockFieldErrors,
} from '@/utils/stock'
import type { Receipt, ReceiptForm, ReceiptFormLine, ReceiptLine } from '@/types/stock'
import type { NormalizedApiError } from '@/utils/request'
const props = defineProps<{
  open: boolean
  id?: string
  mode: 'create' | 'edit' | 'view' | 'confirm' | 'cancel'
}>()
const emit = defineEmits<{ 'update:open': [value: boolean]; saved: [receipt: Receipt] }>()
const { t } = useI18n()
const { can } = useCatalogPermission()
const warehouses = useWarehouseStore()
const stock = useStockStore()
const detail = ref<Receipt>()
const loading = ref(false)
const saving = ref(false)
const blocked = ref(false)
const error = ref('')
const fields = ref<Record<string, string>>({})
const reason = ref('')
let lineSequence = 0
const newLine = () => ({
  key: String(++lineSequence),
  productId: '',
  quantity: '1',
  unitPrice: '0',
})
const emptyForm = (): ReceiptForm => ({
  warehouseId: warehouses.selectedId ?? '',
  receiptDate: new Date().toLocaleDateString('sv-SE'),
  supplierName: '',
  note: '',
  lines: [newLine()],
})
const form = ref<ReceiptForm>(emptyForm())
let generation = 0
const readOnly = computed(
  () => props.mode === 'view' || props.mode === 'confirm' || props.mode === 'cancel',
)
const allowed = computed(() =>
  can(
    `STOCK_RECEIPT_${{ create: 'CREATE', edit: 'UPDATE', view: 'VIEW', confirm: 'CONFIRM', cancel: 'CANCEL' }[props.mode]}`,
  ),
)
const eligible = computed(
  () =>
    props.mode === 'create' ||
    (!!detail.value &&
      (props.mode === 'view' ||
        (props.mode === 'cancel'
          ? detail.value.status !== 'CANCELLED'
          : detail.value.status === 'DRAFT'))),
)
const seeds = computed(
  () =>
    detail.value?.lines.map((line) => ({
      value: line.productId,
      label: `${line.productCode} — ${line.productName}`,
    })) ?? [],
)
const warehouseOptions = computed(() =>
  warehouses.warehouses.map((warehouse) => ({
    value: warehouse.id,
    label: `${warehouse.code} — ${warehouse.name}`,
    disabled: warehouse.status !== 1,
  })),
)
const warehouseName = (id: string): string =>
  warehouses.warehouses.find((warehouse) => warehouse.id === id)?.name ?? id
const estimate = computed(() =>
  form.value.lines.reduce(
    (sum, line) =>
      sum +
      (validStockInteger(line.quantity, true) && validStockInteger(line.unitPrice)
        ? BigInt(line.quantity) * BigInt(line.unitPrice)
        : 0n),
    0n,
  ),
)
const lineEstimate = (line: ReceiptFormLine): bigint | undefined =>
  validStockInteger(line.quantity, true) && validStockInteger(line.unitPrice)
    ? BigInt(line.quantity) * BigInt(line.unitPrice)
    : undefined
const title = computed(() =>
  t(
    props.mode === 'confirm'
      ? 'stock.confirmReceiptTitle'
      : props.mode === 'cancel'
        ? 'stock.cancelReceiptTitle'
        : `stock.${props.mode}`,
  ),
)
const lineColumns = computed<TableColumnsType<ReceiptLine>>(() =>
  ['productCode', 'productName', 'unit', 'quantity', 'unitPrice', 'lineTotal'].map((key) => ({
    title: t(`stock.${key}`),
    dataIndex: key,
    key,
    width: (
      {
        productCode: 160,
        productName: 240,
        unit: 90,
        quantity: 150,
        unitPrice: 200,
        lineTotal: 220,
      } as Record<string, number>
    )[key],
    ...(['productCode', 'productName'].includes(key) ? { ellipsis: true } : {}),
    ...(['quantity', 'unitPrice', 'lineTotal'].includes(key) ? { align: 'right' as const } : {}),
  })),
)
const addLine = (): void => {
  if (saving.value || loading.value || blocked.value || !allowed.value || !eligible.value) return
  form.value.lines.push(newLine())
}
const removeLine = (index: number): void => {
  if (saving.value || loading.value || blocked.value || !allowed.value || !eligible.value) return
  form.value.lines.splice(index, 1)
  // Preserve field errors on their original rows after an earlier row is removed.
  fields.value = Object.fromEntries(
    Object.entries(fields.value).flatMap(([key, value]) => {
      const match = /^lines(?:\[(\d+)\]|\.(\d+))\.(.+)$/.exec(key)
      if (!match) return [[key, value]]
      const row = Number(match[1] ?? match[2])
      return row === index ? [] : [[`lines[${row > index ? row - 1 : row}].${match[3]}`, value]]
    }),
  )
}
const load = async (): Promise<void> => {
  if (saving.value || !props.open) return
  const current = ++generation
  loading.value = true
  blocked.value = false
  error.value = ''
  fields.value = {}
  detail.value = undefined
  try {
    if (!props.id || !allowed.value) return
    const result = await getReceipt(props.id)
    if (current !== generation) return
    detail.value = result
    form.value = {
      warehouseId: result.warehouseId,
      receiptDate: result.receiptDate,
      supplierName: result.supplierName ?? '',
      note: result.note ?? '',
      lines: result.lines.map((line) => ({
        key: String(++lineSequence),
        productId: line.productId,
        quantity: String(line.quantity),
        unitPrice: String(line.unitPrice),
      })),
    }
  } catch (cause) {
    if (current === generation) error.value = stockError(cause, t)
  } finally {
    if (current === generation) loading.value = false
  }
}
watch(
  () => [props.open, props.id, props.mode] as const,
  () => {
    ++generation
    loading.value = false
    if (!props.open) return
    reason.value = ''
    error.value = ''
    fields.value = {}
    blocked.value = false
    detail.value = undefined
    form.value = emptyForm()
    if (props.id) void load()
  },
  { immediate: true },
)
watch(allowed, (value) => {
  if (value) return
  ++generation
  detail.value = undefined
  form.value = emptyForm()
  blocked.value = true
  loading.value = false
  if (!saving.value) emit('update:open', false)
})
onBeforeUnmount(() => ++generation)
const fieldError = (index: number, key: string): string | undefined =>
  fields.value[`lines[${index}].${key}`] ?? fields.value[`lines.${index}.${key}`]
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
  error.value = ''
  fields.value = {}
  if (!readOnly.value) {
    fields.value = validateReceipt(form.value, t)
    if (
      props.mode === 'create' &&
      !warehouses.warehouses.some((item) => item.id === form.value.warehouseId && item.status === 1)
    )
      fields.value.warehouseId = t('stock.selectWarehouse')
  }
  const trimmedReason = reason.value.trim()
  if (
    props.mode === 'cancel' &&
    ((detail.value?.status === 'CONFIRMED' && !trimmedReason) || trimmedReason.length > 2000)
  )
    fields.value.reason = t('stock.reasonValidation')
  if (Object.keys(fields.value).length) return
  saving.value = true
  const current = generation
  try {
    let result: Receipt
    if (props.mode === 'create')
      result = await createReceipt({
        ...receiptInput(form.value),
        warehouseId: form.value.warehouseId,
      })
    else {
      const original = detail.value
      if (!original) return
      if (props.mode === 'edit')
        result = await updateReceipt(original.id, {
          ...receiptInput(form.value),
          version: original.version,
        })
      else if (props.mode === 'confirm')
        result = await confirmReceipt(original.id, original.version)
      else result = await cancelReceipt(original.id, original.version, trimmedReason || undefined)
    }
    if (props.mode === 'confirm' || props.mode === 'cancel') stock.invalidate()
    if (current !== generation || !props.open) return
    detail.value = result
    message.success(t(`stock.${props.mode}Success`))
    emit('saved', result)
    emit('update:open', false)
  } catch (cause) {
    if (current !== generation || !props.open) return
    error.value = stockError(cause, t)
    fields.value = stockFieldErrors(cause)
    const apiError = cause as NormalizedApiError
    if (apiError.status === 409 || apiError.status === 403 || apiError.status === 404)
      blocked.value = true
  } finally {
    saving.value = false
  }
}
const close = (): void => {
  if (!saving.value) emit('update:open', false)
}
</script>
<template>
  <a-config-provider :theme="{ token: { colorPrimary: '#7357cf', borderRadius: 8 } }">
    <BasicModal
      :open="open"
      :title="title"
      :width="1000"
      wrap-class-name="stock-receipt-dialog"
      :confirm-loading="saving"
      @update:open="close"
      @confirm="submit"
    >
      <a-spin :spinning="loading">
        <div class="receipt-dialog-body" :aria-busy="loading">
          <a-alert v-if="error" type="error" :message="error" show-icon />
          <a-alert v-if="!allowed" type="warning" :message="t('stock.forbidden')" show-icon />
          <a-alert
            v-else-if="!eligible && !loading && detail"
            type="warning"
            :message="t('stock.statusChanged')"
            show-icon
          />
          <template v-if="allowed && (!id || detail)">
            <ReceiptSummary
              v-if="detail"
              :key="detail.id"
              :receipt="detail"
              :information="readOnly"
            />
            <a-form
              v-if="!readOnly"
              :model="form"
              layout="vertical"
              :disabled="saving || loading || blocked || !eligible"
              @finish="submit"
            >
              <div class="receipt-grid">
                <a-form-item
                  :label="t('stock.warehouse')"
                  required
                  :help="fields.warehouseId"
                  :validate-status="fields.warehouseId ? 'error' : undefined"
                >
                  <a-select
                    v-if="mode === 'create'"
                    v-model:value="form.warehouseId"
                    :options="warehouseOptions"
                    :aria-label="t('stock.warehouse')"
                  />
                  <a-input
                    v-else
                    :value="warehouseName(form.warehouseId)"
                    :aria-label="t('stock.warehouse')"
                    disabled
                  />
                </a-form-item>
                <a-form-item
                  :label="t('stock.receiptDate')"
                  required
                  :help="fields.receiptDate"
                  :validate-status="fields.receiptDate ? 'error' : undefined"
                >
                  <a-date-picker
                    v-model:value="form.receiptDate"
                    value-format="YYYY-MM-DD"
                    format="DD/MM/YYYY"
                    :placeholder="t('stock.receiptChooseDate')"
                    :aria-label="t('stock.receiptDate')"
                  />
                </a-form-item>
                <a-form-item
                  :label="t('stock.supplierName')"
                  :help="fields.supplierName"
                  :validate-status="fields.supplierName ? 'error' : undefined"
                >
                  <a-input
                    v-model:value="form.supplierName"
                    :aria-label="t('stock.supplierName')"
                  />
                </a-form-item>
                <a-form-item
                  :label="t('stock.note')"
                  :help="fields.note"
                  :validate-status="fields.note ? 'error' : undefined"
                >
                  <a-textarea
                    v-model:value="form.note"
                    :aria-label="t('stock.note')"
                    :auto-size="{ minRows: 2, maxRows: 5 }"
                  />
                </a-form-item>
              </div>
              <div class="receipt-section-heading">
                <h2>{{ t('stock.receiptProducts') }}</h2>
                <a-button :disabled="saving || loading || blocked || !eligible" @click="addLine">
                  <template #icon><PlusOutlined aria-hidden="true" /></template
                  >{{ t('stock.addLine') }}
                </a-button>
              </div>
              <a-alert v-if="fields.lines" type="error" :message="fields.lines" show-icon />
              <div class="receipt-entry-scroll">
                <table class="receipt-entry-table" :aria-label="t('stock.receiptProducts')">
                  <thead>
                    <tr>
                      <th>{{ t('stock.product') }} <span class="receipt-required">*</span></th>
                      <th>{{ t('stock.quantity') }} <span class="receipt-required">*</span></th>
                      <th>{{ t('stock.unitPrice') }} <span class="receipt-required">*</span></th>
                      <th class="receipt-number">{{ t('stock.lineTotal') }}</th>
                      <th>
                        <span class="receipt-sr-only">{{ t('stock.actions') }}</span>
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr
                      v-for="(line, index) in form.lines"
                      :key="line.key"
                      class="receipt-entry-row"
                    >
                      <td>
                        <a-form-item
                          :label="t('stock.product')"
                          required
                          :help="fieldError(index, 'productId')"
                          :validate-status="fieldError(index, 'productId') ? 'error' : undefined"
                        >
                          <ProductSelect
                            :value="line.productId"
                            :seeds="seeds"
                            active-only
                            :disabled="saving || loading || blocked || !eligible"
                            @update:value="(value) => (line.productId = value ?? '')"
                          />
                        </a-form-item>
                      </td>
                      <td>
                        <a-form-item
                          :label="t('stock.quantity')"
                          required
                          :help="fieldError(index, 'quantity')"
                          :validate-status="fieldError(index, 'quantity') ? 'error' : undefined"
                        >
                          <a-input
                            v-model:value="line.quantity"
                            inputmode="numeric"
                            class="receipt-number"
                            :aria-label="`${t('stock.quantity')} ${index + 1}`"
                          />
                        </a-form-item>
                      </td>
                      <td>
                        <a-form-item
                          :label="t('stock.unitPrice')"
                          required
                          :help="fieldError(index, 'unitPrice')"
                          :validate-status="fieldError(index, 'unitPrice') ? 'error' : undefined"
                        >
                          <a-input
                            v-model:value="line.unitPrice"
                            inputmode="numeric"
                            class="receipt-number"
                            :aria-label="`${t('stock.unitPrice')} ${index + 1}`"
                          />
                        </a-form-item>
                      </td>
                      <td class="receipt-line-total">
                        <span class="receipt-mobile-label">{{ t('stock.lineTotal') }}</span>
                        <span>{{
                          lineEstimate(line) === undefined
                            ? '—'
                            : `${formatStockInteger(lineEstimate(line)!)} ₫`
                        }}</span>
                        <small v-if="fieldError(index, 'lineTotal')" class="receipt-required">{{
                          fieldError(index, 'lineTotal')
                        }}</small>
                      </td>
                      <td class="receipt-remove">
                        <a-tooltip :title="t('stock.removeLine')"
                          ><a-button
                            type="text"
                            danger
                            :aria-label="`${t('stock.removeLine')} ${index + 1}`"
                            :disabled="saving || loading || blocked || !eligible"
                            @click="removeLine(index)"
                            ><template #icon
                              ><DeleteOutlined aria-hidden="true" /></template></a-button
                        ></a-tooltip>
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>
              <div class="receipt-estimate">
                <div>
                  <span>{{ t('stock.receiptEstimatedTotal') }}</span
                  ><strong>{{ formatStockInteger(estimate) }} ₫</strong>
                </div>
                <span class="receipt-draft-hint"
                  ><InfoCircleOutlined aria-hidden="true" />{{
                    t('stock.draftInventoryHint')
                  }}</span
                >
              </div>
            </a-form>
            <template v-else-if="detail">
              <BasicTable
                :columns="lineColumns"
                :data-source="detail.lines"
                row-key="productId"
                :scroll="{ x: 1060 }"
                class="receipt-detail-table"
                @reload="load"
              >
                <template #toolbar
                  ><h2>{{ t('stock.receiptProducts') }}</h2></template
                >
                <template #bodyCell="{ column, record }">
                  <template
                    v-if="['quantity', 'unitPrice', 'lineTotal'].includes(String(column.key))"
                    >{{ formatStockInteger(record[column.key])
                    }}{{ column.key === 'quantity' ? '' : ' ₫' }}</template
                  >
                  <a-tooltip
                    v-else-if="column.key === 'productCode' || column.key === 'productName'"
                    :title="record[column.key]"
                    ><span class="receipt-ellipsis">{{
                      record[column.key] || '—'
                    }}</span></a-tooltip
                  >
                </template>
              </BasicTable>
              <a-alert
                v-if="mode === 'confirm'"
                type="info"
                :message="t('stock.confirmWarning')"
                show-icon
              />
              <template v-if="mode === 'cancel'">
                <a-alert
                  :type="detail.status === 'CONFIRMED' ? 'warning' : 'info'"
                  :message="
                    t(
                      detail.status === 'CONFIRMED'
                        ? 'stock.receiptCancelConfirmedWarning'
                        : 'stock.cancelDraftWarning',
                    )
                  "
                  show-icon
                />
                <a-form layout="vertical">
                  <a-form-item
                    :label="t('stock.reason')"
                    :required="detail.status === 'CONFIRMED'"
                    :help="fields.reason"
                    :validate-status="fields.reason ? 'error' : undefined"
                  >
                    <a-textarea
                      v-model:value="reason"
                      :aria-label="t('stock.reason')"
                      :maxlength="2000"
                      :disabled="saving || blocked"
                      :auto-size="{ minRows: 3, maxRows: 6 }"
                      show-count
                    />
                  </a-form-item>
                </a-form>
              </template>
            </template>
          </template>
        </div>
      </a-spin>
      <template #footer>
        <div class="receipt-dialog-footer">
          <a-button :disabled="saving" @click="close">{{
            t(mode === 'confirm' || mode === 'cancel' ? 'stock.receiptBack' : 'stock.receiptClose')
          }}</a-button>
          <a-button v-if="id" :disabled="saving || loading" @click="load"
            ><template #icon><ReloadOutlined aria-hidden="true" /></template
            >{{ t('stock.reloadDetail') }}</a-button
          >
          <a-button
            v-if="mode !== 'view'"
            type="primary"
            :danger="mode === 'cancel'"
            :loading="saving"
            :disabled="loading || blocked || !allowed || !eligible"
            @click="submit"
          >
            <template #icon
              ><CheckOutlined v-if="mode === 'confirm'" aria-hidden="true" /><DeleteOutlined
                v-else-if="mode === 'cancel'"
                aria-hidden="true" /><SaveOutlined v-else aria-hidden="true"
            /></template>
            {{
              t(
                mode === 'confirm'
                  ? 'stock.confirm'
                  : mode === 'cancel'
                    ? 'stock.cancel'
                    : 'stock.saveDraft',
              )
            }}
          </a-button>
        </div>
      </template>
    </BasicModal>
  </a-config-provider>
</template>

<style scoped>
.receipt-dialog-body {
  display: flex;
  flex-direction: column;
  gap: 16px;
  min-width: 0;
  min-height: 80px;
}
.receipt-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 0 16px;
}
.receipt-grid :deep(.ant-picker),
.receipt-grid :deep(.ant-select) {
  width: 100%;
  min-width: 0;
}
.receipt-grid :deep(.ant-form-item) {
  margin-bottom: 16px;
  min-width: 0;
}
.receipt-section-heading {
  display: flex;
  align-items: center;
  justify-content: space-between;
  flex-wrap: wrap;
  gap: 8px;
  margin: 8px 0 12px;
}
h2 {
  margin: 0;
  font-size: 16px;
  line-height: 24px;
  color: #302640;
  font-weight: 600;
}
.receipt-entry-scroll {
  min-width: 0;
  overflow-x: auto;
  border: 1px solid #eee8f5;
  border-radius: 8px;
}
.receipt-entry-table {
  width: 100%;
  min-width: 760px;
  border-collapse: collapse;
  table-layout: fixed;
}
.receipt-entry-table th {
  padding: 12px;
  text-align: left;
  background: #f8f6fc;
  font-size: 13px;
  font-weight: 500;
}
.receipt-entry-table th:first-child {
  width: 29%;
}
.receipt-entry-table th:nth-child(2) {
  width: 15%;
}
.receipt-entry-table th:nth-child(3) {
  width: 20%;
}
.receipt-entry-table th:nth-child(4) {
  width: 28%;
  text-align: right;
}
.receipt-entry-table th:last-child {
  width: 8%;
}
.receipt-entry-table td {
  padding: 12px 8px;
  vertical-align: top;
  border-top: 1px solid #f0edf5;
}
.receipt-entry-table :deep(.ant-form-item) {
  margin: 0;
}
.receipt-entry-table :deep(.ant-form-item-label) {
  position: absolute;
  width: 1px;
  height: 1px;
  padding: 0;
  overflow: hidden;
  clip-path: inset(50%);
  white-space: nowrap;
}
.receipt-entry-table :deep(.ant-form-item-explain) {
  overflow-wrap: anywhere;
}
.receipt-entry-table :deep(.ant-select) {
  min-width: 0 !important;
}
.receipt-entry-table .receipt-line-total {
  padding-top: 17px;
  text-align: right;
  font-variant-numeric: tabular-nums;
  overflow-wrap: anywhere;
}
.receipt-line-total small {
  display: block;
}
.receipt-number {
  text-align: right;
  font-variant-numeric: tabular-nums;
}
.receipt-remove {
  text-align: center;
}
.receipt-remove :deep(.ant-btn) {
  width: 36px;
  height: 36px;
  padding: 0;
}
.receipt-required {
  color: #ff4d4f;
}
.receipt-mobile-label {
  display: none;
}
.receipt-sr-only {
  position: absolute;
  width: 1px;
  height: 1px;
  overflow: hidden;
  clip-path: inset(50%);
}
.receipt-estimate {
  display: flex;
  align-items: center;
  justify-content: space-between;
  flex-wrap: wrap;
  gap: 16px;
  margin-top: 16px;
  padding: 16px;
  border-radius: 10px;
  background: #f5f0ff;
  color: #625b70;
}
.receipt-estimate > div {
  min-width: 0;
}
.receipt-estimate strong {
  display: block;
  margin-top: 4px;
  color: #7357cf;
  font-size: 24px;
  font-weight: 650;
  font-variant-numeric: tabular-nums;
  overflow-wrap: anywhere;
}
.receipt-draft-hint {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px 12px;
  border: 1px solid #d6e4ff;
  border-radius: 8px;
  color: #2f54b3;
  background: #f0f5ff;
  font-size: 13px;
}
.receipt-detail-table {
  min-width: 0;
}
.receipt-detail-table :deep(.basic-table__toolbar) {
  margin-bottom: 10px;
}
.receipt-detail-table :deep(.ant-table-thead > tr > th) {
  background: #f8f6fc;
  font-size: 13px;
}
.receipt-detail-table :deep(.ant-table-tbody > tr > td) {
  font-variant-numeric: tabular-nums;
}
.receipt-ellipsis {
  display: block;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.receipt-dialog-footer {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  flex-wrap: wrap;
  gap: 8px;
}
.receipt-dialog-footer :deep(.ant-btn + .ant-btn) {
  margin-inline-start: 0;
}
:global(.stock-receipt-dialog .ant-modal) {
  top: 20px;
  max-width: calc(100vw - 24px);
  padding-bottom: 20px;
}
:global(.stock-receipt-dialog .ant-modal-content) {
  display: flex;
  flex-direction: column;
  max-height: calc(100vh - 40px);
  max-height: calc(100dvh - 40px);
  padding: 0;
  border-radius: 12px;
}
:global(.stock-receipt-dialog .ant-modal-header) {
  flex-shrink: 0;
  margin: 0;
  padding: 20px 52px 16px 24px;
  border-radius: 12px 12px 0 0;
}
:global(.stock-receipt-dialog .ant-modal-body) {
  min-height: 0;
  padding: 4px 24px 20px;
  overflow-y: auto;
  overscroll-behavior: contain;
}
:global(.stock-receipt-dialog .ant-modal-footer) {
  flex-shrink: 0;
  margin: 0;
  padding: 14px 24px;
  border-top: 1px solid #eee8f5;
}
@media (max-width: 700px) {
  .receipt-grid {
    grid-template-columns: minmax(0, 1fr);
  }
  .receipt-entry-scroll {
    overflow: visible;
    border: 0;
  }
  .receipt-entry-table,
  .receipt-entry-table tbody {
    display: block;
    min-width: 0;
  }
  .receipt-entry-table thead {
    display: none;
  }
  .receipt-entry-row {
    display: grid;
    grid-template-columns: minmax(0, 1fr);
    margin-bottom: 12px;
    padding: 12px;
    border: 1px solid #eee8f5;
    border-radius: 10px;
  }
  .receipt-entry-table td {
    display: block;
    min-width: 0;
    padding: 0 0 12px;
    border: 0;
  }
  .receipt-entry-table :deep(.ant-form-item-label) {
    position: static;
    width: auto;
    height: auto;
    padding-bottom: 6px;
    clip-path: none;
    white-space: normal;
  }
  .receipt-entry-table .receipt-line-total {
    display: flex;
    flex-wrap: wrap;
    justify-content: space-between;
    gap: 8px;
    padding-top: 0;
  }
  .receipt-mobile-label {
    display: inline;
    color: #797184;
  }
  .receipt-entry-table td.receipt-remove {
    padding-bottom: 0;
    text-align: right;
  }
  .receipt-remove :deep(.ant-btn) {
    width: 44px;
    height: 44px;
  }
  .receipt-estimate strong {
    font-size: 22px;
  }
  .receipt-estimate {
    align-items: flex-start;
  }
}
@media (max-width: 575px) {
  :global(.stock-receipt-dialog .ant-modal) {
    top: 8px;
    max-width: calc(100vw - 16px);
    margin: 0 auto;
    padding-bottom: 8px;
  }
  :global(.stock-receipt-dialog .ant-modal-content) {
    max-height: calc(100vh - 16px);
    max-height: calc(100dvh - 16px);
  }
  :global(.stock-receipt-dialog .ant-modal-header) {
    padding: 16px 44px 16px 12px;
  }
  :global(.stock-receipt-dialog .ant-modal-body) {
    padding: 0 12px 16px;
  }
  :global(.stock-receipt-dialog .ant-modal-footer) {
    padding: 12px;
    padding-bottom: max(12px, env(safe-area-inset-bottom));
  }
  .receipt-dialog-footer :deep(.ant-btn) {
    flex: 1 1 auto;
    min-height: 44px;
    height: auto;
    padding-block: 8px;
    white-space: normal;
  }
  .receipt-dialog-body :deep(.ant-input),
  .receipt-dialog-body :deep(.ant-picker),
  .receipt-dialog-body :deep(.ant-select-selector),
  .receipt-section-heading :deep(.ant-btn) {
    min-height: 44px;
  }
}
@media (max-height: 500px) {
  :global(.stock-receipt-dialog .ant-modal) {
    top: 8px;
    padding-bottom: 8px;
  }
  :global(.stock-receipt-dialog .ant-modal-content) {
    max-height: calc(100vh - 16px);
    max-height: calc(100dvh - 16px);
  }
  :global(.stock-receipt-dialog .ant-modal-header),
  :global(.stock-receipt-dialog .ant-modal-footer) {
    padding-block: 10px;
  }
}
</style>
