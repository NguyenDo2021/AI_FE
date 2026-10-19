<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import { getReturnableOrders } from '@/api/sales/returns.api'
import { usePaymentScope } from '@/composables/usePaymentScope'
import { hasNextPage, returnError } from '@/utils/returns'
import { formatStockInteger } from '@/utils/stock'
import type { ReturnableOrder } from '@/types/returns'
import type { StockInteger } from '@/types/stock'
import type { NormalizedApiError } from '@/utils/request'
const props = defineProps<{ value?: string; selected?: ReturnableOrder; disabled?: boolean }>()
const emit = defineEmits<{ selected: [order: ReturnableOrder]; denied: [] }>()
const { can, contextKey } = usePaymentScope()
const rows = ref<ReturnableOrder[]>([])
const keyword = ref(''),
  error = ref(''),
  loading = ref(false),
  searched = ref(false)
const page = ref(1),
  total = ref<StockInteger>()
const pageSize = 10
let sequence = 0
let timer: ReturnType<typeof setTimeout> | undefined
let controller: AbortController | undefined
let appliedCode = ''
let retryAppend = false
const allowed = computed(() => can('SALES_RETURN_VIEW'))
const selection = computed(() =>
  props.value
    ? {
        value: props.value,
        label: props.selected?.id === props.value ? props.selected.code : props.value,
      }
    : undefined,
)
const options = computed(() =>
  rows.value.map((order) => ({ value: order.id, label: order.code, order })),
)
const more = computed(() => hasNextPage(total.value, page.value, pageSize))
const cancel = (): void => {
  ++sequence
  clearTimeout(timer)
  timer = undefined
  controller?.abort()
  controller = undefined
  loading.value = false
}
const clear = (): void => {
  cancel()
  rows.value = []
  page.value = 1
  total.value = undefined
  error.value = ''
  searched.value = false
  appliedCode = ''
}
const load = async (append = false): Promise<void> => {
  const code = keyword.value.trim()
  if (
    !allowed.value ||
    props.disabled ||
    !code ||
    (append && (loading.value || !more.value || code !== appliedCode))
  )
    return
  cancel()
  const current = sequence
  const request = new AbortController()
  controller = request
  retryAppend = append
  loading.value = true
  error.value = ''
  try {
    const result = await getReturnableOrders(
      { code, page: append ? page.value + 1 : 1, pageSize },
      request.signal,
    )
    if (
      current !== sequence ||
      request.signal.aborted ||
      code !== keyword.value.trim() ||
      !allowed.value
    )
      return
    rows.value = append ? [...rows.value, ...result.items] : result.items
    total.value = result.total
    page.value = result.page
    appliedCode = code
    searched.value = true
  } catch (cause) {
    if (current !== sequence || request.signal.aborted) return
    error.value = returnError(cause)
    if ((cause as NormalizedApiError).status === 403) {
      clear()
      keyword.value = ''
      emit('denied')
    }
  } finally {
    if (current === sequence) {
      loading.value = false
      controller = undefined
    }
  }
}
const search = (value: string): void => {
  clear()
  keyword.value = value
  if (!allowed.value || props.disabled || !value.trim()) return
  timer = setTimeout(() => {
    timer = undefined
    void load()
  }, 300)
}
const select = (value: { value: string }): void => {
  if (!allowed.value || props.disabled) return
  const order = rows.value.find((item) => item.id === value.value)
  if (order) emit('selected', order)
}
const scroll = (event: Event): void => {
  const target = event.target as HTMLElement
  if (!error.value && target.scrollTop + target.clientHeight >= target.scrollHeight - 12)
    void load(true)
}
const retry = (): void => {
  void load(retryAppend)
}
watch(
  contextKey,
  () => {
    clear()
    keyword.value = ''
  },
  { flush: 'sync' },
)
watch(
  () => props.disabled,
  (disabled) => {
    if (disabled) cancel()
  },
)
onBeforeUnmount(cancel)
</script>
<template>
  <div>
    <a-select
      :value="selection"
      :options="options"
      :disabled="disabled || !allowed"
      :loading="loading"
      placeholder="Nhập mã đơn BH-… để tìm"
      show-search
      label-in-value
      :filter-option="false"
      style="width: 100%"
      @search="search"
      @select="select"
      @popup-scroll="scroll"
    >
      <template #option="{ order }">
        <strong>{{ order.code }}</strong>
        <div>{{ order.customerName }} · {{ order.warehouseName }} · {{ order.saleDate }}</div>
        <div>Tổng đơn gốc: {{ formatStockInteger(order.totalAmount) }} VND</div>
      </template>
      <template #notFoundContent>
        <a-spin v-if="loading" size="small" />
        <span v-else-if="error">Không tải được danh sách đơn. Hãy thử lại.</span>
        <span v-else-if="searched"
          >Không tìm thấy đơn còn hàng được trả trong phạm vi của bạn.</span
        >
        <span v-else>Nhập mã đơn BH-… để tìm.</span>
      </template>
    </a-select>
    <p v-if="!keyword.trim()">Nhập mã đơn BH-… để tìm.</p>
    <a-alert v-if="error" type="error" :message="error" show-icon>
      <template #description
        ><a-button :disabled="disabled || !allowed" @click="retry"
          >Thử lại tìm đơn</a-button
        ></template
      >
    </a-alert>
    <p v-else-if="searched && !rows.length">
      Không tìm thấy đơn còn hàng được trả trong phạm vi của bạn.
    </p>
    <a-space v-if="searched && rows.length">
      <span
        >Đã tải {{ rows.length }} /
        {{ total === undefined ? '—' : formatStockInteger(total) }} đơn</span
      >
      <a-button v-if="more" :loading="loading" :disabled="disabled || !allowed" @click="load(true)"
        >Tải thêm đơn</a-button
      >
    </a-space>
  </div>
</template>
