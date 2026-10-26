<script setup lang="ts" generic="T extends object">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, useId, watch } from 'vue'
import type { TableColumnsType, TablePaginationConfig } from 'ant-design-vue'
import { BasicTable } from '@/components'

const props = withDefaults(
  defineProps<{
    columns: TableColumnsType<T>
    rows: T[]
    title: string
    totalLabel?: string
    loading?: boolean
    pagination?: false | TablePaginationConfig
    rowKey?: string
    scrollWidth: number
    bounded?: boolean
    resetKey?: string
  }>(),
  { loading: false, pagination: false, rowKey: 'id', bounded: false, totalLabel: '', resetKey: '' },
)
const emit = defineEmits<{ reload: []; pageChange: [page: number, size: number] }>()
const root = ref<HTMLElement>()
const width = ref(1200)
const pageSizeId = useId()
const pageConfig = computed(() => props.pagination || undefined)
let observer: ResizeObserver | undefined
onMounted(() => {
  observer = new ResizeObserver(() => {
    width.value = root.value?.clientWidth ?? 1200
  })
  if (root.value) observer.observe(root.value)
})
onBeforeUnmount(() => observer?.disconnect())
watch(
  () => props.resetKey,
  async () => {
    await nextTick()
    const content = root.value?.querySelector<HTMLElement>('.ant-table-content')
    if (content) content.scrollTop = 0
  },
)
</script>

<template>
  <section
    ref="root"
    class="stocktake-table"
    :class="{ 'stocktake-table--bounded': bounded }"
    :aria-label="title"
    :aria-busy="loading"
  >
    <BasicTable
      :columns="columns"
      :data-source="rows"
      :loading="loading"
      :row-key="rowKey"
      :pagination="false"
      :scroll="{ x: scrollWidth }"
      @reload="emit('reload')"
    >
      <template #toolbar>
        <div class="stocktake-table__heading">
          <h2>{{ title }}</h2>
          <span v-if="totalLabel" class="stocktake-table__total">{{ totalLabel }}</span>
        </div>
      </template>
      <template #bodyCell="scope"><slot name="bodyCell" v-bind="scope" /></template>
    </BasicTable>
    <div v-if="pageConfig" class="stocktake-table__footer">
      <div class="stocktake-table__size">
        <label :for="pageSizeId">{{ $t('stocktake.rowsPerPage') }}</label>
        <a-select
          :id="pageSizeId"
          :value="pageConfig.pageSize"
          :aria-label="$t('stocktake.rowsPerPage')"
          :options="[10, 20, 50, 100].map((value) => ({ value, label: String(value) }))"
          @change="(value: number) => emit('pageChange', 1, value)"
        />
      </div>
      <a-pagination
        :current="pageConfig.current"
        :page-size="pageConfig.pageSize"
        :total="pageConfig.total"
        :show-size-changer="false"
        :show-less-items="true"
        :simple="width < 560"
        size="small"
        @change="(page: number) => emit('pageChange', page, pageConfig?.pageSize ?? 10)"
      />
    </div>
  </section>
</template>

<style scoped>
.stocktake-table {
  min-width: 0;
  padding: 0 16px;
  background: #fff;
  border: 1px solid #e9e4f1;
  border-radius: 12px;
}
.stocktake-table :deep(.basic-table__toolbar) {
  margin: 0;
  padding: 14px 0;
}
.stocktake-table :deep(.basic-table__search) {
  min-width: 0;
}
.stocktake-table__heading {
  display: flex;
  align-items: baseline;
  flex-wrap: wrap;
  gap: 6px 12px;
  min-width: 0;
}
h2 {
  margin: 0;
  font-size: 16px;
  font-weight: 600;
  line-height: 24px;
  color: #302640;
}
.stocktake-table__total {
  font-size: 13px;
  color: #757080;
}
.stocktake-table__footer {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 12px;
  flex-wrap: wrap;
  padding: 14px 0;
}
.stocktake-table__size {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 13px;
  color: #757080;
}
.stocktake-table__size :deep(.ant-select) {
  width: 76px;
}
.stocktake-table :deep(.ant-table) {
  font-size: 14px;
}
.stocktake-table :deep(.ant-table-thead > tr > th) {
  height: 48px;
  padding: 10px 12px;
  background: #f8f6fc;
  color: #625b70;
  font-size: 13px;
  font-weight: 600;
  line-height: 20px;
}
.stocktake-table :deep(.ant-table-tbody > tr > td) {
  height: 64px;
  padding: 10px 12px;
  background: #fff;
  border-bottom: 1px solid #f0edf5;
  line-height: 20px;
}
.stocktake-table :deep(.ant-table-tbody > tr:hover > td),
.stocktake-table :deep(.ant-table-tbody > tr > td.ant-table-cell-row-hover) {
  background: #fcfaff;
}
.stocktake-table :deep(.ant-table-cell-fix-right) {
  z-index: 2;
}
.stocktake-table :deep(.ant-table-thead .ant-table-cell-fix-right) {
  z-index: 4;
}
.stocktake-table :deep(.ant-table-content) {
  scrollbar-color: #bfb2d8 #f5f3fa;
  scrollbar-width: thin;
}
.stocktake-table :deep(.ant-table-content::-webkit-scrollbar) {
  width: 10px;
  height: 10px;
}
.stocktake-table :deep(.ant-table-content::-webkit-scrollbar-track) {
  background: #f5f3fa;
}
.stocktake-table :deep(.ant-table-content::-webkit-scrollbar-thumb) {
  background: #bfb2d8;
  border: 2px solid #f5f3fa;
  border-radius: 8px;
}
/* One scroll container owns both axes, keeping the horizontal bar above the footer. */
.stocktake-table--bounded {
  grid-template-columns: minmax(0, 1fr);
  display: grid;
  grid-template-rows: minmax(0, 1fr) auto;
  flex: 1;
  min-height: 240px;
}
.stocktake-table--bounded :deep(.basic-table) {
  grid-template-columns: minmax(0, 1fr);
  min-width: 0;
  display: grid;
  grid-template-rows: auto minmax(0, 1fr);
  min-height: 0;
}
.stocktake-table--bounded :deep(.ant-table-wrapper),
.stocktake-table--bounded :deep(.ant-spin-nested-loading),
.stocktake-table--bounded :deep(.ant-spin-container),
.stocktake-table--bounded :deep(.ant-table),
.stocktake-table--bounded :deep(.ant-table-container),
.stocktake-table--bounded :deep(.ant-table-content) {
  min-height: 0;
  height: 100%;
}
.stocktake-table--bounded :deep(.ant-table-content) {
  overflow: auto !important;
}
.stocktake-table--bounded :deep(.ant-table-thead > tr > th) {
  position: sticky;
  top: 0;
  z-index: 3;
}
.stocktake-table--bounded :deep(.ant-table-thead > tr > th.ant-table-cell-fix-right) {
  z-index: 4;
}
@media (max-width: 767px) {
  .stocktake-table {
    padding-inline: 10px;
  }
}
@media (max-height: 650px) {
  .stocktake-table :deep(.basic-table__toolbar),
  .stocktake-table__footer {
    padding-block: 8px;
  }
}
</style>
