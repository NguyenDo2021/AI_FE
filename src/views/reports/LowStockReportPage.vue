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
  InboxOutlined,
  ReloadOutlined,
  SearchOutlined,
  UpOutlined,
} from '@ant-design/icons-vue'
import FittedListTable from '@/components/catalog/FittedListTable.vue'
import ProductSelect from '@/components/stock/ProductSelect.vue'
import { useSalesScope } from '@/composables/useSalesScope'
import { getReport } from '@/api/reports/reports.api'
import { getReportExport } from '@/api/reports/reportExport.api'
import type { LowStockRow, ReportFilters } from '@/types/reports'
import { lowStockMetrics, reportError, reportValue } from '@/utils/reports'
import { reportExportError } from '@/utils/reportExport'
import { downloadBlob } from '@/utils/paymentReceipt'
import type { NormalizedApiError } from '@/utils/request'

const { t } = useI18n()
const { auth, warehouses, can, scopeKey, refreshScope } = useSalesScope()
const id = useId()
const mobile = useMediaQuery('(max-width: 767px)')
const mobileOpen = ref(false)
const formVisible = computed(() => !mobile.value || mobileOpen.value)
// Dates are required by the shared filter type, but unused by this current-stock endpoint.
const defaults = (): ReportFilters => ({
  warehouseId: undefined,
  productId: undefined,
  from: '',
  to: '',
  page: 1,
  pageSize: 10,
})
const filters = reactive(defaults())
const appliedFilters = ref<ReportFilters>(defaults())
const rows = ref<LowStockRow[]>([])
const total = ref(0)
const loading = ref(false)
const ready = ref(false)
const error = ref('')
const exportLoading = ref(false)
const exportError = ref('')
const scrollRevision = ref(0)
let sequence = 0
let exportSequence = 0
let exportAbort: AbortController | undefined
let scopeRefreshing = false
const authorized = computed(() => !!auth.user && can('REPORT_LOW_STOCK_VIEW'))
const options = computed(() =>
  warehouses.warehouses.map((item) => ({
    value: item.id,
    label: `${item.code} — ${item.name}${item.status === 0 ? ' (' + t('common.inactive') + ')' : ''}`,
  })),
)
const totalText = computed(() => (ready.value ? reportValue(total.value) : '—'))
const rangeLabel = computed(() => {
  if (!ready.value) return '—'
  const { page, pageSize } = appliedFilters.value
  return t('inventoryReport.range', {
    from: total.value ? (page - 1) * pageSize + 1 : 0,
    to: Math.min(page * pageSize, total.value),
    total: total.value,
  })
})
const columns = computed<TableColumnsType<LowStockRow>>(() => [
  { title: t('reports.warehouse'), key: 'warehouse', width: 240 },
  { title: t('reports.product'), key: 'product', width: 290 },
  { title: t('reports.unit'), key: 'unit', width: 90 },
  ...lowStockMetrics.map((key) => ({
    title: t('reports.' + key),
    key,
    dataIndex: key,
    width: Math.max(160, ...rows.value.map((row) => reportValue(row[key]).length * 8 + 40)),
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
    const result = await getReport('low-stock', snapshot)
    if (current !== sequence) return
    rows.value = result.items
    total.value = result.total
    ready.value = true
  } catch (cause) {
    if (current !== sequence) return
    clear()
    error.value = reportError(cause)
    if ((cause as NormalizedApiError | undefined)?.code === 'WAREHOUSE_ACCESS_DENIED') {
      cancelExport()
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
  cancelExport()
  appliedFilters.value = {
    ...filters,
    productId: can('PRODUCT_VIEW') ? filters.productId : undefined,
    page: 1,
    pageSize: appliedFilters.value.pageSize,
  }
  void load()
}
const reset = (): void => {
  cancelExport()
  Object.assign(filters, defaults())
  appliedFilters.value = { ...filters }
  void load()
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
  if (!ready.value || loading.value) {
    exportError.value = t('inventoryReport.waitBeforeExport')
    return
  }
  if (!warehouses.loaded || warehouses.ownerId !== auth.user?.id) return
  const snapshot = { ...appliedFilters.value }
  const current = ++exportSequence
  const userId = auth.user?.id
  const context = scopeKey.value
  const controller = new AbortController()
  exportAbort = controller
  exportLoading.value = true
  try {
    const result = await getReportExport('low-stock', snapshot, controller.signal)
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
    <section class="low-stock-report">
      <div class="report-overview">
        <header class="report-heading">
          <div>
            <h1>{{ t('lowStockReport.title') }}</h1>
            <p>{{ t('lowStockReport.description') }}</p>
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

        <a-button
          v-if="mobile"
          class="report-mobile-toggle"
          :aria-expanded="mobileOpen"
          :aria-controls="id + '-form'"
          @click="mobileOpen = !mobileOpen"
        >
          <FilterOutlined aria-hidden="true" />
          <span>{{ t('inventoryReport.filters') }}</span>
          <UpOutlined v-if="mobileOpen" aria-hidden="true" />
          <DownOutlined v-else aria-hidden="true" />
        </a-button>
        <form
          v-show="formVisible"
          :id="id + '-form'"
          class="report-filter-form"
          :aria-label="t('inventoryReport.filters')"
          @submit.prevent="submit"
        >
          <div class="report-field report-field--warehouse">
            <label :for="id + '-warehouse'">{{ t('reports.warehouse') }}</label>
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
          <div
            v-if="can('PRODUCT_VIEW')"
            class="report-field report-field--product"
            role="group"
            :aria-labelledby="id + '-product-label'"
          >
            <span :id="id + '-product-label'">{{ t('reports.product') }}</span>
            <ProductSelect v-model:value="filters.productId" />
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
        </form>
        <p class="report-scope">{{ t('lowStockReport.scopeNote') }}</p>
        <aside class="report-note" :aria-label="t('inventoryReport.dataMeaning')">
          <p class="report-pair-count">
            <span class="report-note-icon"><InboxOutlined aria-hidden="true" /></span>
            <strong>{{ t('lowStockReport.pairCount', { total: totalText }) }}</strong>
          </p>
          <p class="report-shortage-note">
            <span class="report-note-icon"><InfoCircleFilled aria-hidden="true" /></span>
            <span>{{ t('lowStockReport.shortageNote') }}</span>
          </p>
        </aside>
      </div>

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
        :row-key="(row: LowStockRow) => row.warehouseId + ':' + row.productId"
        :loading="loading"
        :error="error"
        :total="total"
        :page="appliedFilters.page"
        :page-size="appliedFilters.pageSize"
        :reset-key="scrollRevision"
        :row-height="44"
        :list-title="t('lowStockReport.detail')"
        :total-label="t('lowStockReport.results', { total: totalText })"
        :range-label="rangeLabel"
        @reload="load"
        @page-change="changePage"
      >
        <template #bodyCell="{ column, record, text }">
          <span
            v-if="column.key === 'warehouse'"
            class="report-name"
            :title="record.warehouseCode + ' — ' + record.warehouseName"
            >{{ record.warehouseCode }} — {{ record.warehouseName }}</span
          >
          <span
            v-else-if="column.key === 'product'"
            class="report-name"
            :title="record.productCode + ' — ' + record.productName"
            >{{ record.productCode }} — {{ record.productName }}</span
          >
          <template v-else-if="column.key === 'unit'">{{ record.unit }}</template>
          <span
            v-else
            class="report-quantity"
            :class="{
              'report-zero': column.key === 'quantity' && (text === 0 || text === 0n),
              'report-shortage': column.key === 'shortageQuantity',
            }"
            >{{ reportValue(text) }}</span
          >
        </template>
      </FittedListTable>
    </section>
  </a-config-provider>
</template>

<style scoped>
.low-stock-report {
  display: flex;
  flex: 1;
  flex-direction: column;
  gap: 14px;
  min-width: 0;
  min-height: 0;
  color: #211940;
}
.report-overview {
  flex-shrink: 0;
  min-width: 0;
  padding: 24px;
  border: 1px solid #ece7f8;
  border-radius: 12px;
  background: #fff;
}
.report-heading {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 24px;
}
.report-heading > div {
  min-width: 0;
  flex: 1 1 280px;
}
.report-heading h1 {
  margin: 0;
  color: #171331;
  font-size: 28px;
  font-weight: 700;
  line-height: 1.3;
}
.report-heading p {
  margin: 4px 0 0;
  color: #797093;
  font-size: 16px;
}
.report-export {
  flex-shrink: 0;
  font-weight: 600;
}
.report-export .anticon {
  color: #128452;
  font-size: 20px;
}
.report-filter-form {
  display: flex;
  flex-wrap: wrap;
  align-items: flex-end;
  gap: 16px;
}
.report-field {
  display: flex;
  flex: 1 1 240px;
  flex-direction: column;
  gap: 6px;
  min-width: 0;
  max-width: 420px;
}
.report-field > label,
.report-field > span {
  font-size: 14px;
  font-weight: 600;
}
.report-field > :deep(.ant-select),
.report-field > div {
  width: 100%;
  min-width: 0;
}
.report-field :deep(.ant-select-selector) {
  min-height: 32px;
}
.report-field :deep(.ant-select-selection-item) {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.report-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 12px;
}
.report-search,
.report-reset {
  min-width: 124px;
}
.report-search {
  box-shadow: 0 3px 8px #7c3aed20;
}
.report-reset {
  color: #7c3aed;
  border-color: #cbb8f5;
}
.report-scope {
  margin: 12px 0 20px;
  color: #797093;
}
.report-note {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 12px 24px;
  padding: 12px 16px;
  border-radius: 8px;
  background: #f4efff;
}
.report-note p {
  display: flex;
  align-items: center;
  gap: 12px;
  margin: 0;
  min-width: 0;
  line-height: 1.5;
}
.report-pair-count {
  flex: 0 1 auto;
}
.report-shortage-note {
  flex: 1 1 360px;
}
.report-note-icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex: 0 0 36px;
  height: 36px;
  border-radius: 8px;
  background: #e5d9ff;
  color: #7c3aed;
  font-size: 21px;
}
.report-shortage-note .report-note-icon {
  color: #ed9000;
  background: #fff3dc;
}
.low-stock-report > .ant-alert {
  flex-shrink: 0;
}
.report-error-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}
.report-table {
  min-height: 360px;
  grid-template-rows: auto minmax(150px, 1fr) auto;
}
.report-name {
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
  overflow-wrap: anywhere;
}
.report-quantity {
  white-space: nowrap;
  font-variant-numeric: tabular-nums;
}
.report-zero {
  color: #dc2626;
}
.report-shortage {
  display: inline-block;
  min-width: 36px;
  padding: 2px 10px;
  border-radius: 10px;
  color: #b65e00;
  background: #fff0ce;
}
.report-table :deep(.products-toolbar h2) {
  color: #171331;
  font-size: 20px;
  font-weight: 700;
}
.report-table :deep(.products-total) {
  padding: 2px 10px;
  border-radius: 16px;
  color: #6d28d9;
  background: #f0e9ff;
  font-weight: 600;
}
.report-table :deep(.products-toolbar > div) {
  min-width: 0;
}
.report-table :deep(.products-toolbar > .ant-btn) {
  flex-shrink: 0;
}
.report-table :deep(.products-table-region) {
  margin-inline: 16px;
}
.report-table :deep(.ant-table-thead > tr > th) {
  color: #211940;
  background: #f4efff;
  font-size: 14px;
}
.report-mobile-toggle {
  display: flex;
  justify-content: center;
  align-items: center;
  gap: 8px;
  width: 100%;
  color: #7c3aed;
  border-color: #b99af4;
  font-weight: 600;
}
@media (max-width: 767px) {
  .report-table {
    min-height: 400px;
  }
  .report-overview {
    padding: 16px;
  }
  .report-heading {
    gap: 12px;
    margin-bottom: 16px;
  }
  .report-heading > div {
    flex-basis: 180px;
  }
  .report-heading h1 {
    font-size: 22px;
  }
  .report-heading p {
    font-size: 14px;
  }
  .report-export {
    padding-inline: 12px;
  }
  .report-filter-form {
    display: grid;
    grid-template-columns: minmax(0, 1fr);
    gap: 12px;
    padding-top: 12px;
  }
  .report-field {
    max-width: none;
  }
  .report-field :deep(.ant-select) {
    min-width: 0 !important;
  }
  .report-field :deep(.ant-select-selector) {
    min-height: 40px;
  }
  .report-actions {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 10px;
  }
  .report-actions > .ant-btn {
    min-width: 0;
    padding-inline: 8px;
  }
  .report-reset {
    order: -1;
  }
  .report-scope {
    margin-block: 12px;
    font-size: 13px;
  }
  .report-note {
    flex-direction: column;
    align-items: stretch;
    gap: 8px;
    padding: 12px;
    font-size: 13px;
  }
  .report-note p {
    flex: none;
    gap: 10px;
  }
  .report-note-icon {
    flex-basis: 30px;
    height: 30px;
    font-size: 18px;
  }
  .report-table :deep(.products-table-region) {
    margin-inline: 10px;
  }
  .report-table :deep(.products-toolbar) {
    padding-inline: 12px;
  }
  .report-table :deep(.products-toolbar h2) {
    font-size: 18px;
  }
  .low-stock-report :deep(.ant-btn),
  .report-table :deep(.ant-pagination-item-link) {
    min-height: 44px;
    min-width: 44px;
  }
  .report-table :deep(.list-page-size .ant-select-selector) {
    min-height: 44px;
    align-items: center;
  }
}
</style>
