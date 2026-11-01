<script setup lang="ts">
import { computed, onBeforeUnmount, reactive, ref, useId, watch } from 'vue'
import { useMediaQuery } from '@vueuse/core'
import { useI18n } from 'vue-i18n'
import {
  ArrowRightOutlined,
  DownOutlined,
  FileTextOutlined,
  FilterOutlined,
  InfoCircleOutlined,
  ReloadOutlined,
  SearchOutlined,
  SolutionOutlined,
  TeamOutlined,
  UpOutlined,
  WalletOutlined,
} from '@ant-design/icons-vue'
import { getReport } from '@/api/reports/reports.api'
import { useSalesScope } from '@/composables/useSalesScope'
import type { ReceivablesSummary } from '@/types/reports'
import { reportError, reportValue } from '@/utils/reports'
import type { NormalizedApiError } from '@/utils/request'

const { t } = useI18n()
const { auth, warehouses, can, scopeKey, refreshScope } = useSalesScope()
const id = useId()
const mobile = useMediaQuery('(max-width: 767px)')
const mobileOpen = ref(false)
const defaults = () => ({ warehouseId: undefined as string | undefined })
const filters = reactive(defaults())
const appliedFilters = ref(defaults())
const data = ref<ReceivablesSummary>()
// Scope and response are committed together; draft edits never relabel the data.
const displayedWarehouseId = ref<string>()
const loading = ref(false)
const ready = ref(false)
const error = ref('')
let sequence = 0
let scopeRefreshing = false
const authorized = computed(() => !!auth.user && can('REPORT_RECEIVABLE_VIEW'))
const options = computed(() =>
  warehouses.warehouses.map((item) => ({
    value: item.id,
    label: `${item.code} — ${item.name}${item.status === 0 ? ' (' + t('common.inactive') + ')' : ''}`,
  })),
)
const draftWarehouseLabel = computed(
  () =>
    options.value.find((item) => item.value === filters.warehouseId)?.label ||
    t('reports.allWarehouses'),
)
const scopeLabel = computed(
  () =>
    options.value.find((item) => item.value === displayedWarehouseId.value)?.label ||
    t('reports.allWarehouses'),
)
const detailLocation = computed(() => ({
  path: '/sales/receivables',
  // An explicit empty value means all permitted warehouses, even if a working
  // warehouse is selected in the application header.
  query: { warehouseId: displayedWarehouseId.value ?? '' },
}))
const moneyMetrics = [
  { key: 'customerRemainingAmount', icon: TeamOutlined },
  { key: 'walkInRemainingAmount', icon: WalletOutlined },
] as const
const countMetrics = [
  { key: 'customerCount', icon: TeamOutlined },
  { key: 'customerOutstandingOrderCount', icon: FileTextOutlined },
  { key: 'walkInOutstandingOrderCount', icon: FileTextOutlined },
] as const
const metricValue = (key: Exclude<keyof ReceivablesSummary, 'asOf'>): string =>
  reportValue(data.value?.[key], key.endsWith('Amount'))
const timestamp = computed(() =>
  data.value?.asOf
    ? new Date(data.value.asOf).toLocaleString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh' })
    : '—',
)
const clear = (): void => {
  data.value = undefined
  displayedWarehouseId.value = undefined
  ready.value = false
}
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
    // The existing shared client requires paging/date keys in its input type.
    // reportQuery omits all of them for this endpoint: only warehouseId is sent.
    const result = await getReport('receivables-summary', {
      ...snapshot,
      from: '',
      to: '',
      page: 1,
      pageSize: 10,
    })
    if (current !== sequence) return
    data.value = result
    displayedWarehouseId.value = snapshot.warehouseId
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
      appliedFilters.value = defaults()
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
  appliedFilters.value = { ...filters }
  void load()
}
const reset = (): void => {
  Object.assign(filters, defaults())
  submit()
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
watch(
  scopeKey,
  () => {
    ++sequence
    clear()
    const inScope = (warehouseId?: string): boolean =>
      !warehouseId || warehouses.warehouses.some((item) => item.id === warehouseId)
    if (!inScope(filters.warehouseId)) filters.warehouseId = undefined
    if (!inScope(appliedFilters.value.warehouseId)) appliedFilters.value = defaults()
    void load()
  },
  { immediate: true, flush: 'sync' },
)
onBeforeUnmount(() => ++sequence)
</script>

<template>
  <a-config-provider
    :theme="{
      token: {
        colorPrimary: '#7c3aed',
        colorLink: '#7c3aed',
        borderRadius: 8,
        controlHeight: mobile ? 40 : 32,
        controlHeightSM: 24,
        controlHeightLG: 40,
      },
    }"
  >
    <section class="receivables-report" :aria-labelledby="id + '-title'" :aria-busy="loading">
      <header class="report-heading">
        <div>
          <h1 :id="id + '-title'">{{ t('receivablesReport.title') }}</h1>
          <p>{{ t('receivablesReport.description') }}</p>
        </div>
        <a-tooltip :title="t('common.reload')">
          <a-button
            class="report-reload"
            :loading="loading"
            :aria-label="t('common.reload')"
            @click="load"
          >
            <template #icon><ReloadOutlined aria-hidden="true" /></template>
            {{ t('common.reload') }}
          </a-button>
        </a-tooltip>
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
          <span>{{ t('receivablesReport.filters') }}</span>
          <UpOutlined v-if="mobileOpen" class="toggle-arrow" aria-hidden="true" />
          <DownOutlined v-else class="toggle-arrow" aria-hidden="true" />
        </a-button>
        <form
          v-show="!mobile || mobileOpen"
          :id="id + '-form'"
          class="report-filter-form"
          :aria-label="t('receivablesReport.filters')"
          @submit.prevent="submit"
        >
          <div class="report-field">
            <label :for="id + '-warehouse'">{{ t('reports.warehouse') }}</label>
            <a-select
              :id="id + '-warehouse'"
              v-model:value="filters.warehouseId"
              :options="options"
              :loading="warehouses.loading"
              :placeholder="t('reports.allWarehouses')"
              :aria-label="t('reports.warehouse')"
              :title="draftWarehouseLabel"
              :aria-describedby="id + '-scope-note'"
              allow-clear
            />
          </div>
          <div class="report-actions">
            <a-button class="report-search" type="primary" html-type="submit" :loading="loading">
              <template #icon><SearchOutlined aria-hidden="true" /></template>
              {{ t('common.search') }}
            </a-button>
            <a-button class="report-reset" html-type="button" @click="reset">
              {{ t('common.reset') }}
            </a-button>
          </div>
          <p :id="id + '-scope-note'" class="report-scope-note">
            {{ t('receivablesReport.scopeNote') }}
          </p>
        </form>
      </div>

      <a-alert v-if="error" class="report-error" type="error" show-icon :message="error">
        <template #description>
          <div class="report-error-actions">
            <a-button @click="load">{{ t('reports.retry') }}</a-button>
            <a-button @click="reloadScope">{{ t('reports.refreshScope') }}</a-button>
          </div>
        </template>
      </a-alert>

      <div v-if="loading" class="report-loading" role="status" :aria-label="t('reports.loading')">
        <a-skeleton active :paragraph="{ rows: 3 }" />
        <a-skeleton active :paragraph="{ rows: 2 }" />
        <span>{{ t('reports.loading') }}</span>
      </div>

      <div
        v-else-if="ready && data"
        class="report-results"
        :class="{ 'report-results--detail': can('RECEIVABLE_VIEW') }"
        aria-live="polite"
      >
        <section class="report-hero" :aria-labelledby="id + '-total'">
          <span class="hero-icon"><SolutionOutlined aria-hidden="true" /></span>
          <div class="hero-content">
            <h2 :id="id + '-total'">{{ t('reports.totalRemainingAmount') }}</h2>
            <p class="hero-value" data-metric="totalRemainingAmount">
              {{ metricValue('totalRemainingAmount') }}
            </p>
            <p class="report-as-of">
              {{ t('reports.asOf') }}: <span data-timestamp>{{ timestamp }}</span>
            </p>
            <p class="report-applied-scope">
              {{ t('reports.warehouse') }}: <span data-scope>{{ scopeLabel }}</span>
            </p>
          </div>
        </section>

        <div class="money-metrics">
          <article v-for="metric in moneyMetrics" :key="metric.key" class="metric-card">
            <span class="metric-icon"><component :is="metric.icon" aria-hidden="true" /></span>
            <div>
              <h2>{{ t('reports.' + metric.key) }}</h2>
              <p :data-metric="metric.key">{{ metricValue(metric.key) }}</p>
            </div>
          </article>
        </div>

        <div class="count-metrics">
          <article v-for="metric in countMetrics" :key="metric.key" class="metric-card">
            <span class="metric-icon"><component :is="metric.icon" aria-hidden="true" /></span>
            <div>
              <h2>{{ t('reports.' + metric.key) }}</h2>
              <p :data-metric="metric.key">{{ metricValue(metric.key) }}</p>
            </div>
          </article>
        </div>

        <router-link v-if="can('RECEIVABLE_VIEW')" class="report-detail" :to="detailLocation">
          {{ t('reports.receivableDetail') }}<ArrowRightOutlined aria-hidden="true" />
        </router-link>
      </div>

      <aside class="report-note">
        <InfoCircleOutlined aria-hidden="true" />
        <p>{{ t('receivablesReport.currentNote') }}</p>
      </aside>
    </section>
  </a-config-provider>
</template>

<style scoped>
.receivables-report {
  min-width: 0;
  color: #25203d;
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
}
.report-heading h1 {
  margin: 0;
  color: #171331;
  font-size: 28px;
  font-weight: 700;
  line-height: 1.3;
}
.report-heading p {
  margin: 6px 0 0;
  color: #797093;
  line-height: 1.5;
}
.report-reload {
  flex-shrink: 0;
  color: #514267;
}
.report-filter-panel {
  min-width: 0;
  margin-bottom: 24px;
}
.report-filter-form {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 10px 14px;
}
.report-field {
  display: flex;
  flex: 0 1 450px;
  align-items: center;
  gap: 20px;
  min-width: 0;
}
.report-field label {
  flex-shrink: 0;
  font-weight: 600;
}
.report-field :deep(.ant-select) {
  flex: 1;
  min-width: 0;
  width: 100%;
}
.report-actions,
.report-error-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
}
.report-search {
  min-width: 128px;
}
.report-reset {
  color: #7c3aed;
  border-color: #d5c2ff;
}
.report-scope-note {
  flex-basis: 100%;
  margin: 0 0 0 46px;
  color: #797093;
  font-size: 13px;
  line-height: 1.5;
}
.report-error,
.report-loading {
  margin-bottom: 20px;
}
.report-loading {
  display: grid;
  gap: 20px;
  padding: 24px;
  border-radius: 12px;
  background: #faf8ff;
  color: #797093;
}
.report-results {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  align-items: center;
  gap: 18px;
  min-width: 0;
}
.report-hero {
  grid-column: 1 / -1;
  grid-row: 1;
  display: flex;
  align-items: flex-start;
  gap: 24px;
  min-width: 0;
  padding: 28px 32px;
  border: 1px solid #eee7ff;
  border-radius: 12px;
  background: #f2edff;
}
.hero-content {
  flex: 1;
  min-width: 0;
}
.report-results--detail .hero-content {
  padding-right: 280px;
}
.hero-icon,
.metric-icon {
  display: grid;
  flex-shrink: 0;
  place-items: center;
  width: 56px;
  height: 56px;
  border-radius: 14px;
  background: #eee7ff;
  color: #7c3aed;
  font-size: 28px;
}
.hero-icon {
  width: 76px;
  height: 76px;
  background: #e9e0ff;
  font-size: 38px;
}
.report-hero h2 {
  margin: 0;
  font-size: 18px;
  font-weight: 500;
  line-height: 1.5;
}
.hero-value {
  margin: 8px 0 10px;
  color: #6d28d9;
  font-size: clamp(28px, 3.2vw, 46px);
  font-weight: 750;
  line-height: 1.3;
  overflow-wrap: anywhere;
  font-variant-numeric: tabular-nums;
}
.report-as-of,
.report-applied-scope {
  margin: 6px 0 0;
  color: #706388;
  font-size: 13px;
  line-height: 1.5;
  overflow-wrap: anywhere;
}
.money-metrics,
.count-metrics {
  display: grid;
  grid-column: 1 / -1;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 16px;
  min-width: 0;
}
.count-metrics {
  grid-template-columns: repeat(3, minmax(0, 1fr));
}
.metric-card {
  display: flex;
  align-items: center;
  gap: 18px;
  min-width: 0;
  padding: 20px;
  border: 1px solid #ece7f8;
  border-radius: 12px;
  background: #fff;
}
.metric-card > div {
  min-width: 0;
}
.metric-card h2 {
  margin: 0;
  font-size: 15px;
  line-height: 1.5;
  font-weight: 500;
}
.metric-card p {
  margin: 8px 0 0;
  color: #171331;
  font-size: 28px;
  font-weight: 700;
  line-height: 1.3;
  font-variant-numeric: tabular-nums;
  overflow-wrap: anywhere;
}
.count-metrics .metric-card {
  gap: 14px;
  padding: 18px;
}
.count-metrics .metric-icon {
  width: 44px;
  height: 44px;
  font-size: 24px;
}
.count-metrics p {
  font-size: 24px;
}
.report-detail {
  display: inline-flex;
  grid-column: 2;
  grid-row: 1;
  z-index: 1;
  align-items: center;
  justify-content: center;
  gap: 14px;
  max-width: 250px;
  margin-right: 28px;
  padding: 14px 20px;
  border-radius: 8px;
  background: #7c3aed;
  color: #fff;
  font-size: 16px;
  font-weight: 500;
  line-height: 1.5;
  text-align: center;
  text-decoration: none;
}
.report-detail:hover {
  background: #6d28d9;
}
.report-detail:focus-visible {
  outline: 3px solid #a78bfa;
  outline-offset: 3px;
}
.report-note {
  display: flex;
  align-items: flex-start;
  gap: 12px;
  margin-top: 20px;
  padding: 16px 20px;
  border: 1px solid #ece7f8;
  border-radius: 10px;
  background: #f5f4ff;
  color: #5c527d;
}
.report-note .anticon {
  flex-shrink: 0;
  margin-top: 2px;
  font-size: 19px;
}
.report-note p {
  margin: 0;
  line-height: 1.6;
}
.report-mobile-toggle {
  display: flex;
  align-items: center;
  gap: 8px;
  width: 100%;
  color: #7c3aed;
  border-color: #ded1ff;
  background: #faf8ff;
}
.toggle-arrow {
  margin-left: auto;
}
@container workspace (max-width: 1100px) {
  .report-detail {
    grid-row: auto;
    grid-column: 1 / -1;
    justify-self: end;
    margin-right: 0;
  }
  .report-results--detail .hero-content {
    padding-right: 0;
  }
  .count-metrics {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}
@media (max-width: 767px) {
  .report-heading {
    align-items: flex-start;
    gap: 10px;
    margin-bottom: 18px;
  }
  .report-heading h1 {
    font-size: 22px;
  }
  .report-filter-form {
    display: grid;
    grid-template-columns: minmax(0, 1fr);
    padding-top: 14px;
    gap: 10px;
  }
  .report-field {
    flex-direction: column;
    align-items: stretch;
    gap: 6px;
  }
  .report-scope-note {
    grid-row: 2;
    margin: 0;
    font-size: 12px;
  }
  .report-actions {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
  .report-actions .ant-btn {
    min-width: 0;
    padding-inline: 10px;
  }
  .report-reset {
    order: -1;
  }
  .receivables-report :deep(.ant-btn) {
    min-height: 44px;
  }
  .report-field :deep(.ant-select-selector) {
    min-height: 40px;
  }
  .report-filter-panel {
    margin-bottom: 16px;
  }
  .report-results {
    gap: 12px;
  }
  .report-hero {
    gap: 12px;
    padding: 18px;
  }
  .hero-icon {
    width: 42px;
    height: 42px;
    font-size: 24px;
  }
  .report-results--detail .hero-content {
    padding-right: 0;
  }
  .report-hero h2 {
    font-size: 15px;
  }
  .hero-value {
    font-size: clamp(24px, 6.5vw, 30px);
  }
  .report-as-of,
  .report-applied-scope {
    font-size: 12px;
  }
  .money-metrics,
  .count-metrics {
    grid-template-columns: minmax(0, 1fr);
    gap: 10px;
  }
  .metric-card,
  .count-metrics .metric-card {
    gap: 14px;
    padding: 14px;
  }
  .metric-icon {
    width: 42px;
    height: 42px;
    font-size: 24px;
  }
  .metric-card h2 {
    font-size: 13px;
  }
  .metric-card p {
    font-size: 22px;
    margin-top: 5px;
  }
  .count-metrics p {
    font-size: 20px;
  }
  .report-detail {
    grid-column: 1 / -1;
    grid-row: auto;
    justify-self: stretch;
    max-width: none;
    min-height: 44px;
    margin: 0;
    padding: 12px;
    font-size: 14px;
  }
  .report-note {
    padding: 12px;
    margin-top: 14px;
    font-size: 13px;
  }
}
@media (max-width: 359px) {
  .report-hero {
    display: block;
  }
  .hero-icon {
    margin-bottom: 12px;
  }
}
</style>
