<script setup lang="ts">
import { computed } from 'vue'
import { theme, type TableColumnsType } from 'ant-design-vue'
import { useI18n } from 'vue-i18n'
import FittedListTable from './FittedListTable.vue'
import type { CatalogKind, CatalogRecord, Product, ProductGroup } from '@/types/catalog'
import { formatNumber } from '@/utils/format'

const props = defineProps<{
  kind: CatalogKind
  rows: CatalogRecord[]
  error: string
  loading: boolean
  total: number
  page: number
  pageSize: number
  resetKey: number
  groupLabel?: (id: string) => string
  price?: (value: unknown) => string
}>()
const emit = defineEmits<{
  pageChange: [page: number, size: number]
  reload: []
}>()
const { t } = useI18n()
const { token } = theme.useToken()
const isWarehouse = computed(() => props.kind === 'warehouses')
const isGroup = computed(() => props.kind === 'product-groups')
const listTitle = computed(() =>
  t(
    isWarehouse.value
      ? 'catalog.warehouseList'
      : isGroup.value
        ? 'catalog.groupList'
        : 'catalog.productList',
  ),
)
const totalLabel = computed(() =>
  t(
    isWarehouse.value
      ? 'catalog.warehouseTotal'
      : isGroup.value
        ? 'catalog.groupTotal'
        : 'catalog.productTotal',
    { total: formatNumber(props.total) },
  ),
)
const rangeLabel = computed(() =>
  t(
    isWarehouse.value
      ? 'catalog.warehouseRange'
      : isGroup.value
        ? 'catalog.groupRange'
        : 'catalog.productRange',
    {
      from: props.rows.length ? (props.page - 1) * props.pageSize + 1 : 0,
      to: props.rows.length
        ? Math.min((props.page - 1) * props.pageSize + props.rows.length, props.total)
        : 0,
      total: formatNumber(props.total),
    },
  ),
)
const columns = computed<TableColumnsType<CatalogRecord>>(() =>
  isWarehouse.value
    ? [
        { title: t('catalog.code'), dataIndex: 'code', key: 'code', width: 148 },
        { title: t('catalog.name'), dataIndex: 'name', key: 'name', width: 220 },
        { title: t('catalog.address'), dataIndex: 'address', key: 'address', width: 300 },
        { title: t('catalog.phone'), dataIndex: 'phone', key: 'phone', width: 156 },
        { title: t('catalog.status'), dataIndex: 'status', key: 'status', width: 164 },
        { title: t('common.actions'), key: 'actions', width: 144, fixed: 'right', align: 'center' },
      ]
    : isGroup.value
      ? [
          { key: 'product', title: t('catalog.product-groups'), width: 280 },
          { key: 'description', title: t('catalog.description'), width: 380 },
          { key: 'status', title: t('catalog.status'), width: 148 },
          {
            key: 'actions',
            title: t('common.actions'),
            width: 104,
            fixed: 'right',
            align: 'center',
          },
        ]
      : [
          { key: 'product', title: t('catalog.products'), width: 280 },
          { key: 'spec', title: t('catalog.groupSpecs'), width: 230 },
          {
            key: 'purchase',
            title: t('catalog.referencePurchasePrice'),
            width: 150,
            align: 'right',
          },
          { key: 'sale', title: t('catalog.defaultSalePrice'), width: 170, align: 'right' },
          { key: 'stock', title: t('catalog.stockTrees'), width: 120, align: 'right' },
          { key: 'status', title: t('catalog.status'), width: 150 },
          {
            key: 'actions',
            title: t('common.actions'),
            width: 130,
            fixed: 'right',
            align: 'center',
          },
        ],
)
const optionalText = (value: unknown): string => String(value ?? '').trim() || '—'
const groupName = (item: Product | ProductGroup): string =>
  'groupId' in item ? (props.groupLabel?.(item.groupId) ?? item.groupId) : '—'
const purchasePrice = (item: Product | ProductGroup): string =>
  'referencePurchasePrice' in item ? (props.price?.(item.referencePurchasePrice) ?? '—') : '—'
const salePrice = (item: Product | ProductGroup): string =>
  'defaultSalePrice' in item ? (props.price?.(item.defaultSalePrice) ?? '—') : '—'
const stock = (item: Product | ProductGroup): string =>
  'lowStockThreshold' in item ? formatNumber(item.lowStockThreshold) : '—'
const spec = (item: Product | ProductGroup): string => {
  if (!('groupId' in item)) return '—'
  return (
    [
      item.material,
      item.lengthMeters == null ? '' : `${formatNumber(item.lengthMeters)} m`,
      item.color,
    ]
      .filter(Boolean)
      .join(' · ') || '—'
  )
}
</script>

<template>
  <FittedListTable
    class="products-panel"
    :class="{ 'groups-panel': isGroup || isWarehouse, 'warehouses-panel': isWarehouse }"
    :style="{ '--product-accent': token.colorPrimary }"
    :columns="columns"
    :rows="rows"
    :error="error"
    :loading="loading"
    :total="total"
    :page="page"
    :page-size="pageSize"
    :reset-key="resetKey"
    :row-height="isWarehouse ? 76 : 84"
    :list-title="listTitle"
    :total-label="totalLabel"
    :range-label="rangeLabel"
    @page-change="(next, size) => emit('pageChange', next, size)"
    @reload="emit('reload')"
  >
    <template #bodyCell="{ column, record, compact }">
      <slot v-if="column.key === 'actions'" name="actions" :item="record" :compact="compact" />
      <a-tag
        v-else-if="column.key === 'status'"
        :color="record.status === 1 ? 'success' : 'default'"
      >
        {{ $t(record.status === 1 ? 'common.active' : 'common.inactive') }}
      </a-tag>
      <template v-else-if="isWarehouse">
        <span v-if="column.key === 'phone'" class="warehouse-phone">{{
          optionalText(record.phone)
        }}</span>
        <a-tooltip v-else :title="optionalText(record[column.key])">
          <span :class="['warehouse-text', `warehouse-${column.key}`]">{{
            optionalText(record[column.key])
          }}</span>
        </a-tooltip>
      </template>
      <div v-else-if="column.key === 'product'" class="product-cell">
        <a-tooltip :title="record.name"
          ><strong class="product-name">{{ record.name }}</strong></a-tooltip
        >
        <span class="product-code" :title="record.code">{{ record.code }}</span>
      </div>
      <div v-else-if="column.key === 'spec'" class="product-cell">
        <span class="product-ellipsis" :title="groupName(record)">{{ groupName(record) }}</span>
        <span class="product-secondary product-spec" :title="spec(record)">{{ spec(record) }}</span>
      </div>
      <span
        v-else-if="column.key === 'description'"
        class="product-spec group-description"
        :title="optionalText(record.description)"
        >{{ optionalText(record.description) }}</span
      >
      <span v-else-if="column.key === 'purchase'" class="product-money product-secondary">{{
        purchasePrice(record)
      }}</span>
      <strong v-else-if="column.key === 'sale'" class="product-money product-sale">{{
        salePrice(record)
      }}</strong>
      <span v-else-if="column.key === 'stock'" class="product-money">{{ stock(record) }}</span>
    </template>
  </FittedListTable>
</template>

<style scoped>
.product-cell {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  min-width: 0;
  gap: 2px;
}
.product-name,
.product-spec,
.warehouse-text {
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
  overflow-wrap: anywhere;
  max-width: 100%;
  max-height: 40px;
}
.product-name,
.warehouse-name {
  font-weight: 600;
}
.product-code,
.product-ellipsis {
  display: block;
  max-width: 100%;
  white-space: nowrap;
  text-overflow: ellipsis;
  overflow: hidden;
}
.product-code,
.product-spec,
.warehouse-code {
  font-size: 13px;
}
.product-code,
.product-secondary,
.group-description {
  color: #757080;
}
.product-money,
.warehouse-code,
.warehouse-phone {
  font-variant-numeric: tabular-nums;
}
.product-money {
  overflow-wrap: anywhere;
}
.product-sale {
  color: var(--product-accent);
  font-weight: 600;
}
.warehouse-code {
  font-family: ui-monospace, SFMono-Regular, Consolas, monospace;
}
</style>
