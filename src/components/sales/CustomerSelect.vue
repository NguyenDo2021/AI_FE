<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import { getCustomers } from '@/api/sales/sales.api'
import { useSalesScope } from '@/composables/useSalesScope'
import { salesError } from '@/utils/sales'
import type { Customer } from '@/types/sales'
const props = defineProps<{
  value?: string
  warehouseId?: string
  activeOnly?: boolean
  seed?: Customer
  disabled?: boolean
}>()
const emit = defineEmits<{
  'update:value': [value: string | undefined]
  selected: [customer: Customer | undefined]
}>()
const { can, scopeKey, inScope, refreshScope } = useSalesScope()
const rows = ref<Customer[]>([])
const selected = ref<Customer>()
const loading = ref(false)
const error = ref('')
const page = ref(1)
const total = ref(0)
const keyword = ref('')
let sequence = 0
let timer: ReturnType<typeof setTimeout> | undefined
const options = computed(() =>
  [
    ...new Map(
      [
        ...(props.seed && (!props.warehouseId || props.seed.warehouseId === props.warehouseId)
          ? [props.seed]
          : []),
        ...(selected.value ? [selected.value] : []),
        ...rows.value,
      ].map((item) => [item.id, item]),
    ).values(),
  ].map((item) => ({
    value: item.id,
    label: item.code + ' — ' + item.name + (item.status === 0 ? ' (Ngừng hoạt động)' : ''),
    disabled: props.activeOnly && item.status !== 1,
  })),
)
const load = async (append = false): Promise<void> => {
  const current = ++sequence
  if (
    !can('CUSTOMER_VIEW') ||
    (props.activeOnly && (!props.warehouseId || !inScope(props.warehouseId)))
  )
    return
  loading.value = true
  error.value = ''
  try {
    const result = await getCustomers({
      page: append ? page.value + 1 : 1,
      pageSize: 50,
      ...(props.warehouseId ? { warehouseId: props.warehouseId } : {}),
      ...(props.activeOnly ? { status: 1 as const } : {}),
      ...(keyword.value.trim() ? { keyword: keyword.value.trim() } : {}),
    })
    if (current !== sequence) return
    const permitted = result.items.filter(
      (item) =>
        inScope(item.warehouseId) &&
        (!props.warehouseId || item.warehouseId === props.warehouseId) &&
        (!props.activeOnly || item.status === 1),
    )
    rows.value = append ? [...rows.value, ...permitted] : permitted
    page.value = result.page
    total.value = result.total
  } catch (cause) {
    if (current === sequence) error.value = salesError(cause)
    if ((cause as { status?: number }).status === 403) await refreshScope()
  } finally {
    if (current === sequence) loading.value = false
  }
}
watch(
  () => [props.warehouseId, scopeKey.value],
  () => {
    ++sequence
    clearTimeout(timer)
    rows.value = []
    selected.value = undefined
    total.value = 0
    page.value = 1
    loading.value = false
    error.value = ''
  },
  { flush: 'sync' },
)
const search = (value: string): void => {
  keyword.value = value
  ++sequence
  clearTimeout(timer)
  timer = setTimeout(() => void load(), 250)
}
const change = (value: string | undefined): void => {
  selected.value = [...rows.value, ...(props.seed ? [props.seed] : [])].find(
    (item) => item.id === value,
  )
  emit('update:value', value)
  emit('selected', selected.value)
}
const scroll = (event: Event): void => {
  const target = event.target as HTMLElement
  if (
    !loading.value &&
    page.value * 50 < total.value &&
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
      v-if="can('CUSTOMER_VIEW')"
      :value="value"
      :options="options"
      :disabled="disabled || (activeOnly && !warehouseId)"
      :loading="loading"
      placeholder="Khách hàng (bỏ trống: Khách lẻ)"
      show-search
      allow-clear
      :filter-option="false"
      style="width: 100%; min-width: 200px"
      @search="search"
      @change="change"
      @popup-scroll="scroll"
      @dropdown-visible-change="
        (visible: boolean) => {
          if (visible && !rows.length) void load()
        }
      "
    />
    <p v-else>
      Thiếu CUSTOMER_VIEW để chọn khách hàng. Có thể bán khách lẻ; khách cũ được giữ bằng ID.
    </p>
    <a-alert v-if="error" type="error" :message="error" />
  </div>
</template>
