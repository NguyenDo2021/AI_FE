<script setup lang="ts">
import { computed } from 'vue'
import DashboardChart from '@/components/reports/DashboardChart.vue'
import { useBusinessDashboard } from '@/composables/useBusinessDashboard'
import { reportValue } from '@/utils/reports'
import {
  dashboardColors,
  donutOption,
  recordedComposition,
  timestampVN,
  trendOption,
  warehouseOption,
} from '@/utils/dashboard'
const {
  filters,
  snapshot,
  summary,
  trends,
  sales,
  options,
  busy,
  filterError,
  accessError,
  authorized,
  warehouses,
  can,
  preset,
  refresh,
  reloadScope,
  retrySummary,
  retryTrends,
  retrySales,
} = useBusinessDashboard()
const periodSales = computed(() =>
  can('REPORT_SALES_VIEW') ? summary.value.data?.periodSections?.sales : undefined,
)
const periodPayments = computed(() =>
  can('REPORT_PAYMENT_VIEW') ? summary.value.data?.periodSections?.payments : undefined,
)
const current = computed(() => summary.value.data?.currentSections)
const cards = computed(() => [
  ...(periodSales.value
    ? [
        {
          key: 'sales',
          title: 'Giá trị bán ròng',
          value: periodSales.value.netSalesAmount,
          note: 'Đã trừ hủy bán và hàng trả',
          color: dashboardColors.sales,
        },
      ]
    : []),
  ...(periodPayments.value
    ? [
        {
          key: 'payments',
          title: 'Thu ròng',
          value: periodPayments.value.netRecordedAmount,
          note: 'Khoản thu ghi nhận trừ đảo thu',
          color: dashboardColors.payments,
        },
        {
          key: 'refunds',
          title: 'Hoàn ròng',
          value: periodPayments.value.netRefundedAmount,
          note: 'Khoản hoàn ghi nhận trừ đảo hoàn',
          color: dashboardColors.refunds,
        },
      ]
    : []),
])
const trendData = computed(
  () =>
    trends.value.data && {
      ...trends.value.data,
      items: trends.value.data.items.map((item) => ({
        date: item.date,
        sales: can('REPORT_SALES_VIEW') ? item.sales : undefined,
        payments: can('REPORT_PAYMENT_VIEW') ? item.payments : undefined,
      })),
    },
)
const hasTrendSeries = computed(() =>
  trendData.value?.items.some((item) => item.sales || item.payments),
)
const trendsChart = computed(() => (trendData.value ? trendOption(trendData.value) : {}))
const salesChart = computed(() => warehouseOption(sales.value.data ?? []))
const composition = computed(() => {
  try {
    return periodPayments.value
      ? { data: recordedComposition(periodPayments.value), error: '' }
      : undefined
  } catch (cause) {
    return { data: undefined, error: (cause as Error).message }
  }
})
const donutChart = computed(() =>
  periodPayments.value && composition.value?.data ? donutOption(periodPayments.value) : {},
)
const tasks = computed(() => [
  ...(current.value?.receivables
    ? [
        {
          key: 'receivables',
          label: 'Tổng còn phải thu',
          value: reportValue(current.value.receivables.totalRemainingAmount, true),
          note: 'Khách hàng và đơn khách lẻ',
          asOf: current.value.receivables.asOf,
          to: can('RECEIVABLE_VIEW') ? '/sales/receivables' : undefined,
        },
      ]
    : []),
  ...(current.value?.refunds
    ? [
        {
          key: 'refunds',
          label: 'Tiền cần hoàn khách',
          value: reportValue(current.value.refunds.refundableAmount, true),
          note: `${reportValue(current.value.refunds.refundableOrderCount)} đơn cần hoàn`,
          asOf: current.value.refunds.asOf,
          to: can('REFUND_VIEW') ? '/sales/refundables' : undefined,
        },
      ]
    : []),
  ...(current.value?.lowStock
    ? [
        {
          key: 'lowStock',
          label: 'Dưới ngưỡng tồn kho',
          value: `${reportValue(current.value.lowStock.lowStockPairCount)} cặp kho/sản phẩm`,
          note: 'Kiểm tra để bổ sung hàng',
          asOf: current.value.lowStock.asOf,
          to: can('REPORT_LOW_STOCK_VIEW') ? '/reports/low-stock' : undefined,
        },
      ]
    : []),
])
const scopeUnavailable = computed(() => !warehouses.loaded)
</script>

<template>
  <section class="business-dashboard" aria-labelledby="business-title">
    <header class="overview-header">
      <div>
        <p class="eyebrow">KHÔNG GIAN QUẢN TRỊ</p>
        <h1 id="business-title">Tổng quan kinh doanh</h1>
        <p class="muted">Mọi chuyển động của cửa hàng, trong một góc nhìn.</p>
      </div>
      <span class="timezone">Giờ Việt Nam · VND</span>
    </header>
    <div class="overview-filters">
      <label class="warehouse-filter"
        ><span>Kho</span
        ><a-select
          :value="filters.warehouseId || ''"
          :options="options"
          :loading="warehouses.loading"
          aria-label="Kho báo cáo"
          @change="(value: string) => (filters.warehouseId = value || undefined)"
      /></label>
      <label
        ><span>Từ ngày</span
        ><a-date-picker
          v-model:value="filters.from"
          value-format="YYYY-MM-DD"
          format="DD/MM/YYYY"
          :allow-clear="false"
          aria-label="Từ ngày"
      /></label>
      <label
        ><span>Đến ngày</span
        ><a-date-picker
          v-model:value="filters.to"
          value-format="YYYY-MM-DD"
          format="DD/MM/YYYY"
          :allow-clear="false"
          aria-label="Đến ngày"
      /></label>
      <a-button :loading="busy" @click="refresh">Làm mới</a-button>
      <div class="presets" aria-label="Khoảng ngày nhanh">
        <a-button size="small" @click="preset('today')">Hôm nay</a-button
        ><a-button size="small" @click="preset('week')">7 ngày</a-button
        ><a-button size="small" @click="preset('month')">Tháng này</a-button
        ><a-button size="small" @click="preset('previous')">Tháng trước</a-button>
      </div>
    </div>
    <div class="filter-caption">
      <span>“Tất cả kho” là phạm vi kho được phép · Asia/Ho_Chi_Minh</span
      ><span v-if="summary.data">Cập nhật: {{ timestampVN(summary.data.generatedAt) }}</span>
    </div>
    <a-alert v-if="filterError" type="error" :message="filterError" show-icon />
    <a-alert
      v-if="accessError || scopeUnavailable"
      :type="scopeUnavailable && warehouses.loading ? 'info' : 'error'"
      :message="
        accessError ||
        warehouses.error ||
        (warehouses.loading ? 'Đang tải phạm vi kho…' : 'Chưa tải được phạm vi kho.')
      "
      show-icon
      ><template #description
        ><a-button :loading="warehouses.loading" @click="reloadScope"
          >Làm mới phạm vi kho</a-button
        ></template
      ></a-alert
    >
    <template v-if="authorized && !filterError && !accessError && !scopeUnavailable">
      <p v-if="snapshot" class="period-caption">
        Hoạt động trong kỳ: {{ snapshot.from.split('-').reverse().join('/') }} –
        {{ snapshot.to.split('-').reverse().join('/') }}
      </p>
      <div
        v-if="summary.loading && (can('REPORT_SALES_VIEW') || can('REPORT_PAYMENT_VIEW'))"
        class="kpi-grid"
        aria-label="Đang tải chỉ số"
      >
        <div
          v-for="key in can('REPORT_SALES_VIEW') && can('REPORT_PAYMENT_VIEW')
            ? 3
            : can('REPORT_PAYMENT_VIEW')
              ? 2
              : 1"
          :key="key"
          class="panel kpi"
        >
          <a-skeleton :active="false" :paragraph="{ rows: 2 }" />
        </div>
      </div>
      <div v-else-if="cards.length" class="kpi-grid">
        <article
          v-for="card in cards"
          :key="card.key"
          class="panel kpi"
          :style="{ '--metric-color': card.color }"
        >
          <h2>{{ card.title }}</h2>
          <p class="kpi-value">{{ reportValue(card.value) }} <span>VND</span></p>
          <p class="muted">{{ card.note }}</p>
        </article>
      </div>
      <a-alert v-if="summary.error" type="error" :message="summary.error" show-icon
        ><template #description
          ><a-button @click="retrySummary">Thử lại chỉ số và dữ liệu hiện tại</a-button></template
        ></a-alert
      >
      <a-empty
        v-if="summary.data && !cards.length && !tasks.length"
        description="Không có mục dữ liệu được cấp quyền trong tổng quan."
      />
      <div class="charts-grid">
        <article
          v-if="can('REPORT_SALES_VIEW') || can('REPORT_PAYMENT_VIEW')"
          class="panel trend-panel"
        >
          <div class="panel-heading">
            <div>
              <h2>Xu hướng bán hàng &amp; thu tiền</h2>
              <p class="muted">Theo ngày · Bật/tắt từng chuỗi qua chú giải</p>
            </div>
            <span class="period-badge">Trong kỳ</span>
          </div>
          <a-skeleton v-if="trends.loading" :active="false" :paragraph="{ rows: 7 }" />
          <div v-else-if="trends.error" class="panel-state" role="alert">
            <p>{{ trends.error }}</p>
            <a-button @click="retryTrends">Thử lại xu hướng</a-button>
          </div>
          <template v-else-if="hasTrendSeries"
            ><div class="trend-chart">
              <DashboardChart
                :option="trendsChart"
                label="Xu hướng giá trị bán ròng và thu ròng theo ngày. Chọn chú giải để bật hoặc tắt chuỗi."
              />
            </div>
            <p class="source-time">Cập nhật: {{ timestampVN(trends.data?.generatedAt) }}</p>
            <details class="exact-data">
              <summary>Xem số liệu theo ngày (VND)</summary>
              <div class="table-scroll">
                <table>
                  <thead>
                    <tr>
                      <th>Ngày</th>
                      <th v-if="trendData?.items.some((item) => item.sales)">Giá trị bán ròng</th>
                      <th v-if="trendData?.items.some((item) => item.payments)">Thu ròng</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr v-for="item in trendData?.items" :key="item.date">
                      <td>{{ item.date }}</td>
                      <td v-if="trendData?.items.some((row) => row.sales)">
                        {{ reportValue(item.sales?.netSalesAmount, true) }}
                      </td>
                      <td v-if="trendData?.items.some((row) => row.payments)">
                        {{ reportValue(item.payments?.netRecordedAmount, true) }}
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </details></template
          >
          <a-empty
            v-else
            description="API chưa cung cấp chuỗi xu hướng trong phạm vi quyền hiện tại."
          />
        </article>
        <article
          v-if="can('REPORT_PAYMENT_VIEW') && (summary.loading || summary.error || periodPayments)"
          class="panel donut-panel"
        >
          <div class="panel-heading">
            <div>
              <h2>Cơ cấu khoản thu ghi nhận</h2>
              <p class="muted">Theo thời điểm tạo phiếu, bao gồm khoản đã bị đảo ghi nhận.</p>
            </div>
          </div>
          <a-skeleton v-if="summary.loading" :active="false" :paragraph="{ rows: 6 }" />
          <div v-else-if="summary.error" class="panel-state" role="alert">
            <p>{{ summary.error }}</p>
            <a-button @click="retrySummary">Thử lại cơ cấu thu</a-button>
          </div>
          <p v-else-if="composition?.error" role="alert">{{ composition.error }}</p>
          <template v-else-if="composition?.data && composition.data.total > 0n"
            ><div class="donut-chart">
              <DashboardChart
                :option="donutChart"
                label="Cơ cấu khoản thu được tạo trong kỳ: tiền mặt và chuyển khoản."
              />
              <div class="donut-center">
                <span>TỔNG GHI NHẬN</span><strong>{{ reportValue(composition.data.total) }}</strong
                ><span>VND</span>
              </div>
            </div>
            <ul class="composition-legend">
              <li v-for="(item, index) in composition.data.items" :key="item.name">
                <div>
                  <span
                    class="color-dot"
                    :style="{
                      background: index === 0 ? dashboardColors.sales : dashboardColors.payments,
                    }"
                  />{{ item.name }} <strong>{{ item.percent }}</strong>
                </div>
                <span>{{ reportValue(item.raw) }} VND</span>
              </li>
            </ul></template
          >
          <a-empty v-else description="Chưa có khoản thu ghi nhận trong kỳ." />
        </article>
      </div>
      <div class="bottom-grid">
        <article v-if="can('REPORT_SALES_VIEW')" class="panel warehouse-panel">
          <div class="panel-heading">
            <div>
              <h2>Bán hàng theo kho</h2>
              <p class="muted">Giá trị bán ròng · Trong kỳ</p>
            </div>
          </div>
          <a-skeleton v-if="sales.loading" :active="false" :paragraph="{ rows: 5 }" />
          <div v-else-if="sales.error" class="panel-state" role="alert">
            <p>{{ sales.error }}</p>
            <a-button @click="retrySales">Thử lại bán hàng theo kho</a-button>
          </div>
          <template v-else-if="sales.data?.length"
            ><p v-if="sales.data.length > 10" class="muted">
              10 kho có giá trị bán ròng lớn nhất theo độ lớn
            </p>
            <div
              :style="{ height: Math.max(260, Math.min(sales.data.length, 10) * 40 + 70) + 'px' }"
            >
              <DashboardChart
                :option="salesChart"
                label="Giá trị bán ròng theo kho, gồm cả giá trị âm. Tối đa 10 kho theo độ lớn."
              />
            </div>
            <details class="exact-data">
              <summary>Xem số liệu {{ sales.data.length }} kho (VND)</summary>
              <div class="table-scroll">
                <table>
                  <thead>
                    <tr>
                      <th>Kho</th>
                      <th>Giá trị bán ròng</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr v-for="row in sales.data" :key="row.warehouseId">
                      <td>{{ row.warehouseCode }} — {{ row.warehouseName }}</td>
                      <td>{{ reportValue(row.netSalesAmount, true) }}</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </details></template
          ><a-empty v-else description="Chưa có dữ liệu bán hàng theo kho." /><router-link
            v-if="can('REPORT_SALES_VIEW')"
            to="/reports/sales"
            class="report-link"
            >Mở báo cáo bán hàng đầy đủ →</router-link
          >
        </article>
        <article v-if="summary.loading || summary.error || tasks.length" class="panel tasks-panel">
          <div class="panel-heading">
            <div>
              <h2>Cần xử lý</h2>
              <p class="muted">Số liệu hiện tại · Không theo bộ lọc ngày</p>
            </div>
            <span class="current-badge">Hiện tại</span>
          </div>
          <a-skeleton v-if="summary.loading" :active="false" :paragraph="{ rows: 5 }" />
          <div v-else-if="summary.error" class="panel-state" role="alert">
            <p>{{ summary.error }}</p>
            <a-button @click="retrySummary">Thử lại việc cần xử lý</a-button>
          </div>
          <ul v-else class="task-list">
            <li v-for="task in tasks" :key="task.key">
              <div class="task-row">
                <div>
                  <h3>
                    <router-link v-if="task.to" :to="task.to">{{ task.label }} →</router-link
                    ><span v-else>{{ task.label }}</span>
                  </h3>
                  <p class="muted">{{ task.note }}</p>
                </div>
                <strong class="task-value">{{ task.value }}</strong>
              </div>
              <p class="source-time">Tại thời điểm {{ timestampVN(task.asOf) }}</p>
            </li>
          </ul>
        </article>
      </div>
      <footer class="overview-footer">
        Giá trị bán ròng không phải lợi nhuận hay số dư tiền mặt. Các API độc lập có thể đọc dữ liệu
        tại thời điểm khác nhau.
      </footer>
    </template>
  </section>
</template>

<style scoped>
.business-dashboard {
  --muted: #63708b;
  color: #252d42;
  max-width: 1600px;
  margin: 0 auto;
}
.overview-header {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: 16px;
  margin-bottom: 24px;
}
h1 {
  margin: 4px 0 8px;
  font-size: clamp(23px, 2.1vw, 30px);
  font-weight: 700;
  line-height: 1.25;
  letter-spacing: -0.6px;
  color: #151a28;
}
.eyebrow {
  color: var(--muted);
  font-size: 11px;
  letter-spacing: 0.7px;
  margin: 0;
}
.muted {
  color: var(--muted);
  font-size: 12px;
  line-height: 1.6;
  margin: 4px 0 0;
}
.timezone,
.period-badge,
.current-badge {
  color: #6850c6;
  background: #efebff;
  border-radius: 16px;
  padding: 5px 10px;
  font-size: 11px;
  white-space: nowrap;
}
.overview-filters {
  display: flex;
  align-items: flex-end;
  flex-wrap: wrap;
  gap: 12px;
}
.overview-filters label {
  display: flex;
  flex-direction: column;
  gap: 5px;
  color: #53617b;
  font-size: 12px;
}
.overview-filters .warehouse-filter {
  width: 250px;
}
.overview-filters :deep(.ant-picker) {
  width: 150px;
}
.presets {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  align-items: center;
  min-height: 32px;
}
.filter-caption {
  display: flex;
  flex-wrap: wrap;
  justify-content: space-between;
  gap: 8px;
  color: var(--muted);
  font-size: 11px;
  margin: 12px 0 20px;
}
.period-caption {
  color: #56617a;
  font-size: 12px;
  margin: 0 0 12px;
}
.kpi-grid {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 18px;
  margin-bottom: 20px;
}
.panel {
  background: #fff;
  border: 1px solid #e8ecf5;
  border-radius: 13px;
  padding: 22px;
  min-width: 0;
}
.kpi {
  border-top: 3px solid var(--metric-color, #e8ecf5);
  padding: 21px 22px;
}
h2 {
  font-size: 14px;
  line-height: 1.5;
  margin: 0;
  color: #252d42;
  font-weight: 600;
}
.kpi h2 {
  font-size: 12px;
  color: #63708b;
  font-weight: 500;
}
.kpi-value {
  margin: 18px 0 8px;
  font-size: clamp(19px, 2vw, 28px);
  line-height: 1.35;
  font-weight: 700;
  letter-spacing: -0.6px;
  overflow-wrap: anywhere;
  font-variant-numeric: tabular-nums;
}
.kpi-value span {
  font-size: 12px;
  font-weight: 400;
  color: var(--muted);
  letter-spacing: 0;
}
.charts-grid {
  display: grid;
  grid-template-columns: minmax(0, 1.65fr) minmax(0, 1fr);
  gap: 20px;
  margin-bottom: 20px;
  align-items: stretch;
}
.panel-heading {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 18px;
}
.trend-chart {
  height: 315px;
}
.donut-chart {
  position: relative;
  height: 250px;
}
.donut-center {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-direction: column;
  gap: 4px;
  pointer-events: none;
  padding: 0 24%;
  text-align: center;
}
.donut-center span {
  color: var(--muted);
  font-size: 10px;
}
.donut-center strong {
  font-size: clamp(11px, 1.2vw, 18px);
  overflow-wrap: anywhere;
  line-height: 1.3;
  font-variant-numeric: tabular-nums;
}
.composition-legend,
.task-list {
  list-style: none;
  padding: 0;
  margin: 0;
}
.composition-legend li {
  border-top: 1px solid #edf0f7;
  padding: 12px 0;
  font-size: 12px;
}
.composition-legend li > div {
  display: flex;
  align-items: center;
  gap: 8px;
}
.composition-legend li > span {
  display: block;
  margin: 4px 0 0 15px;
  color: var(--muted);
  overflow-wrap: anywhere;
  font-size: 11px;
}
.composition-legend strong {
  margin-left: auto;
  font-weight: 500;
}
.color-dot {
  width: 7px;
  height: 7px;
  border-radius: 50%;
  display: inline-block;
  flex-shrink: 0;
}
.bottom-grid {
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
  gap: 20px;
  align-items: start;
}
.task-list li {
  padding: 18px 0;
  border-top: 1px solid #e8ecf5;
}
.task-row {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 14px;
}
h3 {
  margin: 0;
  font-size: 13px;
  font-weight: 500;
}
h3 a {
  color: #4e438e;
}
.task-value {
  font-size: 12px;
  font-weight: 500;
  color: #6247bd;
  background: #f1edff;
  padding: 5px 8px;
  border-radius: 5px;
  text-align: right;
  overflow-wrap: anywhere;
  max-width: 55%;
}
.source-time {
  color: var(--muted);
  font-size: 10px;
  margin: 8px 0 0;
}
.report-link {
  display: inline-block;
  margin-top: 18px;
  font-size: 12px;
  color: #6247bd;
}
.panel-state {
  min-height: 200px;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-direction: column;
  color: #98402e;
  text-align: center;
  font-size: 13px;
}
.overview-footer {
  color: var(--muted);
  font-size: 11px;
  line-height: 1.7;
  margin-top: 20px;
}
.exact-data {
  margin-top: 14px;
  font-size: 11px;
  color: #56617a;
}
.exact-data summary {
  cursor: pointer;
}
.table-scroll {
  overflow: auto;
  max-height: 280px;
  margin-top: 10px;
}
table {
  width: 100%;
  border-collapse: collapse;
  white-space: nowrap;
  font-variant-numeric: tabular-nums;
}
th,
td {
  padding: 8px;
  text-align: right;
  border-bottom: 1px solid #edf0f7;
}
th:first-child,
td:first-child {
  text-align: left;
}
.business-dashboard > :deep(.ant-alert) {
  margin-bottom: 18px;
}
@media (max-width: 1100px) {
  .charts-grid {
    grid-template-columns: minmax(0, 1.35fr) minmax(0, 1fr);
  }
  .panel {
    padding: 18px;
  }
  .task-row {
    flex-direction: column;
    gap: 8px;
  }
  .task-value {
    max-width: 100%;
  }
}
@media (max-width: 767px) {
  .kpi-grid,
  .charts-grid,
  .bottom-grid {
    grid-template-columns: minmax(0, 1fr);
    gap: 14px;
  }
  .overview-header {
    margin-bottom: 20px;
  }
  .timezone {
    display: none;
  }
  .overview-filters {
    gap: 10px;
  }
  .overview-filters .warehouse-filter {
    width: 100%;
  }
  .overview-filters label:not(.warehouse-filter) {
    width: calc(50% - 5px);
  }
  .overview-filters :deep(.ant-picker) {
    width: 100%;
  }
  .presets {
    gap: 5px;
  }
  .kpi-value {
    font-size: 26px;
  }
  .trend-chart {
    height: 300px;
  }
  .donut-center strong {
    font-size: 14px;
  }
  .task-row {
    flex-direction: row;
  }
  .task-value {
    max-width: 52%;
  }
  .panel-heading {
    gap: 8px;
  }
}
@media (prefers-reduced-motion: reduce) {
  *,
  *::before,
  *::after {
    animation: none !important;
    transition: none !important;
  }
}
</style>
