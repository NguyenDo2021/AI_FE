<script setup lang="ts">
import { computed, onBeforeUnmount, reactive, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { message, type TableColumnsType } from 'ant-design-vue'
import { getReportExport } from '@/api/reports/reportExport.api'
import { canExportReport, exportQuery, reportExportError } from '@/utils/reportExport'
import { downloadBlob } from '@/utils/paymentReceipt'
import type { NormalizedApiError } from '@/utils/request'
import BasicTable from '@/components/BasicTable/BasicTable.vue'
import ProductSelect from '@/components/stock/ProductSelect.vue'
import { useSalesScope } from '@/composables/useSalesScope'
import { getReport } from '@/api/reports/reports.api'
import type {
  DashboardReport,
  InventoryReportRow,
  LowStockRow,
  ReportKind,
  ReportFilters,
  SalesSummary,
  PaymentSummary,
  ReceivablesSummary,
  ReportPeriod,
  WarehouseFields,
} from '@/types/reports'
import {
  hasReportPeriod,
  hasReportProducts,
  isPagedReport,
  reportPermission,
  reportRange,
  reportError,
  reportValue,
  inventoryMetrics,
  salesMetrics,
  paymentMetrics,
  receivableMetrics,
  lowStockMetrics,
} from '@/utils/reports'
const props = defineProps<{ kind: ReportKind }>()
const { t } = useI18n()
const { auth, warehouses, can, scopeKey, refreshScope } = useSalesScope()
const filters = reactive({
  warehouseId: undefined as string | undefined,
  productId: undefined as string | undefined,
  ...reportRange('month'),
  page: 1,
  pageSize: 10,
})
type Row =
  | InventoryReportRow
  | LowStockRow
  | (SalesSummary & WarehouseFields)
  | (PaymentSummary & WarehouseFields)
const rows = ref<Row[]>([])
const total = ref(0)
const dashboard = ref<DashboardReport>()
const sales = ref<SalesSummary>()
const payments = ref<PaymentSummary>()
const receivables = ref<ReceivablesSummary>()
const period = ref<ReportPeriod>()
const loading = ref(false)
const ready = ref(false)
const appliedFilters = ref<ReportFilters>()
const exportLoading = ref(false)
const exportError = ref('')
let exportSequence = 0
let exportAbort: AbortController | undefined
const cancelExport = (): void => {
  ++exportSequence
  exportAbort?.abort()
  exportAbort = undefined
  exportLoading.value = false
  exportError.value = ''
}
const error = ref('')
let sequence = 0
let scopeRefreshing = false
const clear = (): void => {
  rows.value = []
  total.value = 0
  dashboard.value = undefined
  sales.value = undefined
  payments.value = undefined
  receivables.value = undefined
  period.value = undefined
  ready.value = false
  appliedFilters.value = undefined
}
const options = computed(() =>
  warehouses.warehouses.map((item) => ({
    value: item.id,
    label: `${item.code} — ${item.name}${item.status === 0 ? ' (' + t('common.inactive') + ')' : ''}`,
  })),
)
const authorized = computed(() => !!auth.user && can(reportPermission[props.kind]))
const load = async (): Promise<void> => {
  const current = ++sequence
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
  if (
    filters.warehouseId &&
    !warehouses.warehouses.some((item) => item.id === filters.warehouseId)
  ) {
    filters.warehouseId = undefined
    return
  }
  loading.value = true
  try {
    const snapshot = { ...filters, productId: can('PRODUCT_VIEW') ? filters.productId : undefined }
    // Narrow each endpoint's response without manufacturing absent fields.
    if (props.kind === 'dashboard') {
      const result = await getReport('dashboard', snapshot)
      if (current !== sequence) return
      dashboard.value = result
      period.value = result.period
    } else if (props.kind === 'receivables-summary') {
      const result = await getReport('receivables-summary', snapshot)
      if (current !== sequence) return
      receivables.value = result
    } else if (props.kind === 'sales') {
      const result = await getReport('sales', snapshot)
      if (current !== sequence) return
      rows.value = result.items
      total.value = result.total
      sales.value = result.summary
      period.value = result.period
    } else if (props.kind === 'payments') {
      const result = await getReport('payments', snapshot)
      if (current !== sequence) return
      rows.value = result.items
      total.value = result.total
      payments.value = result.summary
      period.value = result.period
    } else {
      const result = await getReport(props.kind, snapshot)
      if (current !== sequence) return
      rows.value = result.items
      total.value = result.total
    }
    appliedFilters.value = snapshot
    ready.value = true
  } catch (cause) {
    if (current !== sequence) return
    clear()
    error.value = reportError(cause)
    if ((cause as { code?: string })?.code === 'WAREHOUSE_ACCESS_DENIED') {
      ++sequence
      scopeRefreshing = true
      loading.value = false
      filters.warehouseId = undefined
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
const exportExcel = async (): Promise<void> => {
  if (exportLoading.value || !authorized.value || !canExportReport(props.kind)) return
  exportError.value = ''
  const kind = props.kind
  const snapshot = appliedFilters.value && { ...appliedFilters.value }
  try {
    const draft = { ...filters, productId: can('PRODUCT_VIEW') ? filters.productId : undefined }
    const draftQuery = exportQuery(kind, draft)
    if (
      !snapshot ||
      !ready.value ||
      loading.value ||
      JSON.stringify(draftQuery) !== JSON.stringify(exportQuery(kind, snapshot))
    ) {
      exportError.value = t('reports.applyBeforeExport')
      return
    }
  } catch (cause) {
    exportError.value = reportExportError(cause)
    return
  }
  if (!snapshot || !warehouses.loaded || warehouses.ownerId !== auth.user?.id) return
  const current = ++exportSequence
  const userId = auth.user?.id
  const context = scopeKey.value
  const controller = new AbortController()
  exportAbort = controller
  exportLoading.value = true
  try {
    const result = await getReportExport(kind, snapshot, controller.signal)
    if (
      current !== exportSequence ||
      controller.signal.aborted ||
      auth.user?.id !== userId ||
      scopeKey.value !== context ||
      props.kind !== kind ||
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
      if (auth.user?.id === userId && props.kind === kind) exportError.value = denial
    }
  } finally {
    if (current === exportSequence) {
      exportLoading.value = false
      exportAbort = undefined
    }
  }
}
const reloadScope = async (): Promise<void> => {
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
const preset = (value: 'today' | 'month' | 'previous'): void => {
  Object.assign(filters, reportRange(value))
}
const changePage = (page: number, size: number): void => {
  filters.page = size !== filters.pageSize ? 1 : page
  filters.pageSize = size
  void load()
}
const metrics = computed(() =>
  props.kind === 'inventory'
    ? inventoryMetrics
    : props.kind === 'sales'
      ? salesMetrics
      : props.kind === 'payments'
        ? paymentMetrics
        : lowStockMetrics,
)
const columns = computed<TableColumnsType<Row>>(() => {
  const result: TableColumnsType<Row> = [
    { title: t('reports.warehouse'), key: 'warehouse', width: 230, fixed: 'left' },
  ]
  if (hasReportProducts(props.kind)) {
    result.push(
      { title: t('reports.product'), key: 'product', width: 250, fixed: 'left' },
      { title: t('reports.unit'), key: 'unit', width: 100 },
    )
    if (props.kind === 'inventory')
      result.push({ title: t('reports.productStatus'), key: 'productStatus', width: 150 })
  }
  for (const key of metrics.value)
    result.push({ title: t('reports.' + key), key, dataIndex: key, width: 180, align: 'right' })
  return result
})
const cards = (data: SalesSummary | PaymentSummary | ReceivablesSummary, keys: readonly string[]) =>
  keys.map((key) => ({
    key,
    label: t('reports.' + key),
    value: reportValue((data as unknown as Record<string, unknown>)[key], key.endsWith('Amount')),
  }))
const timestamp = (value?: string): string =>
  value ? new Date(value).toLocaleString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh' }) : '—'
watch(
  () => [props.kind, filters.warehouseId, filters.productId, filters.from, filters.to],
  () => {
    filters.page = 1
    void load()
  },
  { flush: 'sync' },
)
watch(() => props.kind, cancelExport, { flush: 'sync' })
watch(
  scopeKey,
  () => {
    cancelExport()
    ++sequence
    clear()
    if (!can('PRODUCT_VIEW')) filters.productId = undefined
    if (
      filters.warehouseId &&
      !warehouses.warehouses.some((item) => item.id === filters.warehouseId)
    )
      filters.warehouseId = undefined
    filters.page = 1
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
  <section class="reports">
    <h1>{{ t('reports.' + kind) }}</h1>
    <a-form layout="inline" class="filters" @submit.prevent>
      <a-form-item :label="t('reports.warehouse')">
        <a-select
          v-model:value="filters.warehouseId"
          :options="options"
          allow-clear
          :placeholder="t('reports.allWarehouses')"
          :loading="warehouses.loading"
          style="min-width: 260px"
        />
      </a-form-item>
      <a-form-item
        v-if="hasReportProducts(kind) && can('PRODUCT_VIEW')"
        :label="t('reports.product')"
      >
        <ProductSelect v-model:value="filters.productId" />
      </a-form-item>
      <template v-if="hasReportPeriod(kind)">
        <a-form-item :label="t('reports.from')"
          ><a-date-picker
            v-model:value="filters.from"
            value-format="YYYY-MM-DD"
            format="DD/MM/YYYY"
        /></a-form-item>
        <a-form-item :label="t('reports.to')"
          ><a-date-picker v-model:value="filters.to" value-format="YYYY-MM-DD" format="DD/MM/YYYY"
        /></a-form-item>
        <a-space>
          <a-button @click="preset('today')">{{ t('reports.today') }}</a-button>
          <a-button @click="preset('month')">{{ t('reports.month') }}</a-button>
          <a-button @click="preset('previous')">{{ t('reports.previous') }}</a-button>
        </a-space>
      </template>
      <a-button :loading="loading" @click="load">{{ t('common.reload') }}</a-button>
      <a-button
        v-if="canExportReport(kind) && authorized"
        :loading="exportLoading"
        :disabled="exportLoading"
        @click="exportExcel"
        >{{ t('reports.exportExcel') }}</a-button
      >
    </a-form>
    <small>{{ t('reports.scopeNote') }}</small>
    <a-alert v-if="error" type="error" show-icon :message="error">
      <template #description
        ><a-button @click="load">{{ t('reports.retry') }}</a-button
        ><a-button @click="reloadScope">{{ t('reports.refreshScope') }}</a-button></template
      >
    </a-alert>
    <a-alert v-if="exportError" type="error" show-icon :message="exportError" />
    <a-spin v-if="loading" :tip="t('reports.loading')" />
    <template v-if="ready">
      <p v-if="period">{{ period.from }} – {{ period.to }} ({{ period.timezone }})</p>
      <template v-if="dashboard">
        <p>{{ t('reports.generatedAt') }}: {{ timestamp(dashboard.generatedAt) }}</p>
        <template v-if="dashboard.periodSections?.sales || dashboard.periodSections?.payments">
          <h2>{{ t('reports.periodActivity') }}</h2>
          <div v-if="dashboard.periodSections.sales" class="cards">
            <a-card
              v-for="card in cards(dashboard.periodSections.sales, [
                'confirmedOrderCount',
                'cancelledConfirmedOrderCount',
                'returnedSalesAmount',
                'netSalesAmount',
              ])"
              :key="card.key"
              :title="card.label"
              >{{ card.value }}</a-card
            >
          </div>
          <div v-if="dashboard.periodSections.payments" class="cards">
            <a-card
              v-for="card in cards(dashboard.periodSections.payments, [
                'netRecordedAmount',
                'netRefundedAmount',
                'netCashFlowAmount',
                'netCashAmount',
                'netBankTransferAmount',
              ])"
              :key="card.key"
              :title="card.label"
              >{{ card.value }}</a-card
            >
          </div>
          <p v-if="dashboard.periodSections.sales">{{ t('reports.salesNote') }}</p>
          <p v-if="dashboard.periodSections.payments">{{ t('reports.paymentNote') }}</p>
        </template>
        <template
          v-if="
            dashboard.currentSections?.receivables ||
            dashboard.currentSections?.lowStock ||
            (can('REFUND_VIEW') && dashboard.currentSections?.refunds)
          "
        >
          <h2>{{ t('reports.currentData') }}</h2>
          <p>{{ t('reports.currentNote') }}</p>
          <div v-if="dashboard.currentSections.receivables" class="cards">
            <a-card
              v-for="card in cards(dashboard.currentSections.receivables, [
                'customerRemainingAmount',
                'walkInRemainingAmount',
                'totalRemainingAmount',
              ])"
              :key="card.key"
              :title="card.label"
              >{{ card.value }}</a-card
            >
          </div>
          <p v-if="dashboard.currentSections.receivables">
            {{ t('reports.asOf') }}: {{ timestamp(dashboard.currentSections.receivables.asOf) }}
          </p>
          <a-card
            v-if="can('REFUND_VIEW') && dashboard.currentSections.refunds"
            :title="t('sales.refundables')"
          >
            <p>
              {{ t('reports.refundableOrderCount') }}:
              {{ reportValue(dashboard.currentSections.refunds.refundableOrderCount) }}
            </p>
            <p>
              {{ t('reports.refundableAmount') }}:
              {{ reportValue(dashboard.currentSections.refunds.refundableAmount, true) }}
            </p>
            <p>{{ t('reports.asOf') }}: {{ timestamp(dashboard.currentSections.refunds.asOf) }}</p>
            <router-link to="/sales/refundables">{{ t('sales.refundables') }}</router-link>
          </a-card>
          <a-card v-if="dashboard.currentSections.lowStock" :title="t('reports.lowStockPairCount')">
            {{ reportValue(dashboard.currentSections.lowStock.lowStockPairCount) }}
            <p>{{ t('reports.asOf') }}: {{ timestamp(dashboard.currentSections.lowStock.asOf) }}</p>
          </a-card>
        </template>
        <a-empty
          v-if="
            !dashboard.periodSections?.sales &&
            !dashboard.periodSections?.payments &&
            !dashboard.currentSections?.receivables &&
            !dashboard.currentSections?.lowStock &&
            !(can('REFUND_VIEW') && dashboard.currentSections?.refunds)
          "
          :description="t('reports.noSections')"
        />
      </template>
      <div v-if="sales" class="cards">
        <a-card v-for="card in cards(sales, salesMetrics)" :key="card.key" :title="card.label">{{
          card.value
        }}</a-card>
      </div>
      <div v-if="payments" class="cards">
        <a-card
          v-for="card in cards(payments, paymentMetrics)"
          :key="card.key"
          :title="card.label"
          >{{ card.value }}</a-card
        >
      </div>
      <template v-if="receivables">
        <p>{{ t('reports.currentNote') }}</p>
        <div class="cards">
          <a-card
            v-for="card in cards(receivables, receivableMetrics)"
            :key="card.key"
            :title="card.label"
            >{{ card.value }}</a-card
          >
        </div>
        <p>{{ t('reports.asOf') }}: {{ timestamp(receivables.asOf) }}</p>
        <router-link v-if="can('RECEIVABLE_VIEW')" to="/sales/receivables">{{
          t('reports.receivableDetail')
        }}</router-link>
      </template>
      <p v-if="kind === 'inventory'">{{ t('reports.inventoryNote') }}</p>
      <p v-if="kind === 'sales'">{{ t('reports.salesNote') }}</p>
      <p v-if="kind === 'payments'">{{ t('reports.paymentNote') }}</p>
      <p v-if="kind === 'low-stock'">
        {{ t('reports.lowStockNote') }} — {{ t('reports.lowStockPairCount') }}:
        {{ reportValue(total) }}
      </p>
      <BasicTable
        v-if="isPagedReport(kind)"
        :columns="columns"
        :data-source="rows"
        :scroll="{ x: 'max-content' }"
        :row-key="(row: Row) => row.warehouseId + ('productId' in row ? ':' + row.productId : '')"
        :pagination="{
          current: filters.page,
          pageSize: filters.pageSize,
          total,
          showSizeChanger: true,
          pageSizeOptions: ['10', '20', '50', '100'],
        }"
        @page-change="changePage"
        @reload="load"
      >
        <template #bodyCell="{ column, record, text }">
          <template v-if="column.key === 'warehouse'"
            >{{ record.warehouseCode }} — {{ record.warehouseName }}</template
          >
          <template v-else-if="column.key === 'product'"
            >{{ record.productCode }} — {{ record.productName }}</template
          >
          <template v-else-if="column.key === 'unit'">{{
            record.unit === 'cay' ? t('reports.cay') : record.unit
          }}</template>
          <template v-else-if="column.key === 'productStatus'">{{
            record.productStatus === 1 ? t('common.active') : t('common.inactive')
          }}</template>
          <template v-else>{{ reportValue(text, String(column.key).endsWith('Amount')) }}</template>
        </template>
      </BasicTable>
    </template>
  </section>
</template>
<style scoped>
.filters {
  gap: 12px;
  margin-bottom: 12px;
}
.cards {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(240px, 1fr));
  gap: 16px;
  margin: 16px 0;
}
.reports > .ant-alert,
.reports > .ant-spin {
  margin: 16px 0;
}
</style>
