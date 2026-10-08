<script setup lang="ts">
import { computed, onBeforeUnmount, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { getCatalogList } from '@/api/catalog/catalog.api'
import { useCatalogPermission } from '@/composables/useCatalogPermission'
import { stockError } from '@/utils/stock'
const props = withDefaults(
  defineProps<{
    value?: string
    activeOnly?: boolean
    seeds?: { value: string; label: string }[]
    disabled?: boolean
  }>(),
  { value: undefined, activeOnly: false, seeds: () => [], disabled: false },
)
const emit = defineEmits<{ 'update:value': [value: string | undefined] }>()
const { can } = useCatalogPermission()
const { t } = useI18n()
const options = ref<{ value: string; label: string }[]>([])
const selected = ref<{ value: string; label: string }>()
const visibleOptions = computed(() => [
  ...new Map(
    [...props.seeds, ...(selected.value ? [selected.value] : []), ...options.value].map((item) => [
      item.value,
      item,
    ]),
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
    const result = await getCatalogList('products', {
      page: append ? page.value + 1 : 1,
      pageSize: 100,
      ...(keyword ? { keyword } : {}),
      ...(props.activeOnly ? { status: 1 as const } : {}),
    })
    if (current !== sequence) return
    const next = result.items.map((item) => ({
      value: item.id,
      label: `${item.code} — ${item.name}`,
    }))
    options.value = append ? [...options.value, ...next] : next
    page.value = result.page
    total.value = result.total
  } catch (cause) {
    if (current === sequence) error.value = stockError(cause, t)
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
}
const scroll = (event: Event): void => {
  const target = event.target as HTMLElement
  if (
    !loading.value &&
    options.value.length < total.value &&
    target.scrollTop + target.clientHeight >= target.scrollHeight - 12
  )
    void load(true)
}
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
