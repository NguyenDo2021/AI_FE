<script setup lang="ts" generic="T extends object">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import {
  LeftOutlined,
  RightOutlined,
  ReloadOutlined,
  UnorderedListOutlined,
} from '@ant-design/icons-vue'
import type { TableColumnsType } from 'ant-design-vue'
import type { StockInteger } from '@/types/stock'
import { formatStockInteger } from '@/utils/stock'
import { hasNextPage } from '@/utils/returns'

const props = defineProps<{
  title: string
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
const region = ref<HTMLElement>()
const bodyHeight = ref(200)
const bodyGutter = ref(0)
const scrollWidth = computed(() =>
  props.columns.reduce((sum, column) => sum + Number(column.width || 0), 0),
)
let observer: ResizeObserver | undefined
let frame = 0
let disposed = false
const measure = (): void => {
  if (disposed || !region.value) return
  const header = region.value.querySelector<HTMLElement>('.ant-table-header')
  bodyHeight.value = Math.max(
    80,
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
  if (region.value) observer.observe(region.value)
  const header = region.value?.querySelector('.ant-table-header')
  if (header) observer.observe(header)
  window.addEventListener('resize', schedule)
  window.visualViewport?.addEventListener('resize', schedule)
  measure()
})
watch(
  () => [props.rows, props.columns, bodyHeight.value],
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
  <section class="rr-list" :style="{ '--rr-body-gutter': `${bodyGutter}px` }">
    <header class="rr-toolbar">
      <h2><UnorderedListOutlined aria-hidden="true" /> {{ title }}</h2>
      <div class="rr-toolbar-actions">
        <slot name="actions" />
        <a-tooltip title="Tải lại danh sách"
          ><a-button aria-label="Tải lại danh sách" :loading="loading" @click="emit('reload')"
            ><template #icon><ReloadOutlined /></template></a-button
        ></a-tooltip>
      </div>
    </header>
    <div class="rr-filters"><slot name="filters" /></div>
    <div ref="region" class="rr-table-region" :aria-busy="loading">
      <a-table
        :columns="columns"
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
        >Tổng {{ total === undefined ? '—' : formatStockInteger(total) }} · Trang {{ page }}</span
      >
      <div class="rr-page-controls">
        <a-button
          aria-label="Trang trước"
          :disabled="loading || page <= 1"
          @click="emit('pageChange', page - 1, pageSize)"
          ><template #icon><LeftOutlined /></template
        ></a-button>
        <span class="rr-current-page" aria-current="page">{{ page }}</span>
        <a-button
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
    </footer>
  </section>
</template>

<style scoped>
.rr-list {
  display: grid;
  grid-template-rows: auto auto minmax(0, 1fr) auto;
  flex: 1;
  min-height: 300px;
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
  padding: 16px 18px 12px;
}
.rr-toolbar h2 {
  display: flex;
  align-items: center;
  gap: 10px;
  margin: 0;
  color: #302640;
  font-size: 17px;
  font-weight: 600;
}
.rr-toolbar h2 :deep(.anticon) {
  color: #7950d7;
}
.rr-toolbar-actions {
  display: flex;
  align-items: center;
  gap: 8px;
}
.rr-filters {
  padding: 0 18px 16px;
}
.rr-filters :deep(.ant-form) {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 12px;
  align-items: end;
}
.rr-filters :deep(.ant-form-item) {
  min-width: 0;
  margin: 0;
}
.rr-filters :deep(.ant-form-item-label) {
  padding-bottom: 4px;
}
.rr-filters :deep(.ant-form-item-label > label) {
  font-size: 13px;
  color: #625b70;
}
.rr-filters :deep(.ant-select),
.rr-filters :deep(.ant-picker) {
  width: 100%;
  min-width: 0;
}
.rr-table-region {
  min-height: 0;
  min-width: 0;
}
.rr-table-region :deep(.ant-table) {
  font-size: 14px;
}
.rr-table-region :deep(.ant-table-thead > tr > th) {
  padding: 10px 14px;
  color: #625b70;
  background: #f8f6fc;
  font-size: 13px;
  line-height: 20px;
}
.rr-table-region :deep(.ant-table-tbody > tr > td) {
  padding: 12px 14px;
  height: 62px;
  background: #fff;
  border-bottom: 1px solid #f0edf5;
}
.rr-table-region :deep(.ant-table-tbody > tr:hover > td),
.rr-table-region :deep(td.ant-table-cell-row-hover) {
  background: #f7f3ff;
}
.rr-table-region :deep(.ant-table-cell-fix-right) {
  z-index: 2;
}
.rr-table-region :deep(.ant-table-thead .ant-table-cell-fix-right) {
  z-index: 3;
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
  flex-wrap: wrap;
  gap: 6px;
}
.rr-table-region :deep(.rr-actions .ant-btn) {
  max-width: 100%;
  height: auto;
  min-height: 30px;
  white-space: normal;
}
.rr-pagination {
  display: flex;
  align-items: center;
  justify-content: space-between;
  flex-wrap: wrap;
  gap: 10px;
  padding: 12px 18px;
  border-top: 1px solid #f0edf5;
  color: #625b70;
  font-size: 13px;
}
.rr-page-controls {
  display: flex;
  gap: 8px;
  align-items: center;
}
.rr-current-page {
  display: grid;
  place-items: center;
  min-width: 32px;
  height: 32px;
  padding: 0 6px;
  border: 1px solid #a48ce5;
  border-radius: 6px;
  color: #7357cf;
  background: #f8f5ff;
}
.rr-page-size {
  width: 124px;
}
@media (max-width: 1000px) {
  .rr-filters :deep(.ant-form) {
    grid-template-columns: repeat(3, minmax(0, 1fr));
  }
}
@media (max-width: 650px) {
  .rr-toolbar {
    padding: 12px;
  }
  .rr-filters {
    padding: 0 12px 12px;
    max-height: 33dvh;
    overflow: auto;
  }
  .rr-filters :deep(.ant-form) {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
  .rr-pagination {
    padding: 10px 12px;
  }
}
@media (max-width: 420px) {
  .rr-filters :deep(.ant-form) {
    grid-template-columns: minmax(0, 1fr);
  }
}
@media (max-height: 650px) {
  .rr-list {
    min-height: 260px;
  }
  .rr-toolbar,
  .rr-pagination {
    padding-block: 8px;
  }
  .rr-filters {
    max-height: 25dvh;
    overflow: auto;
    padding-bottom: 10px;
  }
}
</style>
