<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { getSaleProducts } from '@/api/sales/sales.api'
import { useSalesScope } from '@/composables/useSalesScope'
import type { StockInteger } from '@/types/stock'
import { getCatalogList } from '@/api/catalog/catalog.api'
import { useCatalogPermission } from '@/composables/useCatalogPermission'
import { stockError } from '@/utils/stock'
const props = withDefaults(
  defineProps<{
    value?: string
    activeOnly?: boolean
    seeds?: { value: string; label: string }[]
    salePricing?: boolean
    disabled?: boolean
  }>(),
  { value: undefined, activeOnly: false, seeds: () => [], disabled: false, salePricing: false },
)
const emit = defineEmits<{
  'update:value': [value: string | undefined]
  'selected-price': [price: StockInteger | undefined]
}>()
const { can } = useCatalogPermission()
const { t } = useI18n()
const { scopeKey, refreshScope } = useSalesScope()
const prices = ref<Record<string, StockInteger>>({})
const options = ref<{ value: string; label: string }[]>([])
const selected = ref<{ value: string; label: string }>()
const visibleOptions = computed(() => [
  ...new Map(
    [
      ...props.seeds.map((item) => ({
        ...item,
        disabled: props.activeOnly && !options.value.some((option) => option.value === item.value),
      })),
      ...(selected.value ? [selected.value] : []),
      ...options.value,
    ].map((item) => [item.value, item]),
  ).values(),
])
const loading = ref(false)
const error = ref('')
const page = ref(1)
const total = ref(0)
let keyword = ''
let sequence = 0
let timer: ReturnType<typeof setTimeout> | undefined
const load = async (append = false): Promise<void> => {
  if (!can('PRODUCT_VIEW')) return
  const current = ++sequence
  loading.value = true
  error.value = ''
  try {
    const params = {
      page: append ? page.value + 1 : 1,
      pageSize: 100,
      ...(keyword ? { keyword } : {}),
      ...(props.activeOnly ? { status: 1 as const } : {}),
    }
    const result = props.salePricing
      ? await getSaleProducts(params)
      : await getCatalogList('products', params)
    if (current !== sequence) return
    const items = result.items.filter((item) => !props.activeOnly || item.status === 1)
    for (const item of items)
      if (
        'defaultSalePrice' in item &&
        (typeof item.defaultSalePrice === 'bigint' || typeof item.defaultSalePrice === 'number')
      )
        prices.value[item.id] = item.defaultSalePrice
    const next = items.map((item) => ({
      value: item.id,
      label: `${item.code} — ${item.name}`,
    }))
    options.value = append ? [...options.value, ...next] : next
    page.value = result.page
    total.value = result.total
  } catch (cause) {
    if (current === sequence) error.value = stockError(cause, t)
    if (props.salePricing && (cause as { status?: number }).status === 403) await refreshScope()
  } finally {
    if (current === sequence) loading.value = false
  }
}
const search = (value: string): void => {
  keyword = value
  ++sequence
  clearTimeout(timer)
  timer = setTimeout(() => void load(), 250)
}
const change = (value: string | undefined): void => {
  selected.value = visibleOptions.value.find((item) => item.value === value)
  emit('update:value', value)
  emit('selected-price', value ? prices.value[value] : undefined)
}
const scroll = (event: Event): void => {
  const target = event.target as HTMLElement
  if (
    !loading.value &&
    page.value * 100 < total.value &&
    target.scrollTop + target.clientHeight >= target.scrollHeight - 12
  )
    void load(true)
}
watch(
  scopeKey,
  () => {
    ++sequence
    clearTimeout(timer)
    options.value = []
    selected.value = undefined
    prices.value = {}
    loading.value = false
    total.value = 0
    page.value = 1
    error.value = ''
  },
  { flush: 'sync' },
)
onBeforeUnmount(() => {
  ++sequence
  clearTimeout(timer)
})
</script>
<template>
  <div>
    <a-select
      v-if="can('PRODUCT_VIEW')"
      :value="props.value"
      :disabled="disabled"
      :options="visibleOptions"
      :loading="loading"
      :placeholder="t('stock.product')"
      show-search
      allow-clear
      :filter-option="false"
      style="width: 100%; min-width: 180px"
      @search="search"
      @change="change"
      @dropdown-visible-change="
        (open: boolean) => {
          if (open && !options.length) void load()
        }
      "
      @popup-scroll="scroll"
    />
    <a-input
      v-else
      :value="props.value"
      :disabled="disabled"
      :placeholder="t('stock.productId')"
      @update:value="(value: string) => emit('update:value', value || undefined)"
    />
    <small v-if="!can('PRODUCT_VIEW')">{{ t('stock.productLookupUnavailable') }}</small>
    <a-alert v-if="error" type="error" :message="error" />
  </div>
</template>
