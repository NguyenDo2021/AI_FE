<script setup lang="ts">
import { computed, onBeforeUnmount, ref, useId, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { theme, type TableColumnsType } from 'ant-design-vue'
import { ReloadOutlined, ShopOutlined } from '@ant-design/icons-vue'
import FittedListTable from '@/components/catalog/FittedListTable.vue'
import ProductSelect from '@/components/stock/ProductSelect.vue'
import SalesOrderDialog from '@/components/sales/SalesOrderDialog.vue'
import ReceiptDialog from '@/components/stock/ReceiptDialog.vue'
import { getInventory, getMovements } from '@/api/stock/stock.api'
import { useWarehouseStore } from '@/stores/warehouse'
import { useStockStore } from '@/stores/stock'
import { useAuthStore } from '@/stores/auth'
import { useCatalogPermission } from '@/composables/useCatalogPermission'
import { formatDateTime } from '@/utils/date'
import { formatStockInteger, stockError, movementRange } from '@/utils/stock'
import type { Inventory, Movement } from '@/types/stock'

const props = defineProps<{ movements?: boolean }>()
const { t, te } = useI18n()
const { token } = theme.useToken()
const { can } = useCatalogPermission()
const auth = useAuthStore()
const warehouse = useWarehouseStore()
const stock = useStockStore()
const filterId = useId()
const rows = ref<(Inventory | Movement)[]>([])
const productId = ref<string>()
const from = ref('')
const to = ref('')
const page = ref(1)
const pageSize = ref(10)
const total = ref(0)
const error = ref('')
const loading = ref(false)
const scrollRevision = ref(0)
const receiptId = ref<string>()
const detailOpen = ref(false)
const salesOrderId = ref<string>()
const salesDetailOpen = ref(false)
let sequence = 0
const permission = computed(() => (props.movements ? 'INVENTORY_MOVEMENT_VIEW' : 'INVENTORY_VIEW'))
const listTitle = computed(() => t(props.movements ? 'stock.movementList' : 'stock.inventoryList'))
const rangeLabel = computed(() =>
  t('stock.listRange', {
    from: rows.value.length ? (page.value - 1) * pageSize.value + 1 : 0,
    to: rows.value.length
      ? Math.min((page.value - 1) * pageSize.value + rows.value.length, total.value)
      : 0,
    total: formatStockInteger(total.value),
  }),
)
const columns = computed<TableColumnsType<Inventory | Movement>>(() =>
  (props.movements
    ? [
        'performedAt',
        'productCode',
        'productName',
        'unit',
        'quantityChange',
        'type',
        'sourceDocument',
        'performedBy',
      ]
    : ['productCode', 'productName', 'unit', 'productStatus', 'quantity']
  ).map((key) => ({
    title: t('stock.' + key),
    key,
    dataIndex: key,
    width: (
      {
        performedAt: 170,
        productCode: 170,
        productName: 260,
        unit: 100,
        productStatus: 190,
        quantity: 300,
        quantityChange: 150,
        type: 210,
        sourceDocument: 240,
        performedBy: 230,
      } as Record<string, number>
    )[key],
    ...(key === 'quantity' || key === 'quantityChange' ? { align: 'right' as const } : {}),
  })),
)
const rowKey = (item: Inventory | Movement): string =>
  'id' in item ? item.id : item.warehouseId + ':' + item.productId
const movementLabel = (type: string): string => (te('stock.' + type) ? t('stock.' + type) : type)
const sourceLabel = (record: Movement): string => {
  if (record.type === 'SALE_RETURN') return record.salesReturnCode ?? record.salesReturnId ?? '—'
  if (record.type === 'STOCKTAKE_ADJUSTMENT')
    return record.stocktakeCode ?? record.stocktakeId ?? '-'
  if (record.type === 'SALE_CONFIRM' || record.type === 'SALE_CANCEL')
    return record.salesOrderCode ?? record.salesOrderId ?? '—'
  return record.receiptCode ?? record.receiptId ?? '—'
}
const load = async (): Promise<void> => {
  const current = ++sequence
  ++scrollRevision.value
  rows.value = []
  total.value = 0
  error.value = ''
  loading.value = false
  const warehouseId = warehouse.selectedId
  if (!warehouseId || !can(permission.value)) return
  if (
    props.movements &&
    from.value &&
    to.value &&
    new Date(from.value).getTime() >= new Date(to.value).getTime()
  ) {
    error.value = t('stock.invalidRange')
    return
  }
  loading.value = true
  try {
    const params = {
      page: page.value,
      pageSize: pageSize.value,
      ...(productId.value ? { productId: productId.value } : {}),
    }
    const result = props.movements
      ? await getMovements(warehouseId, { ...params, ...movementRange(from.value, to.value) })
      : await getInventory(warehouseId, params)
    if (current !== sequence) return
    rows.value = result.items
    total.value = result.total
    if (
      !result.items.length &&
      page.value > Math.max(1, Math.ceil(result.total / pageSize.value))
    ) {
      page.value = Math.max(1, Math.ceil(result.total / pageSize.value))
      void load()
    }
  } catch (cause) {
    if (current === sequence) error.value = stockError(cause, t)
  } finally {
    if (current === sequence) loading.value = false
  }
}
watch(
  () => [
    warehouse.selectedId,
    props.movements,
    productId.value,
    from.value,
    to.value,
    stock.revision,
    auth.user?.id,
    auth.user?.permissions.join(','),
    auth.isCatalogAdmin,
  ],
  () => {
    detailOpen.value = false
    salesDetailOpen.value = false
    page.value = 1
    void load()
  },
  { immediate: true },
)
onBeforeUnmount(() => ++sequence)
const changePage = (next: number, size: number): void => {
  if (![10, 20, 50, 100].includes(size)) return
  const target = size !== pageSize.value ? 1 : next
  if (target === page.value && size === pageSize.value) return
  page.value = target
  pageSize.value = size
  void load()
}
const showSalesOrder = (id: string): void => {
  salesOrderId.value = id
  salesDetailOpen.value = true
}
const showReceipt = (id: string): void => {
  receiptId.value = id
  detailOpen.value = true
}
const reset = (): void => {
  productId.value = undefined
  from.value = ''
  to.value = ''
}
</script>

<template>
  <a-config-provider :theme="{ token: { colorPrimary: '#7357cf', borderRadius: 8 } }">
    <section
      class="inventory-page"
      :style="{
        '--inventory-positive': token.colorSuccessText,
        '--inventory-negative': token.colorErrorText,
        '--inventory-muted': token.colorTextSecondary,
        '--inventory-warehouse-bg': token['purple-1'],
        '--inventory-warehouse-text': token['purple-6'],
      }"
    >
      <div class="inventory-heading">
        <div>
          <h1>{{ t(movements ? 'stock.movements' : 'stock.inventory') }}</h1>
          <p>{{ t(movements ? 'stock.movementsDescription' : 'stock.inventoryDescription') }}</p>
        </div>
        <div v-if="warehouse.selected" class="inventory-warehouse">
          <ShopOutlined aria-hidden="true" />
          <span
            >{{ t('stock.warehouse') }}: <strong>{{ warehouse.selected.name }}</strong></span
          >
        </div>
      </div>
      <a-alert v-if="error" type="error" :message="error" show-icon />
      <a-alert v-if="!can(permission)" type="warning" :message="t('stock.forbidden')" show-icon />
      <a-alert
        v-else-if="!warehouse.selectedId"
        type="info"
        :message="t('stock.selectWarehouse')"
        show-icon
      />
      <template v-else>
        <div class="inventory-filters">
          <label class="inventory-filter inventory-filter--product">
            <span>{{ t('stock.product') }}</span>
            <ProductSelect v-model:value="productId" />
          </label>
          <template v-if="movements">
            <div class="inventory-filter">
              <label :for="filterId + '-from'">{{ t('stock.fromTime') }}</label>
              <a-date-picker
                :id="filterId + '-from'"
                v-model:value="from"
                show-time
                value-format="YYYY-MM-DDTHH:mm:ssZ"
                :placeholder="t('stock.fromTime')"
                :aria-label="t('stock.fromTime')"
                :aria-describedby="filterId + '-hint'"
              />
            </div>
            <div class="inventory-filter">
              <label :for="filterId + '-to'">{{ t('stock.toTime') }}</label>
              <a-date-picker
                :id="filterId + '-to'"
                v-model:value="to"
                show-time
                value-format="YYYY-MM-DDTHH:mm:ssZ"
                :placeholder="t('stock.toTime')"
                :aria-label="t('stock.toTime')"
                :aria-describedby="filterId + '-hint'"
              />
            </div>
          </template>
          <a-button class="inventory-reset" @click="reset">
            <template #icon><ReloadOutlined aria-hidden="true" /></template>
            {{ t('common.reset') }}
          </a-button>
          <p v-if="movements" :id="filterId + '-hint'" class="inventory-time-hint">
            {{ t('stock.exclusiveHint') }}
          </p>
        </div>
        <FittedListTable
          class="inventory-table"
          :columns="columns"
          :rows="rows"
          :row-key="rowKey"
          :loading="loading"
          :error="error"
          :total="total"
          :page="page"
          :page-size="pageSize"
          :reset-key="scrollRevision"
          :row-height="60"
          :list-title="listTitle"
          :total-label="t('stock.listTotal', { total: formatStockInteger(total) })"
          :range-label="rangeLabel"
          @reload="load"
          @page-change="changePage"
        >
          <template #bodyCell="{ column, record }">
            <span
              v-if="column.key === 'quantity'"
              class="inventory-quantity"
              :class="{ 'inventory-zero': BigInt(record.quantity) === 0n }"
              >{{ formatStockInteger(record.quantity) }}</span
            >
            <span
              v-else-if="column.key === 'quantityChange'"
              class="inventory-quantity"
              :class="{
                positive: BigInt(record.quantityChange) > 0n,
                negative: BigInt(record.quantityChange) < 0n,
                'inventory-zero': BigInt(record.quantityChange) === 0n,
              }"
              >{{ BigInt(record.quantityChange) > 0n ? '+' : ''
              }}{{ formatStockInteger(record.quantityChange) }}</span
            >
            <a-tooltip v-else-if="column.key === 'type'" :title="movementLabel(record.type)">
              <span class="inventory-ellipsis">{{ movementLabel(record.type) }}</span>
            </a-tooltip>
            <span v-else-if="column.key === 'performedAt'" class="inventory-date">
              {{ formatDateTime(record.performedAt) }}
            </span>
            <a-tag
              v-else-if="column.key === 'productStatus'"
              :color="record.productStatus === 1 ? 'success' : 'default'"
              >{{ t(record.productStatus === 1 ? 'common.active' : 'common.inactive') }}</a-tag
            >
            <a-tooltip v-else-if="column.key === 'sourceDocument'" :title="sourceLabel(record)">
              <div class="inventory-source">
                <template v-if="record.type === 'SALE_RETURN'">
                  <router-link
                    v-if="record.salesReturnId && can('SALES_RETURN_VIEW')"
                    class="inventory-ellipsis"
                    :to="{ path: '/sales/returns', query: { returnId: record.salesReturnId } }"
                    >{{ sourceLabel(record) }}</router-link
                  >
                  <span v-else class="inventory-ellipsis">{{ sourceLabel(record) }}</span>
                </template>
                <template v-else-if="record.type === 'STOCKTAKE_ADJUSTMENT'">
                  <router-link
                    v-if="record.stocktakeId && can('STOCKTAKE_VIEW')"
                    class="inventory-ellipsis"
                    :to="{ path: '/stock/stocktakes', query: { stocktakeId: record.stocktakeId } }"
                    >{{ sourceLabel(record) }}</router-link
                  >
                  <span v-else class="inventory-ellipsis">{{ sourceLabel(record) }}</span>
                </template>
                <template
                  v-else-if="record.type === 'SALE_CONFIRM' || record.type === 'SALE_CANCEL'"
                >
                  <a-button
                    v-if="record.salesOrderId && can('SALES_ORDER_VIEW')"
                    class="inventory-source-link"
                    type="link"
                    @click="showSalesOrder(record.salesOrderId)"
                    >{{ sourceLabel(record) }}</a-button
                  >
                  <span v-else class="inventory-ellipsis">{{ sourceLabel(record) }}</span>
                </template>
                <template v-else>
                  <a-button
                    v-if="record.receiptId && can('STOCK_RECEIPT_VIEW')"
                    class="inventory-source-link"
                    type="link"
                    @click="showReceipt(record.receiptId)"
                    >{{ sourceLabel(record) }}</a-button
                  >
                  <span v-else class="inventory-ellipsis">{{ sourceLabel(record) }}</span>
                </template>
              </div>
            </a-tooltip>
            <a-tooltip v-else :title="record[column.key]">
              <span
                class="inventory-ellipsis"
                :class="{
                  'inventory-code': column.key === 'productCode' || column.key === 'performedBy',
                }"
                >{{ record[column.key] }}</span
              >
            </a-tooltip>
          </template>
        </FittedListTable>
      </template>
      <SalesOrderDialog :id="salesOrderId" v-model:open="salesDetailOpen" mode="view" />
      <ReceiptDialog :id="receiptId" v-model:open="detailOpen" mode="view" />
    </section>
  </a-config-provider>
</template>

<style scoped>
.inventory-page {
  display: flex;
  flex: 1;
  flex-direction: column;
  min-height: 0;
  min-width: 0;
  gap: 12px;
}
.inventory-heading {
  display: flex;
  justify-content: space-between;
  align-items: center;
  flex-wrap: wrap;
  flex-shrink: 0;
  gap: 12px;
}
.inventory-heading h1 {
  margin: 0;
  color: #302640;
  font-size: 24px;
  line-height: 32px;
  font-weight: 650;
}
.inventory-heading p {
  margin: 4px 0 0;
  color: #797184;
  font-size: 14px;
  line-height: 20px;
}
.inventory-warehouse {
  display: flex;
  align-items: center;
  gap: 8px;
  max-width: 100%;
  padding: 8px 12px;
  border-radius: 8px;
  color: var(--inventory-warehouse-text);
  background: var(--inventory-warehouse-bg);
  overflow-wrap: anywhere;
}
.inventory-warehouse > .anticon {
  flex-shrink: 0;
}
.inventory-page > :deep(.ant-alert) {
  flex-shrink: 0;
}
.inventory-filters {
  display: flex;
  align-items: flex-end;
  flex-wrap: wrap;
  flex-shrink: 0;
  gap: 12px;
  padding: 14px 16px;
  border: 1px solid #e9e4f1;
  border-radius: 12px;
  background: #fff;
}
.inventory-filter {
  display: flex;
  flex: 1 1 220px;
  flex-direction: column;
  min-width: 0;
  gap: 6px;
  color: #625b70;
  font-size: 13px;
}
.inventory-filter--product {
  flex-basis: 260px;
}
.inventory-filter :deep(.ant-picker),
.inventory-filter :deep(.ant-select) {
  width: 100%;
}
.inventory-reset {
  flex-shrink: 0;
}
.inventory-time-hint {
  flex-basis: 100%;
  margin: 0;
  color: var(--inventory-muted);
  font-size: 12px;
  line-height: 18px;
}
.inventory-quantity,
.inventory-date {
  white-space: nowrap;
  font-variant-numeric: tabular-nums;
}
.inventory-quantity {
  font-weight: 600;
}
.inventory-zero {
  color: var(--inventory-muted);
}
.positive {
  color: var(--inventory-positive);
}
.negative {
  color: var(--inventory-negative);
}
.inventory-ellipsis {
  display: block;
  overflow: hidden;
  white-space: nowrap;
  text-overflow: ellipsis;
  max-width: 100%;
}
.inventory-code {
  font-family: ui-monospace, SFMono-Regular, Consolas, monospace;
  font-size: 13px;
}
.inventory-source {
  min-width: 0;
}
.inventory-source-link {
  display: block;
  max-width: 100%;
  height: auto;
  padding: 0;
  text-align: left;
}
.inventory-source-link :deep(span) {
  display: block;
  overflow: hidden;
  text-overflow: ellipsis;
}
@media (max-width: 767px), (max-height: 650px) {
  .inventory-filters {
    padding: 12px;
  }
}
</style>
