<script setup lang="ts">
import PendingPaymentRetries from '@/components/sales/PendingPaymentRetries.vue'
import PaymentHistory from '@/components/sales/PaymentHistory.vue'
</script>

<template>
  <a-config-provider
    :theme="{ token: { colorPrimary: '#7357cf', colorLink: '#7357cf', borderRadius: 8 } }"
  >
    <section class="payments-page">
      <PendingPaymentRetries class="payment-retries" />
      <header class="payments-heading">
        <h1>{{ $t('sales.payments') }}</h1>
        <p>Tra cứu các khoản thu và biên lai thanh toán.</p>
      </header>
      <PaymentHistory />
      <p class="payments-date-note">Lọc theo ngày thu, bao gồm cả hai đầu.</p>
    </section>
  </a-config-provider>
</template>

<style scoped>
.payments-page {
  display: flex;
  flex: 1;
  flex-direction: column;
  gap: 12px;
  min-height: 0;
  min-width: 0;
}
.payments-page > :not(.payment-history) {
  flex-shrink: 0;
}
.payments-heading h1 {
  margin: 0;
  color: #302640;
  font-size: 24px;
  line-height: 32px;
  font-weight: 650;
}
.payments-heading p {
  margin: 4px 0 0;
  color: #797184;
  line-height: 20px;
}
.payments-date-note {
  margin: 0;
  color: #797184;
  font-size: 12px;
}
.payment-retries {
  max-height: 28dvh;
  overflow: auto;
}
:global(.admin-layout:has(.payments-page)) {
  height: 100dvh;
  min-height: 0;
}
:global(.admin-layout:has(.payments-page) > .admin-layout__main) {
  height: 100%;
  min-height: 0;
}
:global(.admin-layout:has(.payments-page) .app-header) {
  flex-shrink: 0;
}
:global(.admin-layout__content:has(.payments-page)) {
  display: flex;
  flex-direction: column;
  flex: 1;
  min-height: 0;
  margin: 0;
  padding: 20px 24px;
  background: #f5f3fa;
  border-radius: 0;
}
@media (max-width: 767px), (max-height: 650px) {
  :global(.admin-layout__content:has(.payments-page)) {
    padding: 12px;
  }
}
</style>
