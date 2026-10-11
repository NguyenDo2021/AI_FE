<script setup lang="ts">
import { ref } from 'vue'
import { BasicModal } from '@/components'
import type { PaymentReceiptController } from '@/composables/usePaymentReceipt'

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
  try {
    if (!frame.value?.contentWindow) throw new Error('PDF viewer unavailable')
    frame.value.contentWindow.focus()
    frame.value.contentWindow.print()
  } catch {
    props.receipt.openPdf()
  }
}
</script>
<template>
  <BasicModal
    :open="receipt.state.open"
    :title="'Biên lai thu tiền — ' + (receipt.state.filename || 'Đang tải')"
    :width="1100"
    @update:open="receipt.close"
  >
    <a-spin :spinning="receipt.state.loading">
      <a-alert v-if="receipt.state.error" type="error" :message="receipt.state.error" />
      <iframe
        v-if="receipt.state.url"
        :key="receipt.state.url"
        ref="frame"
        :src="receipt.state.url"
        title="Xem trước PDF biên lai thu tiền"
        class="receipt-pdf"
        @load="loaded"
      />
      <p v-if="receipt.state.url">
        PDF giữ nguyên nội dung và khổ giấy từ hệ thống. Cuộn trong trình xem để xem các trang. Nếu
        trình duyệt không hiển thị PDF, dùng “Mở PDF riêng” hoặc “Tải PDF”.
      </p>
      <a-alert v-if="receipt.state.printHint" type="info" :message="receipt.state.printHint" />
    </a-spin>
    <template #footer>
      <a-button v-if="receipt.state.error" :loading="receipt.state.loading" @click="receipt.retry">
        Thử lại
      </a-button>
      <a-button :disabled="!receipt.state.url || receipt.state.loading" @click="receipt.download">
        Tải PDF
      </a-button>
      <a-button :disabled="!receipt.state.url || receipt.state.loading" @click="receipt.openPdf">
        Mở PDF riêng
      </a-button>
      <a-button type="primary" :disabled="!receipt.state.ready" @click="print">In</a-button>
      <a-button @click="receipt.close">Đóng</a-button>
    </template>
  </BasicModal>
</template>
<style scoped>
.receipt-pdf {
  width: 100%;
  height: 65vh;
  min-height: 320px;
  border: 0;
}
</style>
