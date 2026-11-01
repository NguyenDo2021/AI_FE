<script setup lang="ts">
import { computed, onBeforeUnmount, reactive, ref, useId, watch } from 'vue'
import { useMediaQuery } from '@vueuse/core'
import { useI18n } from 'vue-i18n'
import { message, type TableColumnsType } from 'ant-design-vue'
import {
  DownOutlined,
  FileExcelOutlined,
  FilterOutlined,
  InfoCircleFilled,
  ReloadOutlined,
  SearchOutlined,
  UpOutlined,
} from '@ant-design/icons-vue'
import FittedListTable from '@/components/catalog/FittedListTable.vue'
import ProductSelect from '@/components/stock/ProductSelect.vue'
import { useSalesScope } from '@/composables/useSalesScope'
import { getReport } from '@/api/reports/reports.api'
import { getReportExport } from '@/api/reports/reportExport.api'
import type { InventoryReportRow, ReportFilters } from '@/types/reports'
import { reportError, reportQuery, reportRange, reportValue } from '@/utils/reports'
import { exportQuery, reportExportError } from '@/utils/reportExport'
import { downloadBlob } from '@/utils/paymentReceipt'
import type { NormalizedApiError } from '@/utils/request'

const { t } = useI18n()
const { auth, warehouses, can, scopeKey, refreshScope } = useSalesScope()
const id = useId()
const mobile = useMediaQuery('(max-width: 767px)')
const mobileOpen = ref(false)
const expanded = ref(false)
const formVisible = computed(() => !mobile.value || mobileOpen.value)
const extraVisible = computed(() => mobile.value || expanded.value)
const defaults = (): ReportFilters => ({
  warehouseId: undefined,
  productId: undefined,
  ...reportRange('month'),
  page: 1,
  pageSize: 10,
})
const filters = reactive(defaults())
// Draft edits never change the query used by pagination, reload, or export.
const appliedFilters = ref<ReportFilters>(defaults())
const rows = ref<InventoryReportRow[]>([])
const total = ref(0)
const loading = ref(false)
const ready = ref(false)
const error = ref('')
const validationError = ref('')
const exportLoading = ref(false)
const exportError = ref('')
const scrollRevision = ref(0)
let sequence = 0
let exportSequence = 0
let exportAbort: AbortController | undefined
let scopeRefreshing = false
const authorized = computed(() => !!auth.user && can('REPORT_INVENTORY_VIEW'))
const options = computed(() =>
  warehouses.warehouses.map((item) => ({
    value: item.id,
    label: `${item.code} — ${item.name}${item.status === 0 ? ' (' + t('common.inactive') + ')' : ''}`,
  })),
)
const rangeLabel = computed(() => {
  const { page, pageSize } = appliedFilters.value
  return t('inventoryReport.range', {
    from: total.value ? (page - 1) * pageSize + 1 : 0,
    to: Math.min(page * pageSize, total.value),
    total: total.value,
  })
})
const columns = computed<TableColumnsType<InventoryReportRow>>(() => [
  { title: t('reports.warehouse'), key: 'warehouse', width: 230 },
  { title: t('reports.product'), key: 'product', width: 270 },
  { title: t('reports.unit'), key: 'unit', width: 90 },
  { title: t('reports.productStatus'), key: 'productStatus', width: 140 },
  ...[
    'openingQuantity',
    'receiptQuantity',
    'receiptCancellationQuantity',
    'saleQuantity',
    'saleCancellationQuantity',
    'saleReturnQuantity',
    'adjustmentIncreaseQuantity',
    'adjustmentDecreaseQuantity',
    'closingQuantity',
  ].map((key) => ({
    title: t('reports.' + key),
    key,
    dataIndex: key,
    // Reserve enough room for exact int64 text without overlapping the next cell.
    width: Math.max(
      140,
      ...rows.value.map((row) => reportValue(row[key as keyof InventoryReportRow]).length * 8 + 32),
    ),
    align: 'right' as const,
  })),
])
const clear = (): void => {
  rows.value = []
  total.value = 0
  ready.value = false
}
const cancelExport = (): void => {
  ++exportSequence
  exportAbort?.abort()
  exportAbort = undefined
  exportLoading.value = false
  exportError.value = ''
}
const load = async (): Promise<void> => {
  const current = ++sequence
  ++scrollRevision.value
  clear()
  loading.value = false
  if (scopeRefreshing) return
  error.value = ''
  if (!authorized.value) {
    error.value = t('reports.forbidden')
    return
  }
  if (!warehouses.loaded || warehouses.ownerId !== auth.user?.id) {
    error.value = warehouses.error || t('reports.scopeUnavailable')
    return
  }
  const snapshot = { ...appliedFilters.value }
  if (
    snapshot.warehouseId &&
    !warehouses.warehouses.some((item) => item.id === snapshot.warehouseId)
  ) {
    error.value = t('reports.scopeUnavailable')
    return
  }
  loading.value = true
  try {
    const result = await getReport('inventory', snapshot)
    if (current !== sequence) return
    rows.value = result.items
    total.value = result.total
    ready.value = true
  } catch (cause) {
    if (current !== sequence) return
    clear()
    error.value = reportError(cause)
    if ((cause as NormalizedApiError | undefined)?.code === 'WAREHOUSE_ACCESS_DENIED') {
      ++sequence
      scopeRefreshing = true
      loading.value = false
      filters.warehouseId = undefined
      appliedFilters.value = { ...appliedFilters.value, warehouseId: undefined, page: 1 }
      try {
        await refreshScope(cause)
      } finally {
        scopeRefreshing = false
      }
    }
  } finally {
    if (current === sequence) loading.value = false
  }
}
const submit = (): void => {
  const snapshot = {
    ...filters,
    productId: can('PRODUCT_VIEW') ? filters.productId : undefined,
    page: 1,
    pageSize: appliedFilters.value.pageSize,
  }
  validationError.value = ''
  try {
    reportQuery('inventory', snapshot)
  } catch (cause) {
    validationError.value = reportError(cause)
    // Date fields are all visible on desktop and in the open mobile form.
    if (mobile.value) mobileOpen.value = true
    return
  }
  appliedFilters.value = snapshot
  exportError.value = ''
  void load()
}
const reset = (): void => {
  Object.assign(filters, defaults())
  appliedFilters.value = { ...filters }
  validationError.value = ''
  exportError.value = ''
  void load()
}
const preset = (value: 'today' | 'month' | 'previous'): void => {
  Object.assign(filters, reportRange(value))
  submit()
}
const changePage = (page: number, size: number): void => {
  if (![10, 20, 50, 100].includes(size)) return
  const next = size === appliedFilters.value.pageSize ? page : 1
  if (next === appliedFilters.value.page && size === appliedFilters.value.pageSize) return
  appliedFilters.value = { ...appliedFilters.value, page: next, pageSize: size }
  void load()
}
const reloadScope = async (): Promise<void> => {
  cancelExport()
  ++sequence
  clear()
  loading.value = false
  scopeRefreshing = true
  try {
    await refreshScope()
  } finally {
    scopeRefreshing = false
  }
  await load()
}
const exportExcel = async (): Promise<void> => {
  if (exportLoading.value || !authorized.value) return
  exportError.value = ''
  const snapshot = { ...appliedFilters.value }
  if (!ready.value || loading.value) {
    exportError.value = t('inventoryReport.waitBeforeExport')
    return
  }
  if (!warehouses.loaded || warehouses.ownerId !== auth.user?.id) return
  const current = ++exportSequence
  const userId = auth.user?.id
  const context = scopeKey.value
  const controller = new AbortController()
  exportAbort = controller
  exportLoading.value = true
  try {
    // Validate the applied query; the API helper removes page and pageSize.
    exportQuery('inventory', snapshot)
    const result = await getReportExport('inventory', snapshot, controller.signal)
    if (
      current !== exportSequence ||
      controller.signal.aborted ||
      auth.user?.id !== userId ||
      scopeKey.value !== context ||
      !authorized.value
    )
      return
    downloadBlob(result.blob, result.filename)
    message.success(t('reports.downloadStarted'))
  } catch (cause) {
    if (current !== exportSequence || controller.signal.aborted) return
    exportError.value = reportExportError(cause)
    if ((cause as NormalizedApiError | undefined)?.code === 'WAREHOUSE_ACCESS_DENIED') {
      const denial = exportError.value
      await reloadScope()
      if (auth.user?.id === userId) exportError.value = denial
    }
  } finally {
    if (current === exportSequence) {
      exportLoading.value = false
      exportAbort = undefined
    }
  }
}
watch(
  scopeKey,
  () => {
    cancelExport()
    ++sequence
    clear()
    if (!can('PRODUCT_VIEW')) {
      filters.productId = undefined
      appliedFilters.value = { ...appliedFilters.value, productId: undefined }
    }
    const inScope = (warehouseId?: string): boolean =>
      !warehouseId || warehouses.warehouses.some((item) => item.id === warehouseId)
    if (!inScope(filters.warehouseId)) filters.warehouseId = undefined
    appliedFilters.value = {
      ...appliedFilters.value,
      warehouseId: inScope(appliedFilters.value.warehouseId)
        ? appliedFilters.value.warehouseId
        : undefined,
      page: 1,
    }
    void load()
  },
  { immediate: true, flush: 'sync' },
)
onBeforeUnmount(() => {
  cancelExport()
  ++sequence
})
</script>

<template>
  <a-config-provider
    :theme="{
      token: {
        colorPrimary: '#7c3aed',
        borderRadius: 8,
        controlHeight: mobile ? 40 : 32,
        controlHeightSM: 24,
        controlHeightLG: 40,
      },
    }"
  >
    <section class="inventory-report">
      <header class="report-heading">
        <div>
          <h1>{{ t('inventoryReport.title') }}</h1>
          <p>{{ t('inventoryReport.description') }}</p>
        </div>
        <a-button
          v-if="authorized"
          class="report-export"
          :loading="exportLoading"
          :disabled="exportLoading || loading || !ready"
          :title="t('inventoryReport.exportHint')"
          @click="exportExcel"
        >
          <template #icon><FileExcelOutlined aria-hidden="true" /></template>
          {{ t('reports.exportExcel') }}
        </a-button>
      </header>

      <div class="report-filter-panel">
        <a-button
          v-if="mobile"
          class="report-mobile-toggle"
          :aria-expanded="mobileOpen"
          :aria-controls="id + '-form'"
          @click="mobileOpen = !mobileOpen"
        >
          <FilterOutlined aria-hidden="true" />
          <span>{{ t('inventoryReport.filters') }}</span>
          <UpOutlined v-if="mobileOpen" class="toggle-arrow" aria-hidden="true" />
          <DownOutlined v-else class="toggle-arrow" aria-hidden="true" />
        </a-button>
        <form
          v-show="formVisible"
          :id="id + '-form'"
          class="report-filter-form"
          :aria-label="t('inventoryReport.filters')"
          @submit.prevent="submit"
        >
          <div class="report-field report-field--warehouse">
            <label :for="id + '-warehouse'">{{ t('reports.warehouse') }}:</label>
            <a-select
              :id="id + '-warehouse'"
              v-model:value="filters.warehouseId"
              :options="options"
              allow-clear
              :placeholder="t('reports.allWarehouses')"
              :loading="warehouses.loading"
              :aria-label="t('reports.warehouse')"
            />
          </div>
          <div class="report-field report-field--from">
            <label :for="id + '-from'">{{ t('reports.from') }}:</label>
            <a-date-picker
              :id="id + '-from'"
              v-model:value="filters.from"
              value-format="YYYY-MM-DD"
              format="DD/MM/YYYY"
              :status="validationError ? 'error' : undefined"
              :aria-invalid="!!validationError"
              :aria-describedby="validationError ? id + '-validation' : undefined"
              :placeholder="t('reports.from')"
            />
          </div>
          <div class="report-field report-field--to">
            <label :for="id + '-to'">{{ t('reports.to') }}:</label>
            <a-date-picker
              :id="id + '-to'"
              v-model:value="filters.to"
              value-format="YYYY-MM-DD"
              format="DD/MM/YYYY"
              :status="validationError ? 'error' : undefined"
              :aria-invalid="!!validationError"
              :aria-describedby="validationError ? id + '-validation' : undefined"
              :placeholder="t('reports.to')"
              :title="t('inventoryReport.inclusiveEnd')"
            />
          </div>
          <div class="report-actions">
            <a-button class="report-search" type="primary" html-type="submit" :loading="loading">
              <template #icon><SearchOutlined aria-hidden="true" /></template>
              {{ t('common.search') }}
            </a-button>
            <a-button class="report-reset" html-type="button" @click="reset">
              <template #icon><ReloadOutlined aria-hidden="true" /></template>
              {{ t('common.reset') }}
            </a-button>
          </div>
          <a-button
            v-if="!mobile"
            class="report-expand"
            type="text"
            html-type="button"
            :aria-expanded="expanded"
            :aria-controls="id + '-extra'"
            @click="expanded = !expanded"
          >
            {{ t(expanded ? 'inventoryReport.collapse' : 'inventoryReport.expand') }}
            <UpOutlined v-if="expanded" aria-hidden="true" />
            <DownOutlined v-else aria-hidden="true" />
          </a-button>
          <div v-show="extraVisible" :id="id + '-extra'" class="report-extra">
            <div
              v-if="can('PRODUCT_VIEW')"
              class="report-field report-field--product"
              role="group"
              :aria-labelledby="id + '-product-label'"
            >
              <span :id="id + '-product-label'">{{ t('reports.product') }}:</span>
              <ProductSelect v-model:value="filters.productId" />
            </div>
            <div class="report-presets" role="group" :aria-label="t('inventoryReport.quickDates')">
              <a-button html-type="button" @click="preset('today')">{{
                t('reports.today')
              }}</a-button>
              <a-button html-type="button" @click="preset('month')">{{
                t('reports.month')
              }}</a-button>
              <a-button html-type="button" @click="preset('previous')">{{
                t('reports.previous')
              }}</a-button>
            </div>
          </div>
          <p v-if="validationError" :id="id + '-validation'" class="report-validation" role="alert">
            {{ validationError }}
          </p>
        </form>
      </div>

      <aside class="report-note" :aria-label="t('inventoryReport.dataMeaning')">
        <p>
          <InfoCircleFilled aria-hidden="true" /><span>{{ t('inventoryReport.historyNote') }}</span>
        </p>
        <details>
          <summary>{{ t('inventoryReport.formulaTitle') }}</summary>
          <p>{{ t('inventoryReport.formula') }}</p>
        </details>
      </aside>
      <a-alert v-if="error" type="error" show-icon :message="error">
        <template #description>
          <div class="report-error-actions">
            <a-button @click="load">{{ t('reports.retry') }}</a-button>
            <a-button @click="reloadScope">{{ t('reports.refreshScope') }}</a-button>
          </div>
        </template>
      </a-alert>
      <a-alert v-if="exportError" type="error" show-icon :message="exportError" />

      <FittedListTable
        class="report-table"
        :columns="columns"
        :rows="rows"
        :row-key="(row: InventoryReportRow) => row.warehouseId + ':' + row.productId"
        :loading="loading"
        :error="error"
        :total="total"
        :page="appliedFilters.page"
        :page-size="appliedFilters.pageSize"
        :reset-key="scrollRevision"
        :row-height="48"
        :list-title="t('inventoryReport.detail')"
        total-label=""
        :range-label="rangeLabel"
        @reload="load"
        @page-change="changePage"
      >
        <template #bodyCell="{ column, record, text }">
          <span
            v-if="column.key === 'warehouse'"
            class="report-name"
            :title="record.warehouseCode + ' — ' + record.warehouseName"
          >
            {{ record.warehouseCode }} — {{ record.warehouseName }}
          </span>
          <span
            v-else-if="column.key === 'product'"
            class="report-name"
            :title="record.productCode + ' — ' + record.productName"
          >
            {{ record.productCode }} — {{ record.productName }}
          </span>
          <template v-else-if="column.key === 'unit'">
            {{ record.unit === 'cay' ? t('reports.cay') : record.unit }}
          </template>
          <a-tag
            v-else-if="column.key === 'productStatus'"
            :color="record.productStatus === 1 ? 'success' : 'default'"
          >
            {{ t(record.productStatus === 1 ? 'common.active' : 'common.inactive') }}
          </a-tag>
          <span v-else class="report-quantity">{{ reportValue(text) }}</span>
        </template>
      </FittedListTable>
    </section>
  </a-config-provider>
</template>

<style scoped>
.inventory-report {
  display: flex;
  flex: 1;
  flex-direction: column;
  gap: 14px;
  min-width: 0;
  min-height: 0;
  color: #25203d;
}
.report-heading {
  display: flex;
  flex-wrap: wrap;
  justify-content: space-between;
  align-items: center;
  gap: 12px;
  flex-shrink: 0;
  padding: 4px 4px 2px;
}
.report-heading > div {
  min-width: 0;
}
.report-heading h1 {
  margin: 0;
  color: #171331;
  font-size: 28px;
  line-height: 1.3;
  font-weight: 700;
}
.report-heading p {
  margin: 4px 0 0;
  color: #797093;
  line-height: 1.5;
}
.report-export {
  flex-shrink: 0;
  color: #128452;
  border-color: #7bc7a5;
}
.report-filter-panel,
.report-note {
  flex-shrink: 0;
  border: 1px solid #ece7f8;
  border-radius: 12px;
  background: #fff;
  padding: 16px;
  min-width: 0;
}
.report-filter-form {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 16px 20px;
}
.report-field {
  display: flex;
  align-items: center;
  gap: 12px;
  min-width: 0;
  flex: 1 1 200px;
}
.report-field > label,
.report-field > span {
  flex-shrink: 0;
  font-size: 14px;
}
.report-field--warehouse {
  flex-basis: 260px;
}
.report-field > :deep(.ant-select),
.report-field > :deep(.ant-picker),
.report-field--product > div {
  flex: 1;
  min-width: 0;
  width: 100%;
}
.report-field :deep(.ant-picker) {
  height: 32px;
}
.report-field :deep(.ant-select-selector) {
  min-height: 32px;
}
.report-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
}
.report-search {
  min-width: 120px;
  box-shadow: 0 3px 8px #7c3aed20;
}
.report-expand {
  margin-left: auto;
  color: #7c3aed;
}
.report-extra {
  display: flex;
  flex-basis: 100%;
  flex-wrap: wrap;
  align-items: center;
  gap: 16px 24px;
  border-top: 1px solid #eee8fa;
  padding-top: 16px;
}
.report-field--product {
  flex: 1 1 360px;
  max-width: 580px;
}
.report-presets {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
}
.report-presets > .ant-btn {
  min-width: 100px;
}
.report-validation {
  flex-basis: 100%;
  margin: 0;
  color: #c03948;
}
.report-note {
  padding: 12px 16px;
  color: #706388;
  font-size: 14px;
}
.report-note > p {
  display: flex;
  align-items: flex-start;
  gap: 12px;
  margin: 0;
  line-height: 22px;
}
.report-note .anticon {
  color: #7c3aed;
  margin-top: 3px;
  font-size: 18px;
  flex-shrink: 0;
}
.report-note details {
  margin-top: 10px;
  border-radius: 8px;
  padding: 10px 12px;
  background: #f6f3ff;
}
.report-note summary {
  color: #6d35d2;
  cursor: pointer;
  font-weight: 600;
}
.report-note details p {
  margin: 6px 0 0;
  line-height: 22px;
}
.inventory-report > .ant-alert {
  flex-shrink: 0;
}
.report-error-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}
.report-name {
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
  overflow-wrap: anywhere;
}
.report-table {
  min-height: 320px;
  grid-template-rows: auto minmax(150px, 1fr) auto;
}
.report-quantity {
  white-space: nowrap;
  font-variant-numeric: tabular-nums;
}
.report-table :deep(.ant-table-thead > tr > th) {
  background: #f2edff;
  color: #29203f;
}
.report-table :deep(.ant-table-tbody > tr > td) {
  font-size: 14px;
}
.report-table :deep(.products-table-region) {
  margin-inline: 16px;
}
.report-mobile-toggle {
  display: flex;
  align-items: center;
  gap: 8px;
  width: 100%;
  color: #7c3aed;
  border-color: #ded1ff;
  background: #f6f0ff;
  text-align: left;
}
.report-mobile-toggle .toggle-arrow {
  margin-left: auto;
}
@media (max-width: 1100px) and (min-width: 768px) {
  .report-field {
    flex-basis: 240px;
  }
}
@media (max-width: 767px) {
  .report-table {
    min-height: 400px;
  }
  .report-heading h1 {
    font-size: 22px;
  }
  .report-heading {
    padding: 0;
  }
  .report-filter-panel {
    padding: 10px;
  }
  .report-filter-form {
    display: grid;
    grid-template-columns: minmax(0, 1fr);
    gap: 14px;
    padding-top: 14px;
  }
  .report-field {
    flex-direction: column;
    align-items: stretch;
    gap: 6px;
  }
  .report-field--warehouse {
    order: 0;
  }
  .report-extra {
    display: contents;
  }
  .report-field--product {
    order: 1;
    max-width: none;
  }
  .report-field--from {
    order: 2;
  }
  .report-field--to {
    order: 3;
  }
  .report-presets {
    order: 4;
    gap: 8px;
  }
  .report-presets > .ant-btn {
    flex: 1 1 auto;
    min-width: 0;
    padding-inline: 10px;
  }
  .report-validation {
    order: 5;
  }
  .report-actions {
    order: 6;
    display: flex;
    padding-top: 12px;
    border-top: 1px solid #eee8fa;
  }
  .report-actions > .ant-btn {
    flex: 1;
    min-width: 0;
  }
  .report-reset {
    order: -1;
  }
  .inventory-report :deep(.ant-btn) {
    min-height: 44px;
  }
  .report-field :deep(.ant-select-selector),
  .report-field :deep(.ant-picker) {
    min-height: 40px;
    height: 40px;
  }
  .report-note {
    padding: 12px;
  }
  .report-table :deep(.products-table-region) {
    margin-inline: 10px;
  }
  .report-table :deep(.list-page-size .ant-select-selector) {
    min-height: 44px;
    align-items: center;
  }
  .report-table :deep(.ant-pagination-item-link) {
    min-width: 44px;
    min-height: 44px;
  }
}
</style>
