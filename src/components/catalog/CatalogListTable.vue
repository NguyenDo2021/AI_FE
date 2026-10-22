<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { ReloadOutlined } from '@ant-design/icons-vue'
import { theme } from 'ant-design-vue'
import { useI18n } from 'vue-i18n'
import type { CatalogRecord, Product, ProductGroup } from '@/types/catalog'
import { formatNumber } from '@/utils/format'

const props = defineProps<{
  kind: 'products' | 'product-groups'
  rows: CatalogRecord[]
  error: string
  loading: boolean
  total: number
  page: number
  pageSize: number
  groupLabel?: (id: string) => string
  price?: (value: unknown) => string
}>()
const emit = defineEmits<{
  capacity: [size: number]
  pageChange: [page: number, size: number]
  reload: []
}>()
const { t } = useI18n()
const { token } = theme.useToken()
const panel = ref<HTMLElement>()
const toolbar = ref<HTMLElement>()
const footer = ref<HTMLElement>()
const head = ref<HTMLElement>()
const width = ref(1200)
const compact = computed(() => width.value < 480)
const rowHeight = computed(() => (compact.value ? 104 : 84))
const isGroup = computed(() => props.kind === 'product-groups')
const records = computed(() => props.rows as (Product | ProductGroup)[])
const listTitle = computed(() => t(isGroup.value ? 'catalog.groupList' : 'catalog.productList'))
const totalLabel = computed(() =>
  t(isGroup.value ? 'catalog.groupTotal' : 'catalog.productTotal', {
    total: formatNumber(props.total),
  }),
)
type Column = { key: string; title: string; weight: number; align: string; width?: string }
const columnWidth = (column: Column): string | undefined =>
  isGroup.value ? column.width : `${(column.weight / weight.value) * 100}%`
const groupName = (item: Product | ProductGroup): string =>
  'groupId' in item ? (props.groupLabel?.(item.groupId) ?? item.groupId) : '—'
const purchasePrice = (item: Product | ProductGroup): string =>
  'referencePurchasePrice' in item ? (props.price?.(item.referencePurchasePrice) ?? '—') : '—'
const salePrice = (item: Product | ProductGroup): string =>
  'defaultSalePrice' in item ? (props.price?.(item.defaultSalePrice) ?? '—') : '—'
const stock = (item: Product | ProductGroup): string =>
  'lowStockThreshold' in item ? formatNumber(item.lowStockThreshold) : '—'
const description = (item: Product | ProductGroup): string => item.description?.trim() || '—'
const columns = computed<Column[]>(() =>
  isGroup.value
    ? [
        {
          key: 'product',
          title: t('catalog.product-groups'),
          weight: 0,
          align: 'left',
          width: width.value >= 700 ? '30%' : undefined,
        },
        ...(width.value >= 700
          ? [{ key: 'description', title: t('catalog.description'), weight: 0, align: 'left' }]
          : []),
        ...(!compact.value
          ? [
              {
                key: 'status',
                title: t('catalog.status'),
                weight: 0,
                align: 'left',
                width: '148px',
              },
            ]
          : []),
        { key: 'actions', title: t('common.actions'), weight: 0, align: 'center', width: '104px' },
      ]
    : [
        { key: 'product', title: t('catalog.products'), weight: 28, align: 'left' },
        ...(width.value >= 900
          ? [{ key: 'spec', title: t('catalog.groupSpecs'), weight: 23, align: 'left' }]
          : []),
        ...(width.value >= 1080
          ? [
              {
                key: 'purchase',
                title: t('catalog.referencePurchasePrice'),
                weight: 15,
                align: 'right',
              },
            ]
          : []),
        { key: 'sale', title: t('catalog.defaultSalePrice'), weight: 17, align: 'right' },
        ...(width.value >= 1080
          ? [{ key: 'stock', title: t('catalog.stockTrees'), weight: 12, align: 'right' }]
          : []),
        ...(!compact.value
          ? [{ key: 'status', title: t('catalog.status'), weight: 15, align: 'left' }]
          : []),
        {
          key: 'actions',
          title: t('common.actions'),
          weight: compact.value ? 9 : 13,
          align: 'center',
        },
      ],
)
const weight = computed(() => columns.value.reduce((sum, column) => sum + column.weight, 0))
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
let observer: ResizeObserver | undefined
let timer: ReturnType<typeof setTimeout> | undefined
let lastSize = 0
const measure = (): void => {
  if (!panel.value || !toolbar.value || !footer.value || !head.value) return
  width.value = panel.value.clientWidth
  // Panel padding/borders + measured toolbar, header and footer + rounding reserve.
  const style = getComputedStyle(panel.value)
  const chrome =
    parseFloat(style.paddingTop) +
    parseFloat(style.paddingBottom) +
    parseFloat(style.borderTopWidth) +
    parseFloat(style.borderBottomWidth)
  const available =
    panel.value.clientHeight -
    chrome -
    toolbar.value.offsetHeight -
    footer.value.offsetHeight -
    head.value.offsetHeight -
    8
  const size = Math.max(1, Math.min(100, Math.floor(available / rowHeight.value)))
  if (size !== lastSize) {
    lastSize = size
    emit('capacity', size)
  }
}
onMounted(() => {
  observer = new ResizeObserver(() => {
    clearTimeout(timer)
    timer = setTimeout(measure, 140)
  })
  for (const element of [panel.value, toolbar.value, footer.value, head.value]) {
    if (element) observer.observe(element)
  }
})
onBeforeUnmount(() => {
  observer?.disconnect()
  clearTimeout(timer)
})
</script>

<template>
  <section
    ref="panel"
    class="products-panel"
    :class="{ 'groups-panel': isGroup }"
    :style="{
      '--product-row-height': `${rowHeight}px`,
      '--product-accent': token.colorPrimary,
    }"
  >
    <div ref="toolbar" class="products-toolbar">
      <div>
        <h2>{{ listTitle }}</h2>
        <span class="products-total">{{ totalLabel }}</span>
      </div>
      <a-tooltip :title="$t('common.reload')">
        <a-button :aria-label="$t('common.reload')" :loading="loading" @click="emit('reload')"
          ><template #icon><ReloadOutlined /></template
        ></a-button>
      </a-tooltip>
    </div>
    <div class="products-table-region" :aria-busy="loading">
      <a-spin :spinning="loading">
        <table class="products-table" :aria-label="listTitle">
          <colgroup>
            <col
              v-for="column in columns"
              :key="column.key"
              :style="{ width: columnWidth(column) }"
            />
          </colgroup>
          <thead ref="head">
            <tr>
              <th
                v-for="column in columns"
                :key="column.key"
                scope="col"
                :style="{ textAlign: column.align as 'left' | 'right' | 'center' }"
              >
                {{ column.title }}
              </th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="item in records" :key="item.id" class="product-row">
              <td
                v-for="column in columns"
                :key="column.key"
                :style="{ textAlign: column.align as 'left' | 'right' | 'center' }"
              >
                <div v-if="column.key === 'product'" class="product-cell">
                  <a-tooltip :title="item.name"
                    ><strong class="product-name">{{ item.name }}</strong></a-tooltip
                  >
                  <span class="product-code" :title="item.code">{{ item.code }}</span>
                  <a-tag v-if="compact" :color="item.status === 1 ? 'success' : 'default'">{{
                    $t(item.status === 1 ? 'common.active' : 'common.inactive')
                  }}</a-tag>
                </div>
                <div v-else-if="column.key === 'spec'" class="product-cell">
                  <span class="product-ellipsis" :title="groupName(item)">{{
                    groupName(item)
                  }}</span>
                  <span class="product-secondary product-spec" :title="spec(item)">{{
                    spec(item)
                  }}</span>
                </div>
                <span
                  v-else-if="column.key === 'description'"
                  class="product-spec group-description"
                  >{{ description(item) }}</span
                >
                <span
                  v-else-if="column.key === 'purchase'"
                  class="product-money product-secondary"
                  >{{ purchasePrice(item) }}</span
                >
                <strong v-else-if="column.key === 'sale'" class="product-money product-sale">{{
                  salePrice(item)
                }}</strong>
                <span v-else-if="column.key === 'stock'" class="product-money">{{
                  stock(item)
                }}</span>
                <a-tag
                  v-else-if="column.key === 'status'"
                  :color="item.status === 1 ? 'success' : 'default'"
                  >{{ $t(item.status === 1 ? 'common.active' : 'common.inactive') }}</a-tag
                >
                <slot v-else name="actions" :item="item" :compact="!isGroup && width < 900" />
              </td>
            </tr>
          </tbody>
        </table>
        <a-alert v-if="error" type="error" show-icon :message="error" class="products-error" />
        <div v-else-if="!records.length" class="products-empty" role="status">
          {{ loading ? $t('common.loading') : $t('common.noData') }}
        </div>
      </a-spin>
    </div>
    <div ref="footer" class="products-footer">
      <span class="product-secondary">{{
        $t('catalog.productsPerPage', { count: pageSize })
      }}</span>
      <a-pagination
        :current="page"
        :page-size="pageSize"
        :total="total"
        :show-size-changer="false"
        :show-less-items="width < 900"
        :simple="width < 600"
        size="small"
        @change="(next: number) => emit('pageChange', next, pageSize)"
      />
    </div>
  </section>
</template>

<style scoped>
.products-panel {
  display: grid;
  grid-template-rows: auto minmax(0, 1fr) auto;
  flex: 1;
  min-height: 0;
  min-width: 0;
  padding: 0 16px;
  background: #fff;
  border: 1px solid #e9e4f1;
  border-radius: 12px;
}
.products-toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 14px 0;
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
.product-secondary,
.product-code {
  color: #757080;
}
.products-total {
  font-size: 13px;
}
.products-table-region {
  min-height: 0;
  min-width: 0;
}
.products-table {
  width: 100%;
  table-layout: fixed;
  border-collapse: collapse;
  font-size: 14px;
}
th {
  height: 48px;
  padding: 8px 10px;
  background: #f8f6fc;
  color: #625b70;
  font-size: 13px;
  font-weight: 600;
  line-height: 18px;
  overflow-wrap: anywhere;
}
td {
  height: var(--product-row-height);
  padding: 8px 10px;
  border-bottom: 1px solid #f0edf5;
  line-height: 20px;
  vertical-align: middle;
}
.product-row:hover td {
  background: #fcfaff;
}
.product-cell {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  min-width: 0;
  gap: 2px;
}
.product-name,
.product-spec {
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
  overflow-wrap: anywhere;
  max-width: 100%;
}
.product-name {
  line-height: 20px;
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
.product-spec {
  font-size: 13px;
}
.product-money {
  font-variant-numeric: tabular-nums;
  overflow-wrap: anywhere;
}
.product-sale {
  color: var(--product-accent);
  font-weight: 600;
}
.products-panel :deep(.ant-tag) {
  margin: 0;
  max-width: 100%;
  white-space: normal;
  line-height: 18px;
}
.products-footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  padding: 14px 0;
  min-width: 0;
}
.products-footer > span {
  font-size: 13px;
}
.products-empty {
  padding: 18px 0;
  color: #757080;
  text-align: center;
}
@media (max-width: 767px) {
  .products-panel {
    padding: 0 10px;
  }
  th,
  td {
    padding-inline: 6px;
  }
}
@media (max-height: 650px) {
  .products-toolbar,
  .products-footer {
    padding-block: 8px;
  }
}
.products-error {
  margin-top: 12px;
  overflow-wrap: anywhere;
}
/* The host still measures all available height. The group card itself hugs its rows. */
.groups-panel {
  align-content: start;
  grid-template-rows: auto auto auto;
  padding: 0;
  border: 0;
  background: transparent;
}
.groups-panel .products-toolbar {
  padding-inline: 16px;
  background: white;
  border: 1px solid #e9e4f1;
  border-bottom: 0;
  border-radius: 12px 12px 0 0;
}
.groups-panel .products-table-region {
  padding-inline: 16px;
  background: white;
  border-inline: 1px solid #e9e4f1;
}
.groups-panel .products-footer {
  padding-inline: 16px;
  background: white;
  border: 1px solid #e9e4f1;
  border-top: 0;
  border-radius: 0 0 12px 12px;
}
.group-description {
  line-height: 20px;
  color: #757080;
}
@media (max-width: 767px) {
  .groups-panel .products-toolbar,
  .groups-panel .products-table-region,
  .groups-panel .products-footer {
    padding-inline: 10px;
  }
}
</style>
