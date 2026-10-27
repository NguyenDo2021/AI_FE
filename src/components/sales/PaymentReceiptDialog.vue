<script setup lang="ts">
import { ref } from 'vue'
import {
  DownloadOutlined,
  ExportOutlined,
  FileTextOutlined,
  PrinterOutlined,
  ReloadOutlined,
} from '@ant-design/icons-vue'
import { BasicModal } from '@/components'
import type { PaymentReceiptController } from '@/composables/usePaymentReceipt'
import './paymentDialogs.css'

const props = defineProps<{ receipt: PaymentReceiptController }>()
const frame = ref<HTMLIFrameElement>()
const loaded = (event: Event): void => {
  const target = event.target
  if (target instanceof HTMLIFrameElement) props.receipt.loaded(target.getAttribute('src') ?? '')
}
const print = (): void => {
  const state = props.receipt.state
  if (!state.ready || !state.url || state.loading) return
  state.printHint =
    'Nếu trình duyệt không mở hộp thoại in, bấm “Mở PDF riêng” và dùng nút in của trình duyệt. Chọn khổ giấy theo PDF (A5 ngang).'
  const release = props.receipt.holdPrint()
  try {
    if (!frame.value?.contentWindow) throw new Error('PDF viewer unavailable')
    frame.value.contentWindow.addEventListener?.('afterprint', release, { once: true })
    frame.value.contentWindow.focus()
    frame.value.contentWindow.print()
  } catch {
    release()
    props.receipt.openPdf()
  }
}
</script>
<template>
  <a-config-provider :theme="{ token: { colorPrimary: '#7357cf', borderRadius: 8 } }">
    <BasicModal
      :open="receipt.state.open"
      title="Biên lai thu tiền"
      :width="1100"
      wrap-class-name="payment-dialog payment-receipt-dialog"
      :focus-trigger-after-close="false"
      @update:open="receipt.close"
    >
      <template #title>
        <div class="payment-dialog-heading">
          <span class="payment-dialog-icon"><FileTextOutlined aria-hidden="true" /></span>
          <div>
            Biên lai thu tiền<small>{{ receipt.state.paymentCode || 'Đang tải…' }}</small>
          </div>
        </div>
      </template>
      <div class="receipt-content" :aria-busy="receipt.state.loading">
        <div v-if="receipt.state.loading" class="receipt-loading" role="status">
          <a-spin /><span>Đang tải biên lai…</span>
        </div>
        <div v-else-if="receipt.state.error" class="receipt-error">
          <a-alert type="error" :message="receipt.state.error" show-icon />
          <a-button @click="receipt.retry"
            ><template #icon><ReloadOutlined aria-hidden="true" /></template>Thử lại</a-button
          >
        </div>
        <div v-else-if="receipt.state.url" class="receipt-viewer">
          <iframe
            :key="receipt.state.url"
            ref="frame"
            :src="receipt.state.url"
            title="Xem trước PDF biên lai thu tiền"
            class="receipt-pdf"
            @load="loaded"
          />
        </div>
        <p v-if="receipt.state.url" class="receipt-note">
          Nếu trình duyệt không hiển thị biên lai, chọn “Mở PDF riêng” hoặc “Tải PDF”.
        </p>
        <a-alert
          v-if="receipt.state.printHint"
          type="info"
          :message="receipt.state.printHint"
          show-icon
        />
      </div>
      <template #footer>
        <div class="payment-dialog-footer">
          <a-button
            :disabled="!receipt.state.url || receipt.state.loading"
            @click="receipt.download"
          >
            <template #icon><DownloadOutlined aria-hidden="true" /></template>Tải PDF
          </a-button>
          <a-button
            :disabled="!receipt.state.url || receipt.state.loading"
            @click="receipt.openPdf"
          >
            <template #icon><ExportOutlined aria-hidden="true" /></template>Mở PDF riêng
          </a-button>
          <a-button type="primary" :disabled="!receipt.state.ready" @click="print">
            <template #icon><PrinterOutlined aria-hidden="true" /></template>In
          </a-button>
          <a-button @click="receipt.close">Đóng</a-button>
        </div>
      </template>
    </BasicModal>
  </a-config-provider>
</template>
<style scoped>
.receipt-content {
  display: flex;
  flex-direction: column;
  gap: 12px;
}
.receipt-viewer {
  min-width: 0;
  padding: 12px;
  border-radius: 8px;
  background: #eae8ef;
}
.receipt-pdf {
  display: block;
  width: 100%;
  height: 60dvh;
  min-height: 120px;
  border: 0;
  background: #fff;
}
.receipt-loading,
.receipt-error {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 16px;
  min-height: 240px;
}
.receipt-loading {
  color: #797184;
}
.receipt-error {
  flex-direction: column;
}
.receipt-note {
  margin: 0;
  color: #797184;
  font-size: 12px;
  line-height: 1.6;
}
@media (max-width: 480px) {
  .receipt-viewer {
    padding: 4px;
  }
}
@media (max-height: 650px) {
  .receipt-pdf {
    height: 48dvh;
  }
  .receipt-loading,
  .receipt-error {
    min-height: 120px;
  }
}
</style>
