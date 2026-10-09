import { ref, watch } from 'vue'
import { defineStore } from 'pinia'
import { useAuthStore } from '@/stores/auth'
import { useWarehouseStore } from '@/stores/warehouse'
import { createPayment } from '@/api/payments/payments.api'
import { parseStockJson, stringifyStockJson } from '@/utils/stock'
import { PAYMENT_RETRY_PREFIX } from '@/utils/payments'
import type { PaymentAttempt, PaymentMutation, OrderPaymentSummary } from '@/types/payments'
import type { SalesOrder } from '@/types/sales'
import type { NormalizedApiError } from '@/utils/request'
export const usePaymentsStore = defineStore('payments', () => {
  const auth = useAuthStore()
  const warehouses = useWarehouseStore()
  const accessKey = (): string =>
    JSON.stringify([
      auth.user?.permissions,
      auth.isCatalogAdmin,
      warehouses.selectedId,
      warehouses.warehouses.map((item) => [item.id, item.status]),
    ])
  const attempts = ref<Record<string, PaymentAttempt>>({})
  const busy = ref<Record<string, boolean>>({})
  const summaries = ref<Record<string, OrderPaymentSummary>>({})
  const revision = ref(0)
  let generation = 0
  const storageKey = (user: string): string => PAYMENT_RETRY_PREFIX + user
  const persist = (): void => {
    if (!auth.user) return
    sessionStorage.setItem(storageKey(auth.user.id), stringifyStockJson(attempts.value))
  }
  watch(
    () => auth.user?.id,
    (user) => {
      ++generation
      attempts.value = {}
      busy.value = {}
      summaries.value = {}
      if (!user) return
      try {
        const saved = sessionStorage.getItem(storageKey(user))
        if (saved) {
          const restored = parseStockJson(saved) as Record<string, PaymentAttempt>
          for (const attempt of Object.values(restored))
            attempt.input.amount = BigInt(attempt.input.amount)
          attempts.value = restored
        }
      } catch {
        sessionStorage.removeItem(storageKey(user))
      }
    },
    { immediate: true, flush: 'sync' },
  )
  watch(
    accessKey,
    () => {
      summaries.value = {}
    },
    { flush: 'sync' },
  )
  const syncOrders = (orders: SalesOrder[]): void => {
    for (const order of orders) {
      if (order.paidAmount === undefined || order.remainingAmount === undefined) continue
      summaries.value[order.id] = {
        salesOrderId: order.id,
        totalAmount: order.totalAmount,
        paidAmount: order.paidAmount,
        remainingAmount: order.remainingAmount,
        paymentStatus: order.paymentStatus,
      }
    }
  }
  const record = (result: PaymentMutation): void => {
    summaries.value[result.order.salesOrderId] = result.order
    ++revision.value
  }
  const collect = async (attempt: PaymentAttempt): Promise<PaymentMutation | undefined> => {
    const id = attempt.salesOrderId
    if (!auth.user || busy.value[id] || attempts.value[id]?.state === 'conflict') return
    const current = generation
    const access = accessKey()
    const prior = attempts.value[id]
    const frozen = prior ?? { ...attempt, input: { ...attempt.input } }
    attempts.value[id] = frozen
    persist() // Save the exact request before sending, including for reload during POST.
    busy.value[id] = true
    try {
      const result = await createPayment(id, frozen.input, frozen.key)
      if (current !== generation) return
      delete attempts.value[id]
      persist()
      if (access !== accessKey()) return
      record(result)
      return result
    } catch (cause) {
      if (current === generation) {
        const error = cause as NormalizedApiError
        if (error.code === 'IDEMPOTENCY_CONFLICT') attempts.value[id]!.state = 'conflict'
        else if (
          (!prior ||
            ['PAYMENT_EXCEEDS_REMAINING', 'INVALID_SALES_ORDER_STATUS'].includes(
              error.code ?? '',
            )) &&
          error.status &&
          error.status < 500 &&
          ![408, 425, 429].includes(error.status)
        )
          delete attempts.value[id]
        persist()
      }
      throw cause
    } finally {
      if (current === generation) delete busy.value[id]
    }
  }
  return { attempts, busy, summaries, revision, collect, record, syncOrders }
})
