<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import { useWarehouseStore } from '@/stores/warehouse'
import { formatStockInteger } from '@/utils/stock'
import { formatDate, formatDateTime } from '@/utils/date'
import type { Receipt } from '@/types/stock'

withDefaults(defineProps<{ receipt: Receipt; information?: boolean }>(), { information: true })
const { t } = useI18n()
const warehouses = useWarehouseStore()
const warehouseName = (id: string): string =>
  warehouses.warehouses.find((warehouse) => warehouse.id === id)?.name ?? id
</script>

<template>
  <section class="receipt-summary" :aria-label="t('stock.receiptSummary')">
    <dl class="receipt-highlight">
      <div class="receipt-identity">
        <dt>{{ t('stock.code') }}</dt>
        <dd>
          <a-tooltip :title="receipt.code"
            ><span class="receipt-ellipsis">{{ receipt.code }}</span></a-tooltip
          >
        </dd>
      </div>
      <div>
        <dt>{{ t('stock.status') }}</dt>
        <dd>
          <a-tag
            :color="
              receipt.status === 'CONFIRMED'
                ? 'green'
                : receipt.status === 'CANCELLED'
                  ? 'red'
                  : 'gold'
            "
            >{{ t(`stock.${receipt.status}`) }}</a-tag
          >
        </dd>
      </div>
      <div class="receipt-total">
        <dt>{{ t('stock.totalAmount') }}</dt>
        <dd>{{ formatStockInteger(receipt.totalAmount) }} ₫</dd>
      </div>
    </dl>
    <dl v-if="information" class="receipt-information">
      <div>
        <dt>{{ t('stock.warehouse') }}</dt>
        <dd>{{ warehouseName(receipt.warehouseId) }}</dd>
      </div>
      <div>
        <dt>{{ t('stock.receiptDate') }}</dt>
        <dd>{{ formatDate(receipt.receiptDate) }}</dd>
      </div>
      <div>
        <dt>{{ t('stock.supplierName') }}</dt>
        <dd>{{ receipt.supplierName || '—' }}</dd>
      </div>
      <div>
        <dt>{{ t('stock.note') }}</dt>
        <dd>{{ receipt.note || '—' }}</dd>
      </div>
    </dl>
    <details class="receipt-audit">
      <summary>{{ t('stock.receiptAudit') }}</summary>
      <dl class="receipt-information receipt-audit-grid">
        <div>
          <dt>ID</dt>
          <dd>{{ receipt.id }}</dd>
        </div>
        <div>
          <dt>{{ t('stock.code') }}</dt>
          <dd>{{ receipt.code }}</dd>
        </div>
        <div>
          <dt>{{ t('stock.receiptVersion') }}</dt>
          <dd>{{ String(receipt.version) }}</dd>
        </div>
        <div>
          <dt>{{ t('stock.warehouseId') }}</dt>
          <dd>{{ receipt.warehouseId }}</dd>
        </div>
        <div>
          <dt>{{ t('stock.createdBy') }}</dt>
          <dd>{{ receipt.createdBy }}</dd>
        </div>
        <div>
          <dt>{{ t('stock.createdAt') }}</dt>
          <dd>{{ formatDateTime(receipt.createdAt) }}</dd>
        </div>
        <div v-if="receipt.confirmedAt || receipt.confirmedBy">
          <dt>{{ t('stock.confirmedAt') }}</dt>
          <dd>
            {{ receipt.confirmedAt ? formatDateTime(receipt.confirmedAt) : '—' }} /
            {{ receipt.confirmedBy || '—' }}
          </dd>
        </div>
        <div v-if="receipt.cancelledAt || receipt.cancelledBy">
          <dt>{{ t('stock.cancelledAt') }}</dt>
          <dd>
            {{ receipt.cancelledAt ? formatDateTime(receipt.cancelledAt) : '—' }} /
            {{ receipt.cancelledBy || '—' }}
          </dd>
        </div>
        <div v-if="receipt.cancellationReason" class="receipt-audit-reason">
          <dt>{{ t('stock.reason') }}</dt>
          <dd>{{ receipt.cancellationReason }}</dd>
        </div>
      </dl>
    </details>
  </section>
</template>

<style scoped>
.receipt-summary {
  min-width: 0;
  border: 1px solid #eee8f5;
  border-radius: 10px;
}
dl {
  margin: 0;
}
dt {
  color: #797184;
  font-size: 13px;
}
dd {
  margin: 5px 0 0;
  min-width: 0;
  overflow-wrap: anywhere;
  white-space: pre-wrap;
  color: #302640;
}
.receipt-highlight {
  display: grid;
  grid-template-columns: minmax(0, 1.6fr) minmax(100px, 0.7fr) minmax(0, 1fr);
  gap: 16px;
  padding: 16px;
  background: #f5f0ff;
  border-radius: 10px 10px 0 0;
}
.receipt-highlight > div {
  min-width: 0;
}
.receipt-ellipsis {
  display: block;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.receipt-identity dd {
  font-weight: 500;
}
.receipt-total dd {
  color: #7357cf;
  font-size: 20px;
  font-weight: 650;
  font-variant-numeric: tabular-nums;
}
.receipt-highlight :deep(.ant-tag) {
  margin: 0;
  white-space: normal;
}
.receipt-information {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
}
.receipt-information > div {
  display: grid;
  grid-template-columns: minmax(80px, 0.7fr) minmax(0, 1.3fr);
  gap: 10px;
  min-width: 0;
  padding: 12px 16px;
  border-top: 1px solid #f0edf5;
}
.receipt-information dd {
  margin: 0;
}
.receipt-audit {
  border-top: 1px solid #f0edf5;
}
summary {
  padding: 12px 16px;
  cursor: pointer;
  color: #625b70;
}
summary::marker {
  color: #7357cf;
}
.receipt-audit-grid > div {
  display: block;
}
.receipt-audit-grid dd {
  margin-top: 6px;
}
.receipt-audit-reason {
  grid-column: 1 / -1;
}
@media (max-width: 700px) {
  .receipt-highlight {
    grid-template-columns: minmax(0, 1fr) auto;
    gap: 12px;
  }
  .receipt-total {
    grid-column: 1 / -1;
  }
  .receipt-information {
    grid-template-columns: minmax(0, 1fr);
  }
}
@media (max-width: 400px) {
  .receipt-highlight {
    grid-template-columns: minmax(0, 1fr);
  }
  .receipt-information > div {
    grid-template-columns: minmax(0, 1fr);
    gap: 4px;
  }
}
</style>
