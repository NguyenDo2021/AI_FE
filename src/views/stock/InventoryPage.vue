<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { BasicTable } from '@/components'
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
const { t } = useI18n()
const { can } = useCatalogPermission()
const auth = useAuthStore()
const warehouse = useWarehouseStore()
const stock = useStockStore()
const rows = ref<(Inventory | Movement)[]>([])
const productId = ref<string>()
const from = ref('')
const to = ref('')
const page = ref(1)
const pageSize = ref(10)
const total = ref(0)
const error = ref('')
const loading = ref(false)
const receiptId = ref<string>()
const detailOpen = ref(false)
const salesOrderId = ref<string>()
const salesDetailOpen = ref(false)
let sequence = 0
const permission = computed(() => (props.movements ? 'INVENTORY_MOVEMENT_VIEW' : 'INVENTORY_VIEW'))
const columns = computed(() =>
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
  ).map((key) => ({ title: t(`stock.${key}`), key, dataIndex: key })),
)
const pagination = computed(() => ({
  current: page.value,
  pageSize: pageSize.value,
  total: total.value,
  showSizeChanger: true,
  pageSizeOptions: ['10', '20', '50', '100'],
}))
const rowKey = (item: Inventory | Movement): string =>
  'id' in item ? item.id : `${item.warehouseId}:${item.productId}`
const load = async (): Promise<void> => {
  const current = ++sequence
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
    if (!result.items.length && page.value > 1 && result.total > 0) {
      page.value = Math.ceil(result.total / pageSize.value)
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
  page.value = size !== pageSize.value ? 1 : next
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
  <section>
    <h1>{{ t(movements ? 'stock.movements' : 'stock.inventory') }}</h1>
    <p v-if="warehouse.selected">{{ t('stock.warehouse') }}: {{ warehouse.selected.name }}</p>
    <a-alert v-if="error" type="error" :message="error" show-icon />
    <a-alert v-if="!can(permission)" type="warning" :message="t('stock.forbidden')" />
    <a-alert v-else-if="!warehouse.selectedId" type="info" :message="t('stock.selectWarehouse')" />
    <template v-else>
      <div class="stock-filters">
        <ProductSelect v-model:value="productId" />
        <template v-if="movements">
          <a-date-picker
            v-model:value="from"
            show-time
            value-format="YYYY-MM-DDTHH:mm:ssZ"
            :placeholder="t('stock.from')"
          />
          <a-date-picker
            v-model:value="to"
            show-time
            value-format="YYYY-MM-DDTHH:mm:ssZ"
            :placeholder="t('stock.toExclusive')"
          />
        </template>
        <a-button @click="reset">{{ t('common.reset') }}</a-button>
      </div>
      <p v-if="movements">{{ t('stock.exclusiveHint') }}</p>
      <BasicTable
        :columns="columns"
        :data-source="rows"
        :row-key="rowKey"
        :loading="loading"
        :pagination="pagination"
        :scroll="{ x: movements ? 1200 : 650 }"
        @reload="load"
        @page-change="changePage"
      >
        <template #bodyCell="{ column, record }">
          <template v-if="column.key === 'quantity'">{{
            formatStockInteger(record.quantity)
          }}</template>
          <span
            v-else-if="column.key === 'quantityChange'"
            :class="BigInt(record.quantityChange) < 0n ? 'negative' : 'positive'"
            >{{ BigInt(record.quantityChange) > 0n ? '+' : ''
            }}{{ formatStockInteger(record.quantityChange) }}</span
          >
          <template v-else-if="column.key === 'type'">{{ t(`stock.${record.type}`) }}</template>
          <template v-else-if="column.key === 'performedAt'">{{
            formatDateTime(record.performedAt)
          }}</template>
          <a-tag
            v-else-if="column.key === 'productStatus'"
            :color="record.productStatus === 1 ? 'green' : 'default'"
            >{{ t(record.productStatus === 1 ? 'common.active' : 'common.inactive') }}</a-tag
          >
          <template v-else-if="column.key === 'sourceDocument'">
            <template v-if="record.type === 'SALE_CONFIRM' || record.type === 'SALE_CANCEL'">
              <a-button
                v-if="record.salesOrderId && can('SALES_ORDER_VIEW')"
                type="link"
                @click="showSalesOrder(record.salesOrderId)"
                >{{ record.salesOrderCode ?? record.salesOrderId }}</a-button
              >
              <span v-else>{{ record.salesOrderCode ?? record.salesOrderId ?? '—' }}</span>
            </template>
            <template v-else
              ><a-button
                v-if="record.receiptId && can('STOCK_RECEIPT_VIEW')"
                type="link"
                @click="showReceipt(record.receiptId)"
                >{{ record.receiptCode }}</a-button
              ><span v-else>{{ record.receiptCode ?? record.receiptId ?? '—' }}</span></template
            >
          </template>
        </template>
      </BasicTable>
    </template>
    <SalesOrderDialog :id="salesOrderId" v-model:open="salesDetailOpen" mode="view" />
    <ReceiptDialog :id="receiptId" v-model:open="detailOpen" mode="view" />
  </section>
</template>
<style scoped>
.stock-filters {
  display: flex;
  gap: 12px;
  flex-wrap: wrap;
  margin: 20px 0;
}
.stock-filters > :first-child {
  min-width: 240px;
}
.positive {
  color: #237804;
}
.negative {
  color: #cf1322;
}
</style>
