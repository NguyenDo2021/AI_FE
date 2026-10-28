<script setup lang="ts" generic="T extends object">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { ReloadOutlined } from '@ant-design/icons-vue'
import { theme, type TableColumnsType } from 'ant-design-vue'

const props = defineProps<{
  columns: TableColumnsType<T>
  rows: T[]
  loading: boolean
  error: string
  total: number
  page: number
  pageSize: number
  listTitle: string
  totalLabel: string
  rangeLabel: string
  resetKey: number
  rowHeight?: number
  minBodyHeight?: number
  bodyMaxHeight?: number
  flow?: boolean
  rowKey?: string | ((record: T) => string)
}>()
const emit = defineEmits<{
  pageChange: [page: number, size: number]
  reload: []
}>()
const { token } = theme.useToken()
const { t } = useI18n()
const pageSizeOptions = computed(() =>
  [10, 20, 50, 100].map((size) => ({
    value: size,
    label: t('catalog.rowsPerPageOption', { size }),
  })),
)
const panel = ref<HTMLElement>()
const region = ref<HTMLElement>()
const width = ref(1200)
const bodyHeight = ref(160)
const bodyGutter = ref(0)
const panelMinHeight = ref<number>()
const compact = computed(() => width.value < 600)
const sizedColumns = computed<TableColumnsType<T>>(() =>
  props.columns.map((column) =>
    column.key === 'actions'
      ? { ...column, width: compact.value ? 84 : column.width, fixed: 'right' }
      : column,
  ),
)
const scrollWidth = computed(() =>
  sizedColumns.value.reduce((sum, column) => sum + Number(column.width || 0), 0),
)
// Let one column absorb extra space rather than proportionally stretching all
// columns: Ant measures integer widths for its separate fixed header colgroup.
const tableColumns = computed<TableColumnsType<T>>(() =>
  sizedColumns.value.map((column, index) =>
    index === 0 ? { ...column, width: undefined } : column,
  ),
)
const changePage = (page: number, size: number): void => {
  const next = size === props.pageSize ? page : 1
  if (next !== props.page || size !== props.pageSize) emit('pageChange', next, size)
}

// Only observe the space assigned by the grid. Updating scroll.y cannot resize
// this region and feed its own measurement back into the layout.
let observer: ResizeObserver | undefined
let frame = 0
let disposed = false
const measure = (): void => {
  if (disposed || !region.value || !panel.value) return
  width.value = panel.value.clientWidth
  const header = region.value.querySelector<HTMLElement>('.ant-table-header')
  if (props.minBodyHeight !== undefined) {
    // An explicit minimum must depend on the chrome, never on the current body
    // height; otherwise a previously tall body prevents the flex panel shrinking.
    const toolbar = panel.value.querySelector<HTMLElement>('.products-toolbar')
    const footer = panel.value.querySelector<HTMLElement>('.products-footer')
    const minimum = Math.ceil(
      (toolbar?.offsetHeight ?? 0) +
        (footer?.offsetHeight ?? 0) +
        (header?.offsetHeight ?? 48) +
        props.minBodyHeight +
        2,
    )
    if (minimum !== panelMinHeight.value) panelMinHeight.value = minimum
  }
  const next = Math.max(80, Math.floor(region.value.clientHeight - (header?.offsetHeight ?? 48)))
  if (next !== bodyHeight.value) bodyHeight.value = next
  const body = region.value.querySelector<HTMLElement>('.ant-table-body')
  const scrollbar = header?.querySelector<HTMLElement>('.ant-table-cell-scrollbar')
  // Ant reserves a scrollbar column in the header even when overflow-y:auto
  // removes the body's unused vertical bar. Give the body the same outer inset.
  const gutter = body && body.scrollHeight <= body.clientHeight ? (scrollbar?.offsetWidth ?? 0) : 0
  if (gutter !== bodyGutter.value) bodyGutter.value = gutter
}
const scheduleMeasure = (): void => {
  if (disposed) return
  cancelAnimationFrame(frame)
  frame = requestAnimationFrame(measure)
}
onMounted(async () => {
  await nextTick()
  if (disposed) return
  observer = new ResizeObserver(scheduleMeasure)
  for (const element of [
    panel.value,
    region.value,
    region.value?.querySelector('.ant-table-header'),
    ...(props.minBodyHeight === undefined
      ? []
      : [
          panel.value?.querySelector('.products-toolbar'),
          panel.value?.querySelector('.products-footer'),
        ]),
  ]) {
    if (element) observer.observe(element)
  }
  window.addEventListener('resize', scheduleMeasure)
  window.visualViewport?.addEventListener('resize', scheduleMeasure)
  measure()
})
watch(
  () => [props.rows, bodyHeight.value, compact.value],
  async () => {
    await nextTick()
    scheduleMeasure()
  },
)
watch(
  () => [props.page, props.pageSize, props.resetKey],
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
  window.removeEventListener('resize', scheduleMeasure)
  window.visualViewport?.removeEventListener('resize', scheduleMeasure)
})
</script>

<template>
  <section
    ref="panel"
    class="fitted-list-panel"
    :class="{ 'fitted-list-panel--content': bodyMaxHeight !== undefined || flow }"
    :style="{
      minHeight: panelMinHeight === undefined ? undefined : `${panelMinHeight}px`,
      '--list-body-gutter': `${bodyGutter}px`,
      '--list-hover': token.colorPrimaryBg,
      '--list-selected': token.controlItemBgActive,
      '--list-row-height': `${rowHeight ?? 76}px`,
    }"
  >
    <div class="products-toolbar">
      <div>
        <h2>{{ listTitle }}</h2>
        <span class="products-total">{{ totalLabel }}</span>
      </div>
      <a-tooltip :title="$t('common.reload')">
        <a-button :aria-label="$t('common.reload')" :loading="loading" @click="emit('reload')">
          <template #icon><ReloadOutlined /></template>
        </a-button>
      </a-tooltip>
    </div>
    <div ref="region" class="products-table-region" :aria-busy="loading">
      <a-table
        :columns="tableColumns"
        :data-source="rows"
        :pagination="false"
        :loading="loading"
        :scroll="{
          x: scrollWidth,
          y: flow ? undefined : (bodyMaxHeight ?? bodyHeight),
          scrollToFirstRowOnChange: false,
        }"
        :row-key="rowKey ?? 'id'"
        table-layout="fixed"
        :aria-label="listTitle"
      >
        <template #bodyCell="scope">
          <slot name="bodyCell" v-bind="scope" :compact="compact" />
        </template>
        <template #emptyText>{{ error || $t('common.noData') }}</template>
      </a-table>
    </div>
    <div class="products-footer">
      <span class="list-range">{{ rangeLabel }}</span>
      <div class="list-pagination-controls">
        <a-pagination
          :current="page"
          :page-size="pageSize"
          :total="total"
          :show-size-changer="false"
          :show-less-items="width < 900"
          :simple="compact"
          size="small"
          @change="(next: number) => changePage(next, pageSize)"
        />
        <a-select
          class="list-page-size"
          :value="pageSize"
          :options="pageSizeOptions"
          :aria-label="$t('catalog.rowsPerPage')"
          @change="(size: number) => changePage(1, size)"
        />
      </div>
    </div>
  </section>
</template>

<style scoped>
.fitted-list-panel {
  display: grid;
  grid-template-rows: auto minmax(0, 1fr) auto;
  flex: 1;
  min-height: 280px;
  min-width: 0;
  border: 1px solid #e9e4f1;
  border-radius: 12px;
  background: #fff;
}
/* Embedded tables size to their content; their body scrolls at the supplied cap. */
.fitted-list-panel--content {
  display: block;
  flex: none;
  min-height: 0;
}
.products-toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 14px 16px;
}
.products-toolbar > div {
  display: flex;
  align-items: baseline;
  flex-wrap: wrap;
  gap: 10px;
}
h2 {
  margin: 0;
  font-size: 16px;
  font-weight: 600;
}
.products-total,
.list-range {
  color: #757080;
  font-size: 13px;
}
.products-table-region {
  min-height: 0;
  min-width: 0;
}
.products-footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  flex-wrap: wrap;
  gap: 10px;
  padding: 14px 16px;
  min-width: 0;
}
.products-footer :deep(.ant-pagination) {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 4px 0;
  max-width: 100%;
}
.list-pagination-controls {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  flex-wrap: wrap;
  gap: 8px;
  max-width: 100%;
}
.list-page-size {
  width: 120px;
}
.fitted-list-panel :deep(.ant-table) {
  border-radius: 0;
  font-size: 14px;
}
.fitted-list-panel :deep(.ant-table-thead > tr > th) {
  height: 48px;
  padding: 8px 16px;
  background: #f8f6fc;
  color: #625b70;
  font-size: 13px;
  font-weight: 600;
  line-height: 18px;
}
.fitted-list-panel :deep(.ant-table-tbody > tr > td) {
  height: var(--list-row-height);
  padding: 8px 16px;
  border-bottom: 1px solid #f0edf5;
  line-height: 20px;
  background: #fff;
}
.fitted-list-panel :deep(.ant-table-tbody > tr:hover > td),
.fitted-list-panel :deep(.ant-table-tbody > tr > td.ant-table-cell-row-hover) {
  background: var(--list-hover);
}
.fitted-list-panel :deep(.ant-table-tbody > tr.ant-table-row-selected > td) {
  background: var(--list-selected);
}
.fitted-list-panel :deep(.ant-table-cell-fix-right) {
  z-index: 2;
}
.fitted-list-panel :deep(.ant-table-thead .ant-table-cell-fix-right) {
  z-index: 3;
}
.fitted-list-panel :deep(.ant-table-ping-right .ant-table-cell-fix-right-first::after) {
  box-shadow: inset -8px 0 8px -8px rgb(48 38 64 / 22%);
}
/* Preserve Ant's header gutter without forcing an unused vertical scrollbar. */
.fitted-list-panel :deep(.ant-table-body) {
  overflow-y: auto !important;
  margin-inline-end: var(--list-body-gutter);
}
.fitted-list-panel :deep(.ant-table-body::-webkit-scrollbar) {
  width: 10px;
  height: 10px;
}
.fitted-list-panel :deep(.ant-table-body::-webkit-scrollbar-track) {
  background: #f5f3fa;
}
.fitted-list-panel :deep(.ant-table-body::-webkit-scrollbar-thumb) {
  background: #bfb2d8;
  border: 2px solid #f5f3fa;
  border-radius: 8px;
}
.fitted-list-panel :deep(.ant-tag) {
  margin: 0;
  max-width: 100%;
  white-space: normal;
  line-height: 18px;
}
@media (max-width: 767px) {
  .products-toolbar,
  .products-footer {
    padding: 12px;
  }
}
@media (max-height: 650px) {
  .products-toolbar,
  .products-footer {
    padding-block: 8px;
  }
}
</style>
