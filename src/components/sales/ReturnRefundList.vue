<script setup lang="ts" generic="T extends object">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, useId, watch } from 'vue'
import { FilterOutlined, LeftOutlined, RightOutlined, ReloadOutlined } from '@ant-design/icons-vue'
import { theme, type TableColumnsType } from 'ant-design-vue'
import type { StockInteger } from '@/types/stock'
import { formatStockInteger } from '@/utils/stock'
import { hasNextPage } from '@/utils/returns'

const props = defineProps<{
  title: string
  itemLabel: string
  columns: TableColumnsType<T>
  rows: T[]
  loading: boolean
  error: string
  total?: StockInteger
  page: number
  pageSize: number
  rowKey?: string | ((record: T) => string)
}>()
const emit = defineEmits<{ reload: []; pageChange: [page: number, size: number] }>()
const { token } = theme.useToken()
const panel = ref<HTMLElement>()
const region = ref<HTMLElement>()
const bodyHeight = ref(200)
const bodyGutter = ref(0)
const minPanelHeight = ref(240)
const panelWidth = ref(1200)
const filtersOpen = ref(false)
const filterId = useId()
const tooltipContainer = (trigger: HTMLElement): HTMLElement => trigger.ownerDocument.body
// Page scrolling must not make a filter popup align against the full document height.
const filterPopupAlign = { overflow: { adjustX: 1, adjustY: 1, alwaysByViewport: true } }
const compact = computed(() => panelWidth.value < 600)
const paginationTotal = computed(() =>
  props.total === undefined || BigInt(props.total) > BigInt(Number.MAX_SAFE_INTEGER)
    ? undefined
    : Number(props.total),
)
const scrollWidth = computed(() =>
  props.columns.reduce((sum, column) => sum + Number(column.width || 0), 0),
)
const tableColumns = computed<TableColumnsType<T>>(() =>
  props.columns.map((column, index) => (index === 0 ? { ...column, width: undefined } : column)),
)
const rangeLabel = computed(() => {
  if (props.total === undefined) return '— / —'
  const total = BigInt(props.total)
  if (!props.rows.length || total === 0n) return `0 / ${formatStockInteger(total)}`
  const first = BigInt(props.page - 1) * BigInt(props.pageSize) + 1n
  const last = first + BigInt(props.rows.length) - 1n
  return `${formatStockInteger(first)}–${formatStockInteger(last < total ? last : total)} / ${formatStockInteger(total)}`
})
let observer: ResizeObserver | undefined
let frame = 0
let disposed = false
const measure = (): void => {
  if (disposed || !region.value) return
  panelWidth.value = panel.value?.clientWidth ?? 1200
  const header = region.value.querySelector<HTMLElement>('.ant-table-header')
  const toolbar = panel.value?.querySelector<HTMLElement>('.rr-toolbar')
  const footer = panel.value?.querySelector<HTMLElement>('.rr-pagination')
  // Reserve one full 84px row, the horizontal scrollbar and the panel borders.
  minPanelHeight.value =
    (toolbar?.offsetHeight ?? 60) + (footer?.offsetHeight ?? 60) + (header?.offsetHeight ?? 48) + 96
  bodyHeight.value = Math.max(
    0,
    Math.floor(region.value.clientHeight - (header?.offsetHeight ?? 48)),
  )
  const body = region.value.querySelector<HTMLElement>('.ant-table-body')
  const scrollbar = header?.querySelector<HTMLElement>('.ant-table-cell-scrollbar')
  bodyGutter.value =
    body && body.scrollHeight <= body.clientHeight ? (scrollbar?.offsetWidth ?? 0) : 0
}
const schedule = (): void => {
  if (disposed) return
  cancelAnimationFrame(frame)
  frame = requestAnimationFrame(measure)
}
onMounted(async () => {
  await nextTick()
  if (disposed) return
  observer = new ResizeObserver(schedule)
  for (const element of [
    panel.value,
    region.value,
    region.value?.querySelector('.ant-table-header'),
    panel.value?.querySelector('.rr-toolbar'),
    panel.value?.querySelector('.rr-pagination'),
  ]) {
    if (element) observer.observe(element)
  }
  window.addEventListener('resize', schedule)
  window.visualViewport?.addEventListener('resize', schedule)
  measure()
})
watch(
  () => [props.rows, props.columns, bodyHeight.value, filtersOpen.value],
  async () => {
    await nextTick()
    schedule()
  },
)
watch(
  () => [props.page, props.pageSize],
  async () => {
    await nextTick()
    const body = region.value?.querySelector<HTMLElement>('.ant-table-body')
    if (body) body.scrollTop = 0
  },
)
onBeforeUnmount(() => {
  disposed = true
  observer?.disconnect()
  cancelAnimationFrame(frame)
  window.removeEventListener('resize', schedule)
  window.visualViewport?.removeEventListener('resize', schedule)
})
</script>

<template>
  <a-button
    class="rr-filter-toggle"
    :aria-expanded="filtersOpen"
    :aria-controls="filterId"
    @click="filtersOpen = !filtersOpen"
    ><template #icon><FilterOutlined aria-hidden="true" /></template>Bộ lọc</a-button
  >
  <div :id="filterId" class="rr-filters" :class="{ 'rr-filters--open': filtersOpen }">
    <slot name="filters" :popup-align="filterPopupAlign" />
  </div>
  <section
    ref="panel"
    class="rr-list"
    :style="{
      '--rr-body-gutter': `${bodyGutter}px`,
      '--rr-min-panel-height': `${minPanelHeight}px`,
      '--rr-row-hover': token.colorPrimaryBg,
    }"
  >
    <header class="rr-toolbar">
      <div class="rr-list-heading">
        <h2>{{ title }}</h2>
        <span class="rr-total"
          >{{ total === undefined ? '—' : formatStockInteger(total) }} {{ itemLabel }}</span
        >
      </div>
      <a-tooltip
        title="Tải lại danh sách"
        placement="topRight"
        :trigger="['hover', 'focus']"
        :get-popup-container="tooltipContainer"
        :auto-adjust-overflow="{ adjustX: 1, adjustY: 1 }"
        :overlay-style="{ position: 'fixed', maxWidth: 'min(250px, calc(100vw - 16px))' }"
        ><a-button aria-label="Tải lại danh sách" :loading="loading" @click="emit('reload')"
          ><template #icon><ReloadOutlined /></template></a-button
      ></a-tooltip>
    </header>
    <div ref="region" class="rr-table-region" :aria-busy="loading">
      <a-table
        :columns="tableColumns"
        :data-source="rows"
        :row-key="rowKey ?? 'id'"
        :loading="loading"
        :pagination="false"
        table-layout="fixed"
        :aria-label="title"
        :scroll="{ x: scrollWidth, y: bodyHeight, scrollToFirstRowOnChange: false }"
      >
        <template #bodyCell="scope"><slot name="bodyCell" v-bind="scope" /></template>
        <template #emptyText
          ><a-empty :description="error || 'Không có dữ liệu.'" :image="undefined"
        /></template>
      </a-table>
    </div>
    <footer class="rr-pagination">
      <span
        >Hiển thị {{ rangeLabel }} <span class="rr-range-unit">{{ itemLabel }}</span></span
      >
      <div class="rr-pagination-controls">
        <a-pagination
          v-if="paginationTotal !== undefined"
          :current="page"
          :page-size="pageSize"
          :total="paginationTotal"
          :show-size-changer="false"
          :show-less-items="panelWidth < 900"
          :simple="compact"
          :disabled="loading"
          size="small"
          @change="(next: number) => emit('pageChange', next, pageSize)"
        >
          <template #itemRender="{ type, originalElement }">
            <a-button
              v-if="type === 'prev'"
              type="text"
              size="small"
              aria-label="Trang trước"
              :disabled="loading || page <= 1"
              ><template #icon><LeftOutlined /></template
            ></a-button>
            <a-button
              v-else-if="type === 'next'"
              type="text"
              size="small"
              aria-label="Trang sau"
              :disabled="loading || !hasNextPage(total, page, pageSize)"
              ><template #icon><RightOutlined /></template
            ></a-button>
            <component :is="originalElement" v-else />
          </template>
        </a-pagination>
        <div v-else class="rr-page-controls">
          <a-button
            type="text"
            size="small"
            aria-label="Trang trước"
            :disabled="loading || page <= 1"
            @click="emit('pageChange', page - 1, pageSize)"
            ><template #icon><LeftOutlined /></template
          ></a-button>
          <span class="rr-current-page" aria-current="page">{{ page }}</span>
          <a-button
            type="text"
            size="small"
            aria-label="Trang sau"
            :disabled="loading || !hasNextPage(total, page, pageSize)"
            @click="emit('pageChange', page + 1, pageSize)"
            ><template #icon><RightOutlined /></template
          ></a-button>
        </div>
        <a-select
          class="rr-page-size"
          aria-label="Số dòng mỗi trang"
          :value="pageSize"
          :disabled="loading"
          :options="[10, 20, 50, 100].map((value) => ({ value, label: value + ' / trang' }))"
          @change="(size: number) => emit('pageChange', 1, size)"
        />
      </div>
    </footer>
  </section>
</template>

<style scoped>
.rr-list {
  display: grid;
  grid-template-rows: auto minmax(144px, 1fr) auto;
  flex: 1;
  min-height: var(--rr-min-panel-height);
  min-width: 0;
  border: 1px solid #e9e4f1;
  border-radius: 12px;
  background: #fff;
  overflow: hidden;
}
.rr-toolbar {
  display: flex;
  justify-content: space-between;
  align-items: center;
  flex-wrap: wrap;
  gap: 12px;
  padding: 14px 16px;
}
.rr-toolbar > :deep(.ant-btn) {
  flex-shrink: 0;
}
.rr-toolbar h2 {
  min-width: 0;
  max-width: 100%;
  margin: 0;
  font-size: 16px;
  font-weight: 600;
}
.rr-list-heading {
  display: flex;
  flex: 1;
  min-width: 0;
  align-items: baseline;
  flex-wrap: wrap;
  gap: 10px;
}
.rr-total {
  min-width: 0;
  max-width: 100%;
  overflow-wrap: anywhere;
  color: #757080;
  font-size: 13px;
}
.rr-filters {
  flex: 0 0 auto;
  min-height: 62px;
  min-width: 0;
  max-width: 100%;
  padding: 14px 16px;
  border: 1px solid #e9e4f1;
  border-radius: 12px;
  background: #fff;
}
.rr-filters :deep(.ant-form) {
  display: grid;
  width: 100%;
  min-width: 0;
  max-width: 100%;
  gap: 10px;
  align-items: center;
}
.rr-filters :deep(.rr-return-filters) {
  grid-template-columns:
    minmax(180px, 1.2fr) minmax(220px, 1.4fr) minmax(150px, 0.8fr)
    minmax(170px, 1fr) minmax(170px, 1fr) auto;
}
.rr-filters :deep(.rr-refund-filters) {
  grid-template-columns:
    minmax(180px, 1.2fr) repeat(2, minmax(180px, 1fr)) minmax(120px, 0.8fr)
    minmax(140px, 0.8fr) repeat(2, minmax(160px, 1fr)) auto;
}
.rr-filters :deep(.rr-refundable-filters) {
  grid-template-columns: minmax(180px, 1fr) auto;
}
.rr-filters :deep(.ant-form-item) {
  width: 100%;
  min-width: 0;
  max-width: 100%;
  margin: 0;
}
.rr-filters :deep(.ant-form-item-row),
.rr-filters :deep(.ant-form-item-control),
.rr-filters :deep(.ant-form-item-control-input),
.rr-filters :deep(.ant-form-item-control-input-content) {
  width: 100%;
  min-width: 0;
  max-width: 100%;
}
.rr-filters :deep(.ant-form-item-label) {
  position: absolute;
  width: 1px;
  height: 1px;
  padding: 0;
  overflow: hidden;
  clip-path: inset(50%);
  white-space: nowrap;
}
.rr-filters :deep(.rr-filter-actions) {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  flex-wrap: wrap;
  gap: 10px;
  min-width: 0;
  max-width: 100%;
}
.rr-filter-toggle {
  display: none;
  align-items: center;
  justify-content: center;
}
.rr-filters :deep(.ant-input-affix-wrapper),
.rr-filters :deep(.ant-form-item-control-input-content > .ant-input),
.rr-filters :deep(.ant-select),
.rr-filters :deep(.ant-select-selector),
.rr-filters :deep(.ant-picker) {
  width: 100%;
  min-width: 0;
  max-width: 100%;
}
.rr-filters :deep(.ant-picker-input),
.rr-filters :deep(.ant-picker-input > input),
.rr-filters :deep(.ant-select-selection-item) {
  min-width: 0;
  max-width: 100%;
}
.rr-table-region {
  min-height: 0;
  min-width: 0;
}
.rr-table-region :deep(.ant-table) {
  border-radius: 0;
  font-size: 14px;
}
.rr-table-region :deep(.ant-table-thead > tr > th) {
  white-space: nowrap;
  height: 48px;
  padding: 8px 16px;
  color: #625b70;
  background: #f8f6fc;
  font-size: 13px;
  font-weight: 600;
  line-height: 18px;
}
.rr-table-region :deep(.ant-table-tbody > tr > td) {
  padding: 8px 16px;
  height: 84px;
  line-height: 20px;
  background: #fff;
  border-bottom: 1px solid #f0edf5;
}
.rr-table-region :deep(.ant-table-tbody > tr:hover > td),
.rr-table-region :deep(td.ant-table-cell-row-hover) {
  background: var(--rr-row-hover);
}
.rr-table-region :deep(.ant-table-cell-fix-right) {
  z-index: 2;
}
.rr-table-region :deep(.ant-table-thead .ant-table-cell-fix-right) {
  z-index: 3;
}
.rr-table-region :deep(.ant-table-ping-right .ant-table-cell-fix-right-first::after) {
  box-shadow: inset -8px 0 8px -8px rgb(48 38 64 / 22%);
}
.rr-table-region :deep(.ant-tag) {
  margin: 0;
  max-width: 100%;
  white-space: nowrap;
  line-height: 18px;
}
.rr-table-region :deep(.ant-table-body) {
  overflow-y: auto !important;
  margin-inline-end: var(--rr-body-gutter);
}
.rr-table-region :deep(.ant-table-body::-webkit-scrollbar) {
  width: 10px;
  height: 10px;
}
.rr-table-region :deep(.ant-table-body::-webkit-scrollbar-track) {
  background: #f5f3fa;
}
.rr-table-region :deep(.ant-table-body::-webkit-scrollbar-thumb) {
  background: #bfb2d8;
  border: 2px solid #f5f3fa;
  border-radius: 8px;
}
.rr-table-region :deep(.rr-text) {
  display: block;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.rr-table-region :deep(.rr-code) {
  color: #61469c;
  font-weight: 600;
}
.rr-table-region :deep(.rr-money) {
  white-space: nowrap;
  font-variant-numeric: tabular-nums;
}
.rr-table-region :deep(.rr-money-emphasis) {
  color: #7950d7;
  font-weight: 650;
}
.rr-table-region :deep(.rr-actions) {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 4px;
  color: #7357cf;
  white-space: nowrap;
}
.rr-table-region :deep(.rr-actions .ant-btn) {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  width: 28px;
  min-width: 28px;
  padding: 0;
}
.rr-table-region :deep(.rr-actions .ant-btn:not(:disabled)) {
  color: inherit;
}
@media (pointer: coarse) {
  .rr-table-region :deep(.rr-actions .ant-btn) {
    width: 36px;
    min-width: 36px;
    height: 36px;
  }
}
.rr-pagination {
  display: flex;
  align-items: center;
  justify-content: space-between;
  flex-wrap: wrap;
  gap: 10px;
  min-width: 0;
  padding: 14px 16px;
  color: #757080;
  font-size: 13px;
}
.rr-pagination-controls {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  flex-wrap: wrap;
  gap: 8px;
  max-width: 100%;
  min-width: 0;
}
.rr-pagination > span {
  min-width: 0;
  max-width: 100%;
  overflow-wrap: anywhere;
}
.rr-pagination :deep(.ant-pagination) {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 4px 0;
  max-width: 100%;
}
.rr-pagination :deep(.ant-pagination-disabled .ant-btn) {
  color: rgb(0 0 0 / 25%);
}
.rr-page-controls {
  display: flex;
  flex-wrap: wrap;
  min-width: 0;
  max-width: 100%;
  gap: 8px;
  align-items: center;
}
.rr-current-page {
  display: grid;
  place-items: center;
  min-width: 24px;
  height: 24px;
  padding: 0 6px;
  border: 1px solid #7357cf;
  border-radius: 6px;
  color: #7357cf;
  background: #fff;
}
.rr-page-size {
  width: 120px;
  min-width: 0;
  max-width: 100%;
}
@container workspace (max-width: 1450px) {
  .rr-filters :deep(.rr-refund-filters) {
    grid-template-columns: repeat(4, minmax(0, 1fr));
  }
}
@container workspace (max-width: 1250px) {
  .rr-filters :deep(.rr-return-filters),
  .rr-filters :deep(.rr-refund-filters) {
    grid-template-columns: repeat(3, minmax(0, 1fr));
  }
}
@container workspace (max-width: 800px) {
  .rr-filters :deep(.rr-return-filters),
  .rr-filters :deep(.rr-refund-filters) {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}
@container workspace (max-width: 740px) {
  .rr-filter-toggle {
    display: inline-flex;
    align-self: flex-start;
    flex-shrink: 0;
  }
  .rr-filters {
    display: none;
  }
  .rr-filters--open {
    display: block;
  }
}
@media (max-width: 767px) {
  .rr-toolbar,
  .rr-pagination,
  .rr-filters {
    padding: 12px;
  }
  .rr-filters :deep(.ant-form) {
    grid-template-columns: minmax(0, 1fr);
  }
  .rr-filters :deep(.rr-filter-actions) {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    width: 100%;
  }
  .rr-filters :deep(.rr-filter-actions > .ant-btn) {
    width: 100%;
    min-width: 0;
    max-width: 100%;
  }
}
@container workspace (max-width: 500px) {
  .rr-filters :deep(.ant-form) {
    grid-template-columns: minmax(0, 1fr);
  }
  .rr-range-unit {
    display: none;
  }
}
@media (max-height: 650px) {
  .rr-toolbar,
  .rr-pagination {
    padding-block: 8px;
  }
  .rr-filters {
    padding-block: 10px;
  }
}
</style>
