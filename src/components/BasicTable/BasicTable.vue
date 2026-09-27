<script setup lang="ts" generic="T extends object">
import { ref } from 'vue'
import type { TableColumnsType, TablePaginationConfig } from 'ant-design-vue'
import { ReloadOutlined, SearchOutlined } from '@ant-design/icons-vue'

const props = withDefaults(
  defineProps<{
    columns: TableColumnsType<T>
    dataSource: T[]
    loading?: boolean
    pagination?: false | TablePaginationConfig
    rowKey?: string | ((record: T) => string)
    searchable?: boolean
    searchPlaceholder?: string
    rowSelection?: {
      type?: 'checkbox' | 'radio'
      selectedRowKeys?: Array<string | number>
      onChange?: (selectedRowKeys: Array<string | number>, selectedRows: T[]) => void
    }
  }>(),
  {
    loading: false,
    pagination: false,
    rowSelection: undefined,
    rowKey: 'id',
    searchable: false,
    searchPlaceholder: '',
  },
)

const emit = defineEmits<{
  search: [keyword: string]
  reload: []
  pageChange: [page: number, pageSize: number]
}>()

const keyword = ref('')

const submitSearch = (): void => emit('search', keyword.value.trim())
const resetSearch = (): void => {
  keyword.value = ''
  emit('search', '')
}
const handleTableChange = (pagination: TablePaginationConfig): void => {
  if (pagination.current && pagination.pageSize) {
    emit('pageChange', pagination.current, pagination.pageSize)
  }
}
</script>

<template>
  <section class="basic-table">
    <div class="basic-table__toolbar">
      <div class="basic-table__search">
        <a-input-search
          v-if="searchable"
          v-model:value="keyword"
          :placeholder="searchPlaceholder"
          enter-button
          @search="submitSearch"
        >
          <template #enterButton>
            <a-button type="primary" :aria-label="$t('common.search')" @click="submitSearch">
              <SearchOutlined />
            </a-button>
          </template>
        </a-input-search>
        <slot name="toolbar" />
      </div>
      <a-button v-if="searchable" :aria-label="$t('common.reset')" @click="resetSearch">
        {{ $t('common.reset') }}
      </a-button>
      <a-button :aria-label="$t('common.reload')" @click="emit('reload')">
        <ReloadOutlined />
      </a-button>
    </div>
    <a-table
      :columns="props.columns"
      :data-source="props.dataSource"
      :loading="props.loading"
      :pagination="props.pagination"
      :row-key="props.rowKey"
      :row-selection="props.rowSelection"
      @change="handleTableChange"
    >
      <template #bodyCell="scope">
        <slot name="bodyCell" v-bind="scope" />
      </template>
      <template #emptyText>
        <slot name="emptyText">{{ $t('common.noData') }}</slot>
      </template>
    </a-table>
  </section>
</template>

<style scoped>
.basic-table__toolbar,
.basic-table__search {
  display: flex;
  align-items: center;
  gap: 12px;
}

.basic-table__toolbar {
  justify-content: space-between;
  margin-bottom: 16px;
}
</style>
