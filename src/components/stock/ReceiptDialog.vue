<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { message } from 'ant-design-vue'
import { BasicModal, BasicTable } from '@/components'
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
import { formatDateTime } from '@/utils/date'
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
const lineColumns = computed(() =>
  ['productCode', 'productName', 'unit', 'quantity', 'unitPrice', 'lineTotal'].map((key) => ({
    title: t(`stock.${key}`),
    dataIndex: key,
    key,
  })),
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
    :width="1000"
    :confirm-loading="saving"
    @update:open="close"
    @confirm="submit"
  >
    <a-spin :spinning="loading">
      <a-alert v-if="error" type="error" :message="error" show-icon />
      <a-alert v-if="!allowed" type="warning" :message="t('stock.forbidden')" />
      <a-alert
        v-else-if="!eligible && !loading && detail"
        type="warning"
        :message="t('stock.statusChanged')"
      />
      <template v-if="allowed && (!id || detail)">
        <a-descriptions v-if="detail" bordered :column="2">
          <a-descriptions-item :label="t('stock.code')">{{ detail.code }}</a-descriptions-item>
          <a-descriptions-item :label="t('stock.status')">{{
            t(`stock.${detail.status}`)
          }}</a-descriptions-item>
          <a-descriptions-item :label="t('stock.warehouse')">{{
            warehouseName(detail.warehouseId)
          }}</a-descriptions-item>
          <a-descriptions-item :label="t('stock.totalAmount')">{{
            formatStockInteger(detail.totalAmount)
          }}</a-descriptions-item>
        </a-descriptions>
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
              ><a-select
                v-if="mode === 'create'"
                v-model:value="form.warehouseId"
                :options="warehouseOptions" /><a-input
                v-else
                :value="warehouseName(form.warehouseId)"
                disabled
            /></a-form-item>
            <a-form-item
              :label="t('stock.receiptDate')"
              required
              :help="fields.receiptDate"
              :validate-status="fields.receiptDate ? 'error' : undefined"
              ><a-date-picker
                v-model:value="form.receiptDate"
                value-format="YYYY-MM-DD"
                style="width: 100%"
            /></a-form-item>
            <a-form-item :label="t('stock.supplierName')" :help="fields.supplierName"
              ><a-input v-model:value="form.supplierName"
            /></a-form-item>
            <a-form-item :label="t('stock.note')" :help="fields.note"
              ><a-textarea v-model:value="form.note"
            /></a-form-item>
          </div>
          <a-alert v-if="fields.lines" type="error" :message="fields.lines" />
          <div v-for="(line, index) in form.lines" :key="line.key ?? index" class="receipt-lines">
            <a-form-item
              :label="t('stock.product')"
              required
              :help="fieldError(index, 'productId')"
              :validate-status="fieldError(index, 'productId') ? 'error' : undefined"
              ><ProductSelect
                :value="line.productId"
                :seeds="seeds"
                active-only
                :disabled="saving || blocked || !eligible"
                @update:value="(value) => (line.productId = value ?? '')"
            /></a-form-item>
            <a-form-item
              :label="t('stock.quantity')"
              required
              :help="fieldError(index, 'quantity')"
              :validate-status="fieldError(index, 'quantity') ? 'error' : undefined"
              ><a-input v-model:value="line.quantity" inputmode="numeric"
            /></a-form-item>
            <a-form-item
              :label="t('stock.unitPrice')"
              required
              :help="fieldError(index, 'unitPrice')"
              :validate-status="fieldError(index, 'unitPrice') ? 'error' : undefined"
              ><a-input v-model:value="line.unitPrice" inputmode="numeric"
            /></a-form-item>
            <a-button danger @click="form.lines.splice(index, 1)">{{
              t('stock.removeLine')
            }}</a-button>
          </div>
          <a-button @click="form.lines.push(newLine())">{{ t('stock.addLine') }}</a-button>
          <p>{{ t('stock.estimatedTotal') }}: {{ formatStockInteger(estimate) }}</p>
        </a-form>
        <template v-else-if="detail">
          <a-descriptions bordered :column="1">
            <a-descriptions-item :label="t('stock.receiptDate')">{{
              detail.receiptDate
            }}</a-descriptions-item>
            <a-descriptions-item :label="t('stock.supplierName')">{{
              detail.supplierName || '—'
            }}</a-descriptions-item>
            <a-descriptions-item :label="t('stock.note')">{{
              detail.note || '—'
            }}</a-descriptions-item>
            <a-descriptions-item :label="t('stock.createdBy')">{{
              detail.createdBy
            }}</a-descriptions-item>
            <a-descriptions-item :label="t('stock.createdAt')">{{
              formatDateTime(detail.createdAt)
            }}</a-descriptions-item>
            <a-descriptions-item v-if="detail.confirmedAt" :label="t('stock.confirmedAt')"
              >{{ formatDateTime(detail.confirmedAt) }} /
              {{ detail.confirmedBy || '—' }}</a-descriptions-item
            >
            <a-descriptions-item v-if="detail.cancelledAt" :label="t('stock.cancelledAt')"
              >{{ formatDateTime(detail.cancelledAt) }} /
              {{ detail.cancelledBy || '—' }}</a-descriptions-item
            >
            <a-descriptions-item v-if="detail.cancellationReason" :label="t('stock.reason')">{{
              detail.cancellationReason
            }}</a-descriptions-item>
          </a-descriptions>
          <BasicTable
            :columns="lineColumns"
            :data-source="detail.lines"
            row-key="productId"
            :scroll="{ x: 750 }"
            @reload="load"
            ><template #bodyCell="{ column, record }"
              ><template
                v-if="['quantity', 'unitPrice', 'lineTotal'].includes(String(column.key))"
                >{{ formatStockInteger(record[column.key]) }}</template
              ></template
            ></BasicTable
          >
          <a-alert v-if="mode === 'confirm'" type="warning" :message="t('stock.confirmWarning')" />
          <template v-if="mode === 'cancel'"
            ><a-alert
              type="warning"
              :message="
                t(
                  detail.status === 'CONFIRMED'
                    ? 'stock.cancelConfirmedWarning'
                    : 'stock.cancelDraftWarning',
                )
              " /><a-form-item
              :label="t('stock.reason')"
              :required="detail.status === 'CONFIRMED'"
              :help="fields.reason"
              :validate-status="fields.reason ? 'error' : undefined"
              ><a-textarea
                v-model:value="reason"
                :maxlength="2000"
                :disabled="saving || blocked"
                show-count /></a-form-item
          ></template>
        </template>
      </template>
    </a-spin>
    <template #footer>
      <a-button :disabled="saving" @click="close">{{ t('common.cancel') }}</a-button>
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
    </template>
  </BasicModal>
</template>
<style scoped>
.receipt-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 0 16px;
  margin-top: 16px;
}
.receipt-lines {
  display: grid;
  grid-template-columns: 2fr 1fr 1fr auto;
  gap: 12px;
  align-items: center;
}
:deep(.ant-alert) {
  margin-bottom: 16px;
}
@media (max-width: 700px) {
  .receipt-grid,
  .receipt-lines {
    grid-template-columns: 1fr;
  }
}
</style>
