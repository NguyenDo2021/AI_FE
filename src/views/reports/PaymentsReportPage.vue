<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, reactive, ref, useId, watch } from 'vue'
import { useMediaQuery } from '@vueuse/core'
import { useI18n } from 'vue-i18n'
import { message, type TableColumnsType } from 'ant-design-vue'
import {
  AccountBookOutlined,
  FileTextOutlined,
  UndoOutlined,
  DownOutlined,
  FileExcelOutlined,
  FilterOutlined,
  InfoCircleFilled,
  ReloadOutlined,
  SearchOutlined,
  UpOutlined,
} from '@ant-design/icons-vue'
import FittedListTable from '@/components/catalog/FittedListTable.vue'
import { useSalesScope } from '@/composables/useSalesScope'
import { getReport } from '@/api/reports/reports.api'
import { getReportExport } from '@/api/reports/reportExport.api'
import type { PaymentSummary, WarehouseFields, ReportPeriod, ReportFilters } from '@/types/reports'
import { reportError, reportQuery, reportRange, reportValue, paymentMetrics } from '@/utils/reports'
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
const detailOpen = reactive({ receipts: true, refunds: true })
const root = ref<HTMLElement>()
const pageMaxWidth = ref<number>()
const overview = ref<HTMLElement>()
const tableBodyMaxHeight = ref(240)
const defaults = (): ReportFilters => ({
  warehouseId: undefined,
  ...reportRange('month'),
  page: 1,
  pageSize: 10,
})
const filters = reactive(defaults())
// Draft edits never change the query used by pagination, reload, or export.
const appliedFilters = ref<ReportFilters>(defaults())
type PaymentRow = PaymentSummary & WarehouseFields
const rows = ref<PaymentRow[]>([])
const payments = ref<PaymentSummary>()
const period = ref<ReportPeriod>()
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
const authorized = computed(() => !!auth.user && can('REPORT_PAYMENT_VIEW'))
const options = computed(() =>
  warehouses.warehouses.map((item) => ({
    value: item.id,
    label: `${item.code} — ${item.name}${item.status === 0 ? ' (' + t('common.inactive') + ')' : ''}`,
  })),
)
const rangeLabel = computed(() => {
  if (!ready.value) return '—'
  const { page, pageSize } = appliedFilters.value
  return t('paymentsReport.range', {
    from: total.value ? (page - 1) * pageSize + 1 : 0,
    to: Math.min(page * pageSize, total.value),
    total: total.value,
  })
})
const primaryMetrics = [
  { key: 'netRecordedAmount', icon: FileTextOutlined },
  { key: 'netRefundedAmount', icon: UndoOutlined },
  { key: 'netCashFlowAmount', icon: AccountBookOutlined },
] as const
const detailGroups = [
  {
    key: 'receipts',
    metrics: [
      'createdPaymentCount',
      'cancelledPaymentCount',
      'recordedCashAmount',
      'recordedBankTransferAmount',
      'reversedCashAmount',
      'reversedBankTransferAmount',
      'netCashAmount',
      'netBankTransferAmount',
    ],
  },
  {
    key: 'refunds',
    metrics: [
      'createdRefundCount',
      'cancelledRefundCount',
      'recordedRefundCashAmount',
      'recordedRefundBankTransferAmount',
      'reversedRefundCashAmount',
      'reversedRefundBankTransferAmount',
      'netRefundedCashAmount',
      'netRefundedBankTransferAmount',
    ],
  },
] as const
const metricValue = (key: keyof PaymentSummary): string =>
  reportValue(payments.value?.[key], key.endsWith('Amount'))
const scopeLabel = computed(
  () =>
    options.value.find((option) => option.value === appliedFilters.value.warehouseId)?.label ||
    t('reports.allWarehouses'),
)
const displayDate = (value: string): string => {
  const match = /^(\d{4}-\d{2}-\d{2})/.exec(value)
  return match ? match[1]!.split('-').reverse().join('/') : value
}
const columns = computed<TableColumnsType<PaymentRow>>(() => [
  { title: t('reports.warehouse'), key: 'warehouse', width: 230 },
  ...paymentMetrics.map((key) => ({
    title: t('reports.' + key),
    key,
    dataIndex: key,
    width: Math.max(
      160,
      ...rows.value.map((row) => reportValue(row[key], key.endsWith('Amount')).length * 8 + 32),
    ),
    align: 'right' as const,
  })),
])
const clear = (): void => {
  rows.value = []
  payments.value = undefined
  period.value = undefined
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
    const result = await getReport('payments', snapshot)
    if (current !== sequence) return
    payments.value = result.summary
    period.value = result.period
    rows.value = result.items
    total.value = result.total
    ready.value = true
  } catch (cause) {
    if (current !== sequence) return
    clear()
    error.value = reportError(cause)
    if (
      ['INVALID_DATE_RANGE', 'REPORT_PERIOD_TOO_LARGE'].includes(
        (cause as NormalizedApiError | undefined)?.code ?? '',
      )
    ) {
      validationError.value = error.value
      if (mobile.value) mobileOpen.value = true
    }
    if ((cause as NormalizedApiError | undefined)?.code === 'WAREHOUSE_ACCESS_DENIED') {
      cancelExport()
      ++sequence
      scopeRefreshing = true
      loading.value = false
      filters.warehouseId = undefined
      appliedFilters.value = { ...appliedFilters.value, warehouseId: undefined, page: 1 }
      try {
        await refreshScope()
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
    page: 1,
    pageSize: appliedFilters.value.pageSize,
  }
  validationError.value = ''
  try {
    reportQuery('payments', snapshot)
  } catch (cause) {
    validationError.value = reportError(cause)
    // Date fields are all visible on desktop and in the open mobile form.
    if (mobile.value) mobileOpen.value = true
    return
  }
  appliedFilters.value = snapshot
  cancelExport()
  void load()
}
const reset = (): void => {
  cancelExport()
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
    exportError.value = t('paymentsReport.waitBeforeExport')
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
    exportQuery('payments', snapshot)
    const result = await getReportExport('payments', snapshot, controller.signal)
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

// Bound this report to the usable viewport, including on systems where the
// global body's 320px minimum is wider than a 320px viewport minus its scrollbar.
// Observe the overview's size and the parent's width, not table-driven height.
let layoutObserver: ResizeObserver | undefined
let layoutFrame = 0
let disposed = false
const measureTable = (): void => {
  if (disposed || !overview.value || !root.value?.parentElement) return
  const parent = root.value.parentElement
  const padding = getComputedStyle(parent)
  const available = Math.floor(
    Math.max(
      0,
      Math.min(
        parent.clientWidth - parseFloat(padding.paddingLeft) - parseFloat(padding.paddingRight),
        document.documentElement.clientWidth -
          root.value.getBoundingClientRect().left -
          parseFloat(padding.paddingRight),
      ),
    ),
  )
  if (pageMaxWidth.value !== available) pageMaxWidth.value = available
  const bounds = overview.value.getBoundingClientRect()
  const tableTop = bounds.bottom + window.scrollY + 12
  const viewportHeight = window.visualViewport?.height ?? window.innerHeight
  const next = Math.round(Math.max(180, Math.min(420, viewportHeight - tableTop - 120)))
  if (tableBodyMaxHeight.value !== next) tableBodyMaxHeight.value = next
}
const scheduleMeasure = (): void => {
  if (disposed) return
  cancelAnimationFrame(layoutFrame)
  layoutFrame = requestAnimationFrame(measureTable)
}
onMounted(async () => {
  await nextTick()
  if (disposed || !overview.value) return
  let parentWidth = -1
  layoutObserver = new ResizeObserver((entries) => {
    for (const entry of entries) {
      if (entry.target === overview.value || entry.contentRect.width !== parentWidth)
        scheduleMeasure()
      if (entry.target !== overview.value) parentWidth = entry.contentRect.width
    }
  })
  layoutObserver.observe(overview.value)
  if (root.value?.parentElement) layoutObserver.observe(root.value.parentElement)
  window.addEventListener('resize', scheduleMeasure)
  window.visualViewport?.addEventListener('resize', scheduleMeasure)
  measureTable()
})
onBeforeUnmount(() => {
  disposed = true
  layoutObserver?.disconnect()
  if (typeof window === 'undefined') return
  cancelAnimationFrame(layoutFrame)
  window.removeEventListener('resize', scheduleMeasure)
  window.visualViewport?.removeEventListener('resize', scheduleMeasure)
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
      components: { DatePicker: { controlHeightSM: 24, controlHeightLG: 40 } },
    }"
  >
    <section
      ref="root"
      class="payments-report"
      :style="{ maxWidth: pageMaxWidth === undefined ? undefined : pageMaxWidth + 'px' }"
    >
      <div ref="overview" class="report-top">
        <header class="report-heading">
          <div>
            <h1>{{ t('paymentsReport.title') }}</h1>
            <p>{{ t('paymentsReport.description') }}</p>
          </div>
          <a-button
            v-if="authorized"
            class="report-export"
            :loading="exportLoading"
            :disabled="exportLoading || loading || !ready"
            :title="t('salesReport.exportHint')"
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
            <span>{{ t('salesReport.filters') }}</span>
            <UpOutlined v-if="mobileOpen" aria-hidden="true" />
            <DownOutlined v-else aria-hidden="true" />
          </a-button>
          <form
            v-show="formVisible"
            :id="id + '-form'"
            class="report-filter-form"
            :aria-label="t('salesReport.filters')"
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
            <div class="report-field report-field--from">
              <label :for="id + '-from'">{{ t('reports.from') }}</label>
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
              <label :for="id + '-to'">{{ t('reports.to') }}</label>
              <a-date-picker
                :id="id + '-to'"
                v-model:value="filters.to"
                value-format="YYYY-MM-DD"
                format="DD/MM/YYYY"
                :status="validationError ? 'error' : undefined"
                :aria-invalid="!!validationError"
                :aria-describedby="validationError ? id + '-validation' : undefined"
                :placeholder="t('reports.to')"
                :title="t('salesReport.inclusiveEnd')"
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
              {{ t(expanded ? 'salesReport.collapse' : 'salesReport.expand') }}
              <UpOutlined v-if="expanded" aria-hidden="true" />
              <DownOutlined v-else aria-hidden="true" />
            </a-button>
            <div v-show="extraVisible" :id="id + '-extra'" class="report-extra">
              <div class="report-presets" role="group" :aria-label="t('salesReport.quickDates')">
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
            <p
              v-if="validationError"
              :id="id + '-validation'"
              class="report-validation"
              role="alert"
            >
              {{ validationError }}
            </p>
          </form>
        </div>

        <div class="report-period" :aria-busy="loading">
          <span v-if="ready && period" class="report-period-dates">
            {{ displayDate(period.from) }} – {{ displayDate(period.to) }} · {{ period.timezone }}
          </span>
          <span v-else>{{ loading ? t('reports.loading') : '—' }}</span>
          <span v-if="ready" class="report-scope">
            {{ scopeLabel }} · {{ t('paymentsReport.scopeNote') }}
          </span>
        </div>

        <div class="report-metrics" :aria-busy="loading" aria-live="polite">
          <div class="primary-metrics">
            <article
              v-for="metric in primaryMetrics"
              :key="metric.key"
              class="metric-card"
              :class="{ 'metric-card--net': metric.key === 'netCashFlowAmount' }"
            >
              <span class="metric-icon"><component :is="metric.icon" aria-hidden="true" /></span>
              <div>
                <h2>{{ t('reports.' + metric.key) }}</h2>
                <p :data-metric="metric.key">{{ metricValue(metric.key) }}</p>
              </div>
            </article>
          </div>
          <div class="detail-panels">
            <section
              v-for="group in detailGroups"
              :key="group.key"
              class="detail-panel"
              :class="'detail-panel--' + group.key"
            >
              <h2 v-if="!mobile">{{ t('paymentsReport.' + group.key) }}</h2>
              <button
                v-else
                class="detail-toggle"
                type="button"
                :aria-expanded="detailOpen[group.key]"
                :aria-controls="id + '-' + group.key"
                @click="detailOpen[group.key] = !detailOpen[group.key]"
              >
                <span>{{ t('paymentsReport.' + group.key) }}</span>
                <UpOutlined v-if="detailOpen[group.key]" aria-hidden="true" />
                <DownOutlined v-else aria-hidden="true" />
              </button>
              <dl v-show="!mobile || detailOpen[group.key]" :id="id + '-' + group.key">
                <div v-for="key in group.metrics" :key="key">
                  <dt>{{ t('reports.' + key) }}</dt>
                  <dd :data-metric="key">{{ metricValue(key) }}</dd>
                </div>
              </dl>
            </section>
          </div>
        </div>

        <aside class="report-note" :aria-label="t('salesReport.dataMeaning')">
          <InfoCircleFilled aria-hidden="true" />
          <span>{{ t('paymentsReport.note') }}</span>
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
      </div>

      <FittedListTable
        class="report-table"
        :columns="columns"
        :rows="rows"
        :row-key="(row: PaymentRow) => row.warehouseId"
        :loading="loading"
        :error="error"
        :total="total"
        :page="appliedFilters.page"
        :page-size="appliedFilters.pageSize"
        :reset-key="scrollRevision"
        :row-height="40"
        :body-max-height="tableBodyMaxHeight"
        :list-title="t('paymentsReport.detail')"
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
            >{{ record.warehouseCode }} — {{ record.warehouseName }}</span
          >
          <span v-else class="report-quantity">{{
            reportValue(text, String(column.key).endsWith('Amount'))
          }}</span>
        </template>
      </FittedListTable>
    </section>
  </a-config-provider>
</template>

<style scoped>
.payments-report {
  display: flex;
  flex-direction: column;
  gap: 12px;
  min-width: 0;
  color: #25203d;
}
.report-top {
  display: flex;
  flex-direction: column;
  gap: 12px;
  min-width: 0;
}
.report-heading {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}
.report-heading > div {
  min-width: 0;
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
  color: #5c527d;
  font-size: 16px;
}
.report-export {
  flex-shrink: 0;
}
.report-export .anticon {
  color: #7c3aed;
}
.report-filter-panel {
  min-width: 0;
  padding: 16px;
  border: 1px solid #ece7f8;
  border-radius: 12px;
  background: #fff;
}
.report-filter-form {
  display: flex;
  flex-wrap: wrap;
  align-items: flex-end;
  gap: 14px;
}
.report-field {
  display: flex;
  flex: 1 1 150px;
  flex-direction: column;
  gap: 6px;
  min-width: 0;
}
.report-field--warehouse {
  flex: 1.6 1 240px;
}
.report-field label {
  font-size: 14px;
  font-weight: 600;
}
.report-field > :deep(.ant-select),
.report-field > :deep(.ant-picker) {
  width: 100%;
  min-width: 0;
}
.report-field :deep(.ant-picker),
.report-field :deep(.ant-select-selector) {
  min-height: 32px;
}
.report-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 12px;
}
.report-search,
.report-reset {
  min-width: 120px;
}
.report-search {
  box-shadow: 0 3px 8px #7c3aed20;
}
.report-reset {
  color: #7c3aed;
  border-color: #cbb8f5;
}
.report-expand {
  color: #7c3aed;
}
.report-extra {
  flex-basis: 100%;
  min-width: 0;
  border-top: 1px solid #eee8fa;
  padding-top: 14px;
}
.report-presets {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
}
.report-presets .ant-btn {
  min-width: 100px;
}
.report-validation {
  flex-basis: 100%;
  margin: 0;
  color: #c03948;
}
.report-mobile-toggle {
  display: flex;
  align-items: center;
  gap: 8px;
  color: #5b21b6;
}
.report-period {
  display: flex;
  flex-direction: column;
  gap: 3px;
  padding-inline: 4px;
  color: #5c527d;
  font-size: 13px;
  overflow-wrap: anywhere;
}
.report-metrics {
  min-width: 0;
}
.primary-metrics {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 14px;
}
.metric-card {
  display: flex;
  align-items: center;
  gap: 14px;
  min-width: 0;
  padding: 18px;
  border: 1px solid #ece7f8;
  border-radius: 12px;
  background: #fff;
}
.metric-card--net {
  background: #f4efff;
  border-color: #e2d6ff;
}
.metric-icon {
  display: grid;
  place-items: center;
  flex: 0 0 48px;
  height: 48px;
  border-radius: 50%;
  color: #7c3aed;
  background: #eee7ff;
  font-size: 25px;
}
.metric-card > div {
  min-width: 0;
}
.metric-card h2 {
  margin: 0;
  font-size: 14px;
  font-weight: 500;
  line-height: 1.5;
}
.metric-card p {
  margin: 4px 0 0;
  color: #6d28d9;
  font-size: clamp(24px, 2vw, 30px);
  font-weight: 700;
  line-height: 1.3;
  font-variant-numeric: tabular-nums;
  overflow-wrap: anywhere;
}
.detail-panels {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  align-items: start;
  gap: 16px;
  margin-top: 14px;
}
.detail-panel {
  min-width: 0;
  border: 1px solid #ece7f8;
  border-radius: 12px;
  background: #fff;
}
.detail-panel h2,
.detail-toggle {
  margin: 0;
  padding: 12px 20px;
  border-radius: 12px 12px 0 0;
  color: #211940;
  background: #f5f1ff;
  font-size: 16px;
  font-weight: 600;
  line-height: 1.5;
}
.detail-toggle {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  width: 100%;
  min-height: 44px;
  border: 0;
  text-align: left;
  cursor: pointer;
  font-family: inherit;
}
.detail-toggle:focus-visible {
  outline: 2px solid #7c3aed;
  outline-offset: 2px;
}
.detail-panel dl {
  margin: 0;
  padding: 4px 20px 8px;
}
.detail-panel dl > div {
  display: flex;
  flex-wrap: wrap;
  align-items: baseline;
  justify-content: space-between;
  gap: 4px 12px;
  min-width: 0;
  padding: 8px 0;
}
.detail-panel dl > div + div {
  border-top: 1px solid #f0edf5;
}
.detail-panel dt {
  flex: 1 1 160px;
  min-width: 0;
  line-height: 1.5;
}
.detail-panel dd {
  max-width: 100%;
  margin: 0 0 0 auto;
  text-align: right;
  font-variant-numeric: tabular-nums;
  overflow-wrap: anywhere;
}
.report-note {
  display: flex;
  align-items: flex-start;
  gap: 12px;
  min-width: 0;
  padding: 10px 14px;
  border: 1px solid #ece7f8;
  border-radius: 10px;
  background: #f7f3ff;
  color: #706388;
  font-size: 13px;
  line-height: 1.6;
}
.report-note .anticon {
  flex-shrink: 0;
  margin-top: 2px;
  color: #7c3aed;
  font-size: 18px;
}
.report-error-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}
.report-table {
  flex: none;
  min-width: 0;
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
.report-table :deep(.products-table-region) {
  margin-inline: 12px;
}
.report-table :deep(.ant-table-thead > tr > th) {
  color: #29203f;
  background: #f2edff;
  font-size: 14px;
}
.report-table :deep(.products-toolbar > div) {
  min-width: 0;
}
.report-table :deep(.products-toolbar > .ant-btn) {
  flex-shrink: 0;
}
.report-table :deep(.products-total:empty) {
  display: none;
}
@container workspace (max-width: 900px) {
  .detail-panels {
    grid-template-columns: minmax(0, 1fr);
  }
  .primary-metrics {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}
@media (max-width: 767px) {
  .report-field :deep(.ant-picker),
  .report-field :deep(.ant-select-selector) {
    min-height: 40px;
  }
  .report-heading > div {
    flex: 1 1 180px;
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
  .report-filter-panel {
    padding: 0;
    border: 0;
    background: transparent;
  }
  .report-mobile-toggle {
    min-height: 44px;
  }
  .report-filter-form {
    display: grid;
    grid-template-columns: minmax(0, 1fr);
    gap: 12px;
    margin-top: 12px;
    padding: 12px;
    border: 1px solid #ece7f8;
    border-radius: 12px;
    background: #fff;
  }
  .report-field--warehouse {
    order: 0;
  }
  .report-field--from {
    order: 1;
  }
  .report-field--to {
    order: 2;
  }
  .report-extra {
    order: 3;
    border: 0;
    padding: 0;
  }
  .report-validation {
    order: 4;
  }
  .report-actions {
    order: 5;
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 8px;
  }
  .report-actions .ant-btn {
    min-width: 0;
    padding-inline: 8px;
  }
  .report-reset {
    order: -1;
  }
  .report-presets {
    gap: 8px;
  }
  .report-presets .ant-btn {
    flex: 1 1 auto;
    min-width: 0;
    padding-inline: 10px;
  }
  .primary-metrics,
  .detail-panels {
    grid-template-columns: minmax(0, 1fr);
    gap: 10px;
  }
  .metric-card {
    padding: 12px;
    gap: 12px;
  }
  .metric-icon {
    flex-basis: 40px;
    height: 40px;
    font-size: 22px;
  }
  .metric-card h2 {
    font-size: 13px;
  }
  .metric-card p {
    font-size: 22px;
  }
  .detail-panel dl {
    padding-inline: 12px;
  }
  .detail-panel dt,
  .detail-panel dd {
    font-size: 13px;
  }
  .detail-panel dt {
    flex-basis: 140px;
  }
  .detail-toggle {
    padding: 10px 12px;
    font-size: 14px;
  }
  .report-note {
    padding: 10px 12px;
  }
  .payments-report :deep(.ant-btn),
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
