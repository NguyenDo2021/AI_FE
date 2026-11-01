<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { onBeforeRouteLeave } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { Modal, message } from 'ant-design-vue'
import { BasicModal } from '@/components'
import type { TableColumnsType } from 'ant-design-vue'
import { SaveOutlined, ReloadOutlined, PlusOutlined } from '@ant-design/icons-vue'
import StocktakeTable from './StocktakeTable.vue'
import StocktakeProducts from './StocktakeProducts.vue'
import {
  getStocktake,
  createStocktake,
  updateStocktake,
  refreshStocktake,
  confirmStocktake,
  cancelStocktake,
} from '@/api/stock/stocktake.api'
import { useSalesScope } from '@/composables/useSalesScope'
import { useStockStore } from '@/stores/stock'
import {
  stocktakeForm,
  stocktakeInput,
  countDifference,
  validateStocktake,
  parseStaleLines,
  stocktakeFieldErrors,
} from '@/utils/stocktake'
import { stringifyStockJson, formatStockInteger, stockError } from '@/utils/stock'
import { formatDateTime } from '@/utils/date'
import type { NormalizedApiError } from '@/utils/request'
import type { Stocktake, CountForm, CountLine, StaleLine } from '@/types/stocktake'
import type { Inventory } from '@/types/stock'
const props = defineProps<{
  open: boolean
  id?: string
  initial?: Stocktake
  mode: 'create' | 'view' | 'edit' | 'confirm' | 'cancel'
}>()
const emit = defineEmits<{ 'update:open': [value: boolean]; saved: [value: Stocktake] }>()
const { t } = useI18n()
const { can, warehouses, scopeKey, inScope, refreshScope } = useSalesScope()
const stock = useStockStore()
const detail = ref<Stocktake>()
const empty = (): CountForm => ({ warehouseId: warehouses.selectedId ?? '', note: '', lines: [] })
const form = ref<CountForm>(empty())
const loading = ref(false)
const saving = ref(false)
const confirming = ref(false)
const blocked = ref(false)
const error = ref('')
const fields = ref<Record<string, string>>({})
const stale = ref<Record<string, StaleLine>>({})
const reason = ref('')
const localMode = ref(props.mode)
const baseline = ref('')
let generation = 0
const dirty = computed(() => stringifyStockJson(form.value) !== baseline.value)
const isCreate = computed(() => !detail.value && localMode.value === 'create')
const requiredPermission = computed(
  () =>
    `STOCKTAKE_${{ create: 'CREATE', view: 'VIEW', edit: 'UPDATE', confirm: 'CONFIRM', cancel: 'CANCEL' }[localMode.value]}`,
)
const allowed = computed(() => can(requiredPermission.value))
const draft = computed(() => detail.value?.status === 'DRAFT')
const editable = computed(
  () => allowed.value && (isCreate.value || (localMode.value === 'edit' && draft.value)),
)
const activeWarehouse = computed(() =>
  warehouses.warehouses.some((item) => item.id === form.value.warehouseId && item.status === 1),
)
const warehouseOptions = computed(() =>
  warehouses.warehouses.map((item) => ({
    value: item.id,
    label: `${item.code} - ${item.name}`,
    disabled: item.status !== 1,
  })),
)
const warehouseName = (id: string): string =>
  warehouses.warehouses.find((item) => item.id === id)?.name ?? id
const columns = computed<TableColumnsType<CountLine>>(() =>
  [
    'productCode',
    'productName',
    'unit',
    'systemQuantity',
    'countedQuantity',
    'difference',
    'reason',
    'actions',
  ].map((key) => ({
    key,
    dataIndex: key,
    title: t(`stocktake.${key}`),
    width: (
      {
        productCode: 160,
        productName: 240,
        unit: 90,
        systemQuantity: 190,
        countedQuantity: 200,
        difference: 190,
        reason: 260,
        actions: 120,
      } as Record<string, number>
    )[key],
    ...(['systemQuantity', 'countedQuantity', 'difference'].includes(key)
      ? { align: 'right' as const }
      : {}),
    ...(key === 'actions' ? { fixed: 'right' as const } : {}),
  })),
)
const differenceText = (line: CountLine): string => {
  const value = countDifference(line.countedQuantity, line.systemQuantity)
  return value === undefined ? '—' : `${value > 0n ? '+' : ''}${formatStockInteger(value)}`
}
const differenceClass = (line: CountLine): string => {
  const value = countDifference(line.countedQuantity, line.systemQuantity)
  return value === undefined || value === 0n
    ? ''
    : value > 0n
      ? 'difference-positive'
      : 'difference-negative'
}
const accept = (value: Stocktake): void => {
  detail.value = value
  form.value = stocktakeForm(value)
  baseline.value = stringifyStockJson(form.value)
  blocked.value = false
  fields.value = {}
  stale.value = {}
}
const discard = (): Promise<boolean> =>
  dirty.value
    ? new Promise((resolve) => {
        Modal.confirm({
          title: t('stocktake.unsaved'),
          content: t('stocktake.discard'),
          onOk: () => resolve(true),
          onCancel: () => resolve(false),
        })
      })
    : Promise.resolve(true)
const clear = (): void => {
  ++generation
  detail.value = undefined
  form.value = empty()
  baseline.value = stringifyStockJson(form.value)
  stale.value = {}
  fields.value = {}
  blocked.value = true
  loading.value = false
}
const handleError = async (cause: unknown): Promise<void> => {
  const failure = cause as NormalizedApiError
  const key = failure.code ? `stocktake.errors.${failure.code}` : ''
  const translated = key ? t(key) : ''
  error.value = translated && translated !== key ? translated : stockError(cause, t)
  fields.value = stocktakeFieldErrors(failure.code, failure.details, form.value.lines)
  for (const [field, text] of Object.entries(fields.value)) {
    const translatedField = t(`stocktake.errors.${text}`)
    if (translatedField !== `stocktake.errors.${text}`) fields.value[field] = translatedField
  }
  if (failure.code === 'STOCKTAKE_STALE') {
    stale.value = parseStaleLines(failure.details)
    if (!can('STOCKTAKE_UPDATE')) error.value += ` ${t('stocktake.needUpdater')}`
  }
  if (failure.code === 'VERSION_CONFLICT') blocked.value = true
  if (failure.code === 'WAREHOUSE_ACCESS_DENIED') {
    clear()
    await refreshScope(cause)
  } else if (failure.status === 403 || failure.status === 404) clear()
}
const load = async (ask = true): Promise<void> => {
  if (
    !props.open ||
    saving.value ||
    !can('STOCKTAKE_VIEW') ||
    !allowed.value ||
    !(props.id || detail.value?.id)
  )
    return
  const before = generation
  if (ask && !(await discard())) return
  if (before !== generation || !props.open) return
  const current = ++generation
  loading.value = true
  error.value = ''
  try {
    const value = await getStocktake((props.id || detail.value?.id)!)
    if (current !== generation || !props.open) return
    if (!inScope(value.warehouseId)) {
      clear()
      return
    }
    accept(value)
  } catch (cause) {
    if (current === generation) await handleError(cause)
  } finally {
    if (current === generation) loading.value = false
  }
}
watch(
  () => [props.open, props.id, props.mode, props.initial] as const,
  () => {
    ++generation
    loading.value = false
    error.value = ''
    fields.value = {}
    stale.value = {}
    reason.value = ''
    detail.value = undefined
    blocked.value = false
    localMode.value = props.mode
    form.value = empty()
    baseline.value = stringifyStockJson(form.value)
    if (!props.open || !allowed.value) return
    if (props.id && can('STOCKTAKE_VIEW')) void load(false)
    else if (props.initial && inScope(props.initial.warehouseId)) accept(props.initial)
  },
  { immediate: true },
)
watch(scopeKey, () => {
  if (!props.open) return
  if (loading.value) {
    ++generation
    loading.value = false
    if (can('STOCKTAKE_VIEW')) void load(false)
  }
  if (
    !allowed.value ||
    (props.id && !can('STOCKTAKE_VIEW') && !props.initial) ||
    (form.value.warehouseId && !inScope(form.value.warehouseId))
  )
    clear()
})
watch(
  () => form.value.warehouseId,
  (value, old) => {
    if (isCreate.value && value !== old) form.value.lines = []
  },
)
const beforeUnload = (event: BeforeUnloadEvent): void => {
  if (props.open && (dirty.value || saving.value)) {
    event.preventDefault()
    event.returnValue = ''
  }
}
onMounted(() => window.addEventListener('beforeunload', beforeUnload))
onBeforeRouteLeave(async () => {
  if (!props.open) return true
  if (saving.value) return false
  return discard()
})
onBeforeUnmount(() => {
  ++generation
  window.removeEventListener('beforeunload', beforeUnload)
})
const addProduct = (value: Inventory): void => {
  if (
    !editable.value ||
    saving.value ||
    blocked.value ||
    form.value.lines.some((line) => line.productId === value.productId) ||
    form.value.lines.length >= 1000
  )
    return
  form.value.lines.push({
    productId: value.productId,
    productCode: value.productCode,
    productName: value.productName,
    unit: value.unit,
    countedQuantity: '',
    reason: '',
  })
}
const removeProduct = (id: string): void => {
  if (editable.value && !saving.value && !blocked.value)
    form.value.lines = form.value.lines.filter((line) => line.productId !== id)
}
const validate = (confirm = false): boolean => {
  const errors = validateStocktake(form.value, isCreate.value, confirm)
  fields.value = Object.fromEntries(
    Object.entries(errors).map(([key, value]) => [key, t(`stocktake.${value}`)]),
  )
  return Object.keys(errors).length === 0
}
const operationAllowed = (action: 'save' | 'refresh' | 'confirm' | 'cancel'): boolean => {
  const permission =
    action === 'save'
      ? isCreate.value
        ? 'CREATE'
        : 'UPDATE'
      : action === 'refresh'
        ? 'UPDATE'
        : action.toUpperCase()
  return (
    can(`STOCKTAKE_${permission}`) &&
    inScope(form.value.warehouseId) &&
    (isCreate.value || draft.value === true) &&
    (action === 'cancel' || activeWarehouse.value)
  )
}
const execute = async (action: 'save' | 'refresh' | 'confirm' | 'cancel'): Promise<void> => {
  if (saving.value || loading.value || blocked.value || !allowed.value || !operationAllowed(action))
    return
  const current = generation
  error.value = ''
  fields.value = {}
  if (action === 'save' && !validate()) return
  if (action === 'confirm') {
    if (dirty.value) {
      error.value = t('stocktake.saveFirst')
      return
    }
    if (!validate(true)) return
  }
  if (action === 'cancel' && (!reason.value.trim() || reason.value.length > 2000)) {
    fields.value.reason = t('stocktake.cancelReason')
    return
  }
  saving.value = true
  try {
    let result: Stocktake
    const original = detail.value
    if (action === 'save' && isCreate.value) {
      result = await createStocktake({
        warehouseId: form.value.warehouseId,
        note: form.value.note.trim() || undefined,
        lines: form.value.lines.map((line) => ({ productId: line.productId })),
      })
    } else {
      if (!original) return
      if (action === 'save')
        result = await updateStocktake(original.id, stocktakeInput(form.value, original.version))
      else if (action === 'refresh') result = await refreshStocktake(original.id, original.version)
      else if (action === 'confirm') result = await confirmStocktake(original.id, original.version)
      else result = await cancelStocktake(original.id, original.version, reason.value.trim())
    }
    if (action === 'confirm') stock.invalidate()
    if (current !== generation || !props.open) return
    const created = isCreate.value
    accept(result)
    if (created)
      localMode.value = can('STOCKTAKE_UPDATE') ? 'edit' : can('STOCKTAKE_VIEW') ? 'view' : 'create'
    message.success(t(`stocktake.${action}Success`))
    emit('saved', result)
    if (created && !can('STOCKTAKE_UPDATE') && !can('STOCKTAKE_VIEW')) emit('update:open', false)
  } catch (cause) {
    if (current !== generation || !props.open) return
    await handleError(cause)
    if (current !== generation) return
    const failure = cause as NormalizedApiError
    if ((action === 'confirm' || action === 'cancel') && !failure.status) {
      error.value = t('stocktake.unknownResult')
      blocked.value = true
      if (can('STOCKTAKE_VIEW') && detail.value) {
        try {
          const value = await getStocktake(detail.value.id)
          if (current !== generation) return
          if (!inScope(value.warehouseId)) {
            clear()
            return
          }
          if (value.status !== 'DRAFT') {
            if (value.status === 'CONFIRMED') stock.invalidate()
            accept(value)
            emit('saved', value)
            error.value = t(`stock.${value.status}`)
          }
        } catch {
          /* Preserve the unknown result until explicit reload. */
        }
      }
    }
    if (failure.code === 'INVALID_STOCKTAKE_STATUS' && can('STOCKTAKE_VIEW') && detail.value) {
      try {
        const value = await getStocktake(detail.value.id)
        if (current === generation) {
          if (!inScope(value.warehouseId)) {
            clear()
            return
          }
          detail.value = value
          blocked.value = true
        }
      } catch {
        blocked.value = true
      }
    }
    if (action === 'save' && isCreate.value && !failure.status) {
      blocked.value = true
      error.value = t('stocktake.unknownCreate')
    }
  } finally {
    saving.value = false
  }
}
const requestAction = (action: 'refresh' | 'confirm' | 'cancel'): void => {
  if (
    saving.value ||
    confirming.value ||
    loading.value ||
    blocked.value ||
    !allowed.value ||
    !operationAllowed(action)
  )
    return
  if (action === 'confirm' && dirty.value) {
    error.value = t('stocktake.saveFirst')
    return
  }
  const current = generation
  confirming.value = true
  Modal.confirm({
    title: t(`stocktake.${action}`),
    content: `${action !== 'confirm' && dirty.value ? t('stocktake.discard') + ' ' : ''}${t(`stocktake.${action}Warning`)}`,
    onOk: async () => {
      try {
        if (current === generation && props.open) await execute(action)
      } finally {
        confirming.value = false
      }
    },
    onCancel: () => {
      confirming.value = false
    },
  })
}
const close = async (): Promise<void> => {
  const current = generation
  if (!saving.value && (await discard()) && current === generation) emit('update:open', false)
}
</script>

<template>
  <BasicModal
    :open="open"
    :title="
      t(
        isCreate
          ? 'stocktake.create'
          : localMode === 'edit'
            ? 'stocktake.edit'
            : localMode === 'confirm'
              ? 'stocktake.confirm'
              : localMode === 'cancel'
                ? 'stocktake.cancel'
                : 'stocktake.view',
      )
    "
    :width="1280"
    :confirm-loading="saving"
    wrap-class-name="stocktake-dialog"
    @update:open="close"
  >
    <a-spin :spinning="loading">
      <div class="stocktake-dialog__body">
        <a-alert v-if="error" type="error" :message="error" show-icon />
        <a-alert v-if="!allowed" type="warning" :message="t('stock.forbidden')" />
        <template v-if="allowed && (isCreate || detail)">
          <a-alert
            v-if="isCreate || draft"
            type="warning"
            :message="t('stocktake.instructions')"
            show-icon
          />
          <section class="stocktake-section">
            <h2>{{ t('stocktake.information') }}</h2>
            <a-descriptions v-if="detail" bordered size="small" :column="{ xs: 1, sm: 2 }">
              <a-descriptions-item :label="t('stock.code')">
                <a-tooltip :title="detail.code"
                  ><span class="audit-value">{{ detail.code || '—' }}</span></a-tooltip
                >
              </a-descriptions-item>
              <a-descriptions-item :label="t('stock.status')">
                <a-tag
                  :color="
                    detail.status === 'CONFIRMED'
                      ? 'green'
                      : detail.status === 'CANCELLED'
                        ? 'red'
                        : 'default'
                  "
                  >{{ t(`stock.${detail.status}`) }}</a-tag
                >
              </a-descriptions-item>
              <a-descriptions-item :label="t('stock.warehouse')">
                <a-tooltip :title="warehouseName(detail.warehouseId)"
                  ><span class="audit-value">{{
                    warehouseName(detail.warehouseId) || '—'
                  }}</span></a-tooltip
                >
              </a-descriptions-item>
              <a-descriptions-item :label="t('stocktake.version')">{{
                String(detail.version)
              }}</a-descriptions-item>
              <a-descriptions-item :label="t('stock.createdBy')">
                <a-tooltip :title="detail.createdBy"
                  ><span class="audit-value">{{ detail.createdBy || '—' }}</span></a-tooltip
                >
              </a-descriptions-item>
              <a-descriptions-item :label="t('stock.createdAt')">{{
                formatDateTime(detail.createdAt) || '—'
              }}</a-descriptions-item>
              <a-descriptions-item :label="t('stocktake.updatedBy')">
                <a-tooltip :title="detail.updatedBy"
                  ><span class="audit-value">{{ detail.updatedBy || '—' }}</span></a-tooltip
                >
              </a-descriptions-item>
              <a-descriptions-item :label="t('stocktake.updatedAt')">{{
                formatDateTime(detail.updatedAt) || '—'
              }}</a-descriptions-item>
              <template v-if="detail.confirmedAt || detail.confirmedBy">
                <a-descriptions-item :label="t('stocktake.confirmedBy')"
                  ><a-tooltip :title="detail.confirmedBy"
                    ><span class="audit-value">{{ detail.confirmedBy || '—' }}</span></a-tooltip
                  ></a-descriptions-item
                >
                <a-descriptions-item :label="t('stocktake.confirmedAt')">{{
                  formatDateTime(detail.confirmedAt) || '—'
                }}</a-descriptions-item>
              </template>
              <template v-if="detail.cancelledAt || detail.cancelledBy">
                <a-descriptions-item :label="t('stocktake.cancelledBy')"
                  ><a-tooltip :title="detail.cancelledBy"
                    ><span class="audit-value">{{ detail.cancelledBy || '—' }}</span></a-tooltip
                  ></a-descriptions-item
                >
                <a-descriptions-item :label="t('stocktake.cancelledAt')">{{
                  formatDateTime(detail.cancelledAt) || '—'
                }}</a-descriptions-item>
              </template>
              <a-descriptions-item
                v-if="detail.cancellationReason"
                :label="t('stock.reason')"
                :span="2"
                ><span class="stocktake-note">{{
                  detail.cancellationReason
                }}</span></a-descriptions-item
              >
            </a-descriptions>
            <a-form
              v-if="isCreate"
              layout="vertical"
              :disabled="saving || blocked || !editable || (!isCreate && !activeWarehouse)"
            >
              <a-form-item
                :label="t('stock.warehouse')"
                required
                :help="fields.warehouseId"
                :validate-status="fields.warehouseId ? 'error' : undefined"
              >
                <a-select
                  v-model:value="form.warehouseId"
                  :options="warehouseOptions"
                  :disabled="saving || blocked"
                  :aria-label="t('stock.warehouse')"
                />
              </a-form-item>
            </a-form>
          </section>
          <a-alert v-if="detail && !draft" type="info" :message="t('stocktake.finalStatus')" />
          <a-form
            layout="vertical"
            :disabled="saving || blocked || !editable || (!isCreate && !activeWarehouse)"
            class="stocktake-lines-form"
          >
            <a-alert v-if="fields.lines" type="error" :message="fields.lines" />
            <StocktakeTable
              :columns="columns"
              :rows="form.lines"
              row-key="productId"
              :title="t('stocktake.products')"
              :scroll-width="1460"
              @reload="load()"
            >
              <template #bodyCell="{ column, record }">
                <a-tooltip
                  v-if="column.key === 'productCode' || column.key === 'productName'"
                  :title="record[column.key] || '—'"
                >
                  <span class="line-text" :class="{ 'line-code': column.key === 'productCode' }">{{
                    record[column.key] || '—'
                  }}</span>
                </a-tooltip>
                <template v-else-if="column.key === 'unit'">{{ record.unit || '—' }}</template>
                <template v-else-if="column.key === 'systemQuantity'">
                  <span class="stocktake-number">{{
                    record.systemQuantity === undefined
                      ? t('stocktake.pendingSnapshot')
                      : formatStockInteger(record.systemQuantity)
                  }}</span>
                  <div v-if="stale[record.productId]" class="stale">
                    {{ t('stocktake.currentQuantity') }}:
                    {{ stale[record.productId]?.currentQuantity ?? '—' }}<br />
                    {{ t('stocktake.revisionChanged') }}:
                    {{ stale[record.productId]?.snapshotRevision ?? '—' }} &rarr;
                    {{ stale[record.productId]?.currentRevision ?? '—' }}
                  </div>
                </template>
                <template v-else-if="column.key === 'countedQuantity'">
                  <a-input
                    v-if="editable && !isCreate"
                    v-model:value="record.countedQuantity"
                    class="stocktake-count-input"
                    inputmode="numeric"
                    :disabled="
                      saving || blocked || !activeWarehouse || record.systemQuantity === undefined
                    "
                    :aria-label="t('stocktake.countedQuantity')"
                    :status="fields[`lines.${record.productId}`] ? 'error' : undefined"
                  />
                  <span v-else class="stocktake-number">{{
                    record.countedQuantity === ''
                      ? '—'
                      : formatStockInteger(BigInt(record.countedQuantity))
                  }}</span>
                  <div v-if="fields[`lines.${record.productId}`]" class="stale">
                    {{ fields[`lines.${record.productId}`] }}
                  </div>
                </template>
                <span
                  v-else-if="column.key === 'difference'"
                  class="stocktake-number stocktake-difference"
                  :class="differenceClass(record)"
                  >{{ differenceText(record) }}</span
                >
                <template v-else-if="column.key === 'reason'">
                  <a-textarea
                    v-if="editable && !isCreate"
                    v-model:value="record.reason"
                    :auto-size="{ minRows: 1, maxRows: 4 }"
                    :maxlength="2000"
                    :disabled="
                      saving || blocked || !activeWarehouse || record.systemQuantity === undefined
                    "
                    :aria-label="t('stocktake.reason')"
                  />
                  <span v-else class="stocktake-note">{{ record.reason || '—' }}</span>
                </template>
                <template v-else-if="column.key === 'actions'">
                  <a-button
                    v-if="editable"
                    danger
                    size="small"
                    :disabled="saving || blocked || !activeWarehouse"
                    @click="removeProduct(record.productId)"
                    >{{ t('stock.removeLine') }}</a-button
                  >
                  <span v-else>—</span>
                </template>
              </template>
            </StocktakeTable>
          </a-form>
          <section v-if="editable && activeWarehouse" class="stocktake-section">
            <h2><PlusOutlined aria-hidden="true" /> {{ t('stocktake.addProduct') }}</h2>
            <p class="stocktake-help">{{ t('stocktake.saveNewLine') }}</p>
            <StocktakeProducts
              :warehouse-id="form.warehouseId"
              :selected="form.lines.map((line) => line.productId)"
              :disabled="saving || blocked"
              @select="addProduct"
            />
          </section>
          <section class="stocktake-section">
            <h2>{{ t('stock.note') }}</h2>
            <a-form
              layout="vertical"
              :disabled="saving || blocked || !editable || (!isCreate && !activeWarehouse)"
            >
              <a-form-item
                v-if="editable"
                :help="fields.note"
                :validate-status="fields.note ? 'error' : undefined"
              >
                <a-textarea
                  v-model:value="form.note"
                  :aria-label="t('stock.note')"
                  :auto-size="{ minRows: 3, maxRows: 6 }"
                  :maxlength="2000"
                  show-count
                />
              </a-form-item>
              <p v-else class="stocktake-note">{{ form.note || '—' }}</p>
            </a-form>
            <a-form-item
              v-if="draft && can('STOCKTAKE_CANCEL')"
              :label="t('stocktake.cancelReason')"
              :help="fields.reason"
              :validate-status="fields.reason ? 'error' : undefined"
            >
              <a-textarea
                v-model:value="reason"
                :aria-label="t('stocktake.cancelReason')"
                :auto-size="{ minRows: 2, maxRows: 5 }"
                :maxlength="2000"
                :disabled="saving || blocked"
                show-count
              />
            </a-form-item>
          </section>
        </template>
      </div>
    </a-spin>
    <template #footer>
      <div class="stocktake-dialog__footer">
        <a-button :disabled="saving" @click="close">{{ t('common.cancel') }}</a-button>
        <a-button
          v-if="(id || detail) && can('STOCKTAKE_VIEW')"
          :disabled="saving || loading"
          @click="load()"
          ><template #icon><ReloadOutlined aria-hidden="true" /></template
          >{{ t('stock.reloadDetail') }}</a-button
        >
        <a-button
          v-if="editable"
          type="primary"
          :loading="saving"
          :disabled="blocked || loading || !activeWarehouse"
          @click="execute('save')"
          ><template #icon><SaveOutlined aria-hidden="true" /></template
          >{{ t('common.save') }}</a-button
        >
        <template v-if="draft">
          <a-button
            v-if="can('STOCKTAKE_UPDATE')"
            :disabled="saving || loading || blocked || !activeWarehouse"
            @click="requestAction('refresh')"
            >{{ t('stocktake.refresh') }}</a-button
          >
          <a-button
            v-if="can('STOCKTAKE_CONFIRM')"
            type="primary"
            :disabled="saving || loading || blocked || !activeWarehouse"
            @click="requestAction('confirm')"
            >{{ t('stocktake.confirm') }}</a-button
          >
          <a-button
            v-if="can('STOCKTAKE_CANCEL')"
            danger
            :disabled="saving || loading || blocked"
            @click="requestAction('cancel')"
            >{{ t('stocktake.cancel') }}</a-button
          >
        </template>
      </div>
    </template>
  </BasicModal>
</template>

<style scoped>
.stocktake-dialog__body {
  display: flex;
  flex-direction: column;
  gap: 16px;
  min-width: 0;
}
.stocktake-section {
  min-width: 0;
  padding: 16px;
  background: #fff;
  border: 1px solid #e9e4f1;
  border-radius: 12px;
}
h2 {
  margin: 0 0 12px;
  color: #302640;
  font-size: 16px;
  font-weight: 600;
  line-height: 24px;
}
.stocktake-help {
  margin: 0 0 12px;
  color: #757080;
  font-size: 13px;
}
.stocktake-lines-form :deep(.ant-alert) {
  margin-bottom: 12px;
}
.stocktake-section :deep(.ant-form-item:last-child) {
  margin-bottom: 0;
}
.stocktake-section :deep(.ant-descriptions-view table) {
  table-layout: fixed;
}
.audit-value,
.line-text {
  display: block;
  min-width: 0;
  max-width: 100%;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.line-code {
  font-weight: 600;
  color: #5a4578;
}
.stocktake-number {
  font-variant-numeric: tabular-nums;
}
.stocktake-count-input {
  min-height: 36px;
  text-align: right;
  font-variant-numeric: tabular-nums;
}
.stocktake-difference {
  font-weight: 600;
}
.difference-positive {
  color: #237804;
}
.difference-negative,
.stale {
  color: #cf1322;
}
.stale {
  margin-top: 4px;
  font-size: 12px;
  overflow-wrap: anywhere;
}
.stocktake-note {
  margin: 0;
  white-space: pre-wrap;
  overflow-wrap: anywhere;
}
.stocktake-dialog__footer {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  flex-wrap: wrap;
  gap: 8px;
}
.stocktake-dialog__footer :deep(.ant-btn + .ant-btn) {
  margin-inline-start: 0;
}
:global(.stocktake-dialog .ant-modal) {
  top: 16px;
  max-width: calc(100vw - 24px);
  padding-bottom: 16px;
}
:global(.stocktake-dialog .ant-modal-content) {
  display: flex;
  flex-direction: column;
  max-height: calc(100dvh - 32px);
}
:global(.stocktake-dialog .ant-modal-header),
:global(.stocktake-dialog .ant-modal-footer) {
  flex-shrink: 0;
}
:global(.stocktake-dialog .ant-modal-body) {
  min-height: 0;
  overflow: auto;
  padding-block: 4px;
}
:global(.stocktake-dialog .ant-modal-footer) {
  margin-top: 12px;
}
@media (max-width: 575px) {
  .stocktake-section {
    padding: 12px;
  }
  :global(.stocktake-dialog .ant-modal-content) {
    padding: 16px 12px;
  }
  .stocktake-dialog__footer {
    justify-content: flex-start;
  }
  .stocktake-dialog__footer :deep(.ant-btn) {
    height: auto;
    min-height: 32px;
    white-space: normal;
  }
}
@media (max-height: 450px) {
  :global(.stocktake-dialog .ant-modal-content) {
    max-height: none;
  }
  :global(.stocktake-dialog .ant-modal-body) {
    overflow: visible;
  }
}
</style>
