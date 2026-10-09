<script setup lang="ts">
import PendingPaymentRetries from '@/components/sales/PendingPaymentRetries.vue'
import PaymentHistory from '@/components/sales/PaymentHistory.vue'
</script>
<template>
  <section>
    <PendingPaymentRetries />
    <h1>{{ $t('sales.payments') }}</h1>
    <p>Lọc ngày thu chọn các phiếu thu trong khoảng ngày, bao gồm hai đầu.</p>
    <PaymentHistory />
  </section>
</template>
