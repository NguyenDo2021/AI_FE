<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { message } from 'ant-design-vue'
import { BasicModal } from '@/components'
import ProductSelect from './ProductSelect.vue'
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
import { formatDate, formatDateTime } from '@/utils/date'
import type { Receipt, ReceiptForm } from '@/types/stock'
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
  () =>
    props.mode === 'view' ||
    props.mode === 'confirm' ||
    props.mode === 'cancel' ||
    (!!detail.value && detail.value.status !== 'DRAFT'),
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
const lineColumns = computed(() =>
  ['productCode', 'productName', 'unit', 'quantity', 'unitPrice', 'lineTotal'].map(
    (key, index) => ({
      title: t(`stock.${key}`),
      dataIndex: key,
      key,
      width: [160, 240, 90, 170, 190, 210][index],
      align: ['quantity', 'unitPrice', 'lineTotal'].includes(key)
        ? ('right' as const)
        : ('left' as const),
    }),
  ),
)
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
  <BasicModal
    :open="open"
    :title="t(`stock.${mode}`)"
    :width="1080"
    :style="{ top: 'max(12px, 5dvh)', maxWidth: 'calc(100vw - 24px)' }"
    :confirm-loading="saving"
    @update:open="close"
    @confirm="submit"
  >
    <div class="receipt-dialog-body">
      <a-spin :spinning="loading">
        <a-alert v-if="error" type="error" :message="error" show-icon />
        <a-alert v-if="!allowed" type="warning" :message="t('stock.forbidden')" />
        <a-alert
          v-else-if="!eligible && !loading && detail"
          type="warning"
          :message="t('stock.statusChanged')"
        />
        <template v-if="allowed && (!id || detail)">
          <div v-if="detail" class="receipt-summary">
            <div class="receipt-summary-code">
              <span>{{ t('stock.code') }}</span>
              <strong>{{ detail.code }}</strong>
            </div>
            <a-tag
              :color="
                detail.status === 'CONFIRMED'
                  ? 'success'
                  : detail.status === 'CANCELLED'
                    ? 'error'
                    : 'default'
              "
              >{{ t(`stock.${detail.status}`) }}</a-tag
            >
            <div class="receipt-summary-total">
              <span>{{ t('stock.totalAmount') }}</span>
              <strong>{{ formatStockInteger(detail.totalAmount) }} ₫</strong>
            </div>
          </div>
          <a-form
            v-if="!readOnly"
            :model="form"
            layout="vertical"
            :disabled="saving || loading || blocked || !eligible"
            @finish="submit"
          >
            <section class="receipt-section">
              <h3>Thông tin phiếu</h3>
              <div class="receipt-grid">
                <a-form-item
                  :label="t('stock.warehouse')"
                  html-for="receipt-warehouse"
                  required
                  :help="fields.warehouseId"
                  :validate-status="fields.warehouseId ? 'error' : undefined"
                >
                  <a-select
                    v-if="mode === 'create'"
                    id="receipt-warehouse"
                    v-model:value="form.warehouseId"
                    :options="warehouseOptions"
                    :placeholder="t('stock.warehouse')"
                  />
                  <a-input
                    v-else
                    id="receipt-warehouse"
                    :value="warehouseName(form.warehouseId)"
                    disabled
                  />
                </a-form-item>
                <a-form-item
                  :label="t('stock.receiptDate')"
                  html-for="receipt-date"
                  required
                  :help="fields.receiptDate"
                  :validate-status="fields.receiptDate ? 'error' : undefined"
                >
                  <a-date-picker
                    id="receipt-date"
                    v-model:value="form.receiptDate"
                    value-format="YYYY-MM-DD"
                    format="DD/MM/YYYY"
                    style="width: 100%"
                  />
                </a-form-item>
                <a-form-item
                  :label="t('stock.supplierName')"
                  html-for="receipt-supplier"
                  :help="fields.supplierName"
                >
                  <a-input id="receipt-supplier" v-model:value="form.supplierName" />
                </a-form-item>
                <a-form-item :label="t('stock.note')" html-for="receipt-note" :help="fields.note">
                  <a-textarea id="receipt-note" v-model:value="form.note" :rows="2" />
                </a-form-item>
              </div>
            </section>
            <section class="receipt-section">
              <div class="receipt-section-heading">
                <h3>
                  Danh sách sản phẩm <span>({{ form.lines.length }})</span>
                </h3>
                <a-button @click="form.lines.push(newLine())">+ {{ t('stock.addLine') }}</a-button>
              </div>
              <a-alert v-if="fields.lines" type="error" :message="fields.lines" />
              <div
                class="receipt-lines-scroll"
                tabindex="0"
                aria-label="Danh sách sản phẩm, cuộn ngang để xem các trường"
              >
                <table class="receipt-lines-table">
                  <thead>
                    <tr>
                      <th>#</th>
                      <th>{{ t('stock.product') }}</th>
                      <th class="receipt-number">{{ t('stock.quantity') }}</th>
                      <th class="receipt-number">{{ t('stock.unitPrice') }} (VND)</th>
                      <th>{{ t('stock.actions') }}</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr v-for="(line, index) in form.lines" :key="line.key ?? index">
                      <td class="receipt-line-index">{{ index + 1 }}</td>
                      <td>
                        <a-form-item
                          required
                          :help="fieldError(index, 'productId')"
                          :validate-status="fieldError(index, 'productId') ? 'error' : undefined"
                        >
                          <ProductSelect
                            :value="line.productId"
                            :seeds="seeds"
                            active-only
                            :disabled="saving || blocked || !eligible"
                            @update:value="(value) => (line.productId = value ?? '')"
                          />
                        </a-form-item>
                      </td>
                      <td>
                        <a-form-item
                          required
                          :help="fieldError(index, 'quantity')"
                          :validate-status="fieldError(index, 'quantity') ? 'error' : undefined"
                        >
                          <a-input
                            v-model:value="line.quantity"
                            inputmode="numeric"
                            class="receipt-number-input"
                            :aria-label="`${t('stock.quantity')} ${index + 1}`"
                          />
                        </a-form-item>
                      </td>
                      <td>
                        <a-form-item
                          required
                          :help="fieldError(index, 'unitPrice')"
                          :validate-status="fieldError(index, 'unitPrice') ? 'error' : undefined"
                        >
                          <a-input
                            v-model:value="line.unitPrice"
                            inputmode="numeric"
                            class="receipt-number-input"
                            :aria-label="`${t('stock.unitPrice')} ${index + 1}`"
                          />
                        </a-form-item>
                      </td>
                      <td>
                        <a-button
                          danger
                          :aria-label="`${t('stock.removeLine')} ${index + 1}`"
                          @click="form.lines.splice(index, 1)"
                          >{{ t('stock.removeLine') }}</a-button
                        >
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>
              <div class="receipt-estimate">
                <span>{{ t('stock.estimatedTotal') }}</span
                ><strong>{{ formatStockInteger(estimate) }} ₫</strong>
              </div>
            </section>
          </a-form>
          <template v-else-if="detail">
            <section class="receipt-section">
              <h3>Thông tin phiếu</h3>
              <dl class="receipt-detail-grid">
                <div>
                  <dt>{{ t('stock.warehouse') }}</dt>
                  <dd>{{ warehouseName(detail.warehouseId) }}</dd>
                </div>
                <div>
                  <dt>{{ t('stock.receiptDate') }}</dt>
                  <dd>{{ formatDate(detail.receiptDate) }}</dd>
                </div>
                <div>
                  <dt>{{ t('stock.supplierName') }}</dt>
                  <dd>{{ detail.supplierName || '—' }}</dd>
                </div>
                <div>
                  <dt>{{ t('stock.note') }}</dt>
                  <dd>{{ detail.note || '—' }}</dd>
                </div>
              </dl>
            </section>
            <section class="receipt-section">
              <h3>
                Danh sách sản phẩm <span>({{ detail.lines.length }})</span>
              </h3>
              <a-table
                class="receipt-detail-lines"
                :columns="lineColumns"
                :data-source="detail.lines"
                row-key="productId"
                :pagination="false"
                :scroll="{ x: 1060 }"
                size="middle"
              >
                <template #bodyCell="{ column, record }">
                  <span
                    v-if="['quantity', 'unitPrice', 'lineTotal'].includes(String(column.key))"
                    class="receipt-number"
                    >{{ formatStockInteger(record[column.key])
                    }}{{ column.key === 'quantity' ? '' : ' ₫' }}</span
                  >
                  <span v-else class="receipt-snapshot-text">{{ record[column.key] }}</span>
                </template>
              </a-table>
              <div class="receipt-estimate">
                <span>{{ t('stock.totalAmount') }}</span
                ><strong>{{ formatStockInteger(detail.totalAmount) }} ₫</strong>
              </div>
            </section>
            <section class="receipt-section">
              <h3>Lịch sử phiếu</h3>
              <dl class="receipt-detail-grid">
                <div>
                  <dt>{{ t('stock.createdBy') }}</dt>
                  <dd>{{ detail.createdBy }}</dd>
                </div>
                <div>
                  <dt>{{ t('stock.createdAt') }}</dt>
                  <dd>{{ formatDateTime(detail.createdAt) }}</dd>
                </div>
                <div v-if="detail.confirmedAt">
                  <dt>{{ t('stock.confirmedAt') }}</dt>
                  <dd>
                    {{ formatDateTime(detail.confirmedAt) }} / {{ detail.confirmedBy || '—' }}
                  </dd>
                </div>
                <div v-if="detail.cancelledAt">
                  <dt>{{ t('stock.cancelledAt') }}</dt>
                  <dd>
                    {{ formatDateTime(detail.cancelledAt) }} / {{ detail.cancelledBy || '—' }}
                  </dd>
                </div>
                <div v-if="detail.cancellationReason" class="receipt-detail-wide">
                  <dt>{{ t('stock.reason') }}</dt>
                  <dd>{{ detail.cancellationReason }}</dd>
                </div>
              </dl>
            </section>
            <a-alert
              v-if="mode === 'confirm'"
              type="warning"
              :message="t('stock.confirmWarning')"
              show-icon
            />
            <template v-if="mode === 'cancel'">
              <a-alert
                type="warning"
                show-icon
                :message="
                  t(
                    detail.status === 'CONFIRMED'
                      ? 'stock.cancelConfirmedWarning'
                      : 'stock.cancelDraftWarning',
                  )
                "
                :description="
                  detail.status === 'CONFIRMED'
                    ? 'Hệ thống có thể từ chối hủy nếu không đủ tồn kho.'
                    : undefined
                "
              />
              <a-form-item
                :label="t('stock.reason')"
                html-for="receipt-cancel-reason"
                :required="detail.status === 'CONFIRMED'"
                :help="fields.reason"
                :validate-status="fields.reason ? 'error' : undefined"
              >
                <a-textarea
                  id="receipt-cancel-reason"
                  v-model:value="reason"
                  :maxlength="2000"
                  :rows="3"
                  :disabled="saving || blocked"
                  show-count
                />
              </a-form-item>
            </template>
          </template>
        </template>
      </a-spin>
    </div>
    <template #footer>
      <div class="receipt-dialog-footer">
        <a-button :disabled="saving" @click="close">{{
          mode === 'view' ? 'Đóng' : t('common.cancel')
        }}</a-button>
        <a-button v-if="id" :disabled="saving || loading" @click="load">{{
          t('stock.reloadDetail')
        }}</a-button>
        <a-button
          v-if="mode !== 'view'"
          type="primary"
          :danger="mode === 'cancel'"
          :loading="saving"
          :disabled="loading || blocked || !allowed || !eligible"
          @click="submit"
          >{{
            t(
              mode === 'confirm'
                ? 'stock.confirm'
                : mode === 'cancel'
                  ? 'stock.cancel'
                  : 'common.save',
            )
          }}</a-button
        >
      </div>
    </template>
  </BasicModal>
</template>
<style scoped>
.receipt-dialog-body {
  max-height: max(80px, calc(100dvh - 230px));
  overflow-y: auto;
  overflow-x: hidden;
  padding-inline-end: 8px;
}
.receipt-summary {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 16px;
  padding: 16px;
  margin-bottom: 20px;
  border: 1px solid #e9e4f1;
  border-radius: 10px;
  background: #f8f6fc;
}
.receipt-summary-code {
  flex: 1;
  min-width: 0;
}
.receipt-summary span,
.receipt-summary strong {
  display: block;
}
.receipt-summary-code strong {
  overflow-wrap: anywhere;
  margin-top: 4px;
}
.receipt-summary-total {
  text-align: right;
  max-width: 100%;
}
.receipt-summary-total strong {
  margin-top: 4px;
  font-size: 18px;
  font-variant-numeric: tabular-nums;
  overflow-wrap: anywhere;
}
.receipt-summary-code > span,
.receipt-summary-total > span,
dt {
  color: #757080;
  font-size: 13px;
}
.receipt-section {
  margin-bottom: 20px;
}
h3 {
  margin: 0 0 16px;
  color: #302640;
  font-size: 16px;
  font-weight: 600;
}
h3 span {
  color: #757080;
  font-size: 13px;
  font-weight: 400;
}
.receipt-section-heading {
  display: flex;
  align-items: center;
  justify-content: space-between;
  flex-wrap: wrap;
  gap: 12px;
  margin-bottom: 16px;
}
.receipt-section-heading h3 {
  margin: 0;
}
.receipt-grid,
.receipt-detail-grid {
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
  gap: 0 16px;
}
.receipt-grid :deep(.ant-select) {
  width: 100%;
}
.receipt-detail-grid {
  margin: 0;
  gap: 16px 24px;
}
.receipt-detail-grid > div {
  min-width: 0;
}
.receipt-detail-wide {
  grid-column: 1 / -1;
}
dd {
  margin: 6px 0 0;
  white-space: pre-wrap;
  overflow-wrap: anywhere;
}
.receipt-lines-scroll {
  overflow-x: auto;
  border: 1px solid #e9e4f1;
  border-radius: 8px;
}
.receipt-lines-table {
  width: 100%;
  min-width: 760px;
  border-collapse: collapse;
  table-layout: fixed;
}
.receipt-lines-table th {
  background: #f8f6fc;
  color: #625b70;
  font-size: 13px;
  font-weight: 600;
  text-align: left;
}
.receipt-lines-table th,
.receipt-lines-table td {
  padding: 12px 10px;
  border-bottom: 1px solid #f0edf5;
  vertical-align: top;
}
.receipt-lines-table th:first-child {
  width: 40px;
}
.receipt-lines-table th:nth-child(2) {
  width: 34%;
}
.receipt-lines-table th:nth-child(3) {
  width: 20%;
}
.receipt-lines-table th:nth-child(4) {
  width: 24%;
}
.receipt-lines-table th:last-child {
  width: 100px;
}
.receipt-lines-table :deep(.ant-form-item) {
  margin-bottom: 0;
}
.receipt-line-index {
  color: #757080;
  line-height: 32px;
}
.receipt-number-input,
.receipt-lines-table th.receipt-number {
  text-align: right;
  font-variant-numeric: tabular-nums;
}
.receipt-number {
  font-variant-numeric: tabular-nums;
  overflow-wrap: anywhere;
}
.receipt-snapshot-text {
  overflow-wrap: anywhere;
  white-space: pre-wrap;
}
.receipt-detail-lines :deep(.ant-table-thead > tr > th) {
  background: #f8f6fc;
  color: #625b70;
  font-size: 13px;
}
.receipt-estimate {
  display: flex;
  align-items: baseline;
  justify-content: flex-end;
  flex-wrap: wrap;
  gap: 8px 20px;
  padding: 16px;
  margin-top: 12px;
  border-radius: 8px;
  background: #f8f6fc;
}
.receipt-estimate strong {
  font-size: 20px;
  font-variant-numeric: tabular-nums;
  overflow-wrap: anywhere;
  max-width: 100%;
}
.receipt-dialog-footer {
  display: flex;
  justify-content: flex-end;
  align-items: center;
  flex-wrap: wrap;
  gap: 8px;
}
:deep(.ant-alert) {
  margin-bottom: 16px;
}
@media (max-width: 650px) {
  .receipt-grid,
  .receipt-detail-grid {
    grid-template-columns: minmax(0, 1fr);
  }
  .receipt-summary-total {
    flex-basis: 100%;
    text-align: left;
  }
  .receipt-dialog-body {
    max-height: max(80px, calc(100dvh - 270px));
  }
}
</style>
