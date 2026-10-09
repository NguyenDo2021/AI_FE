<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import { message, Modal } from 'ant-design-vue'
import { BasicModal } from '@/components'
import { getCustomer, createCustomer, updateCustomer } from '@/api/sales/sales.api'
import { useSalesScope } from '@/composables/useSalesScope'
import { customerInput, validateCustomer, salesError, salesFieldErrors } from '@/utils/sales'
import { formatDateTime } from '@/utils/date'
import type { Customer, CustomerInput } from '@/types/sales'
const props = defineProps<{
  open: boolean
  id?: string
  mode: 'create' | 'edit' | 'view' | 'toggle'
}>()
const emit = defineEmits<{ 'update:open': [value: boolean]; saved: [customer: Customer] }>()
const { warehouses, can, scopeKey, inScope, refreshScope } = useSalesScope()
const detail = ref<Customer>()
const empty = (): CustomerInput => ({ name: '', phone: '', address: '', note: '', status: 1 })
const form = ref<CustomerInput>(empty())
const warehouseId = ref('')
const fields = ref<Record<string, string>>({})
const error = ref('')
const loading = ref(false)
const saving = ref(false)
const blocked = ref(false)
let sequence = 0
const allowed = computed(() =>
  can(
    'CUSTOMER_' + { create: 'CREATE', edit: 'UPDATE', view: 'VIEW', toggle: 'UPDATE' }[props.mode],
  ),
)
const options = computed(() =>
  warehouses.warehouses.map((item) => ({
    value: item.id,
    label: item.code + ' — ' + item.name,
    disabled: item.status !== 1,
  })),
)
const load = async (): Promise<void> => {
  if (saving.value || !props.open) return
  const current = ++sequence
  loading.value = true
  error.value = ''
  try {
    if (!props.id || !allowed.value || !can('CUSTOMER_VIEW')) return
    const result = await getCustomer(props.id)
    if (current !== sequence) return
    if (!inScope(result.warehouseId)) {
      blocked.value = true
      error.value = 'Kho không còn trong phạm vi được phép.'
      return
    }
    detail.value = result
    warehouseId.value = result.warehouseId
    form.value = customerInput(result)
    if (props.mode === 'toggle') form.value.status = result.status === 1 ? 0 : 1
    blocked.value = false
  } catch (cause) {
    if (current === sequence) error.value = salesError(cause)
    if ((cause as { status?: number }).status === 403) await refreshScope()
  } finally {
    if (current === sequence) loading.value = false
  }
}
watch(
  () => [props.open, props.id, props.mode],
  () => {
    ++sequence
    loading.value = false
    detail.value = undefined
    form.value = empty()
    warehouseId.value = warehouses.selectedId ?? ''
    blocked.value = false
    fields.value = {}
    error.value = ''
    if (props.open && props.id) void load()
  },
  { immediate: true },
)
watch(
  scopeKey,
  () => {
    ++sequence
    detail.value = undefined
    form.value = empty()
    blocked.value = true
    loading.value = false
    emit('update:open', false)
  },
  { flush: 'sync' },
)
onBeforeUnmount(() => ++sequence)
const submit = async (): Promise<void> => {
  if (saving.value || loading.value || blocked.value || !allowed.value || props.mode === 'view')
    return
  fields.value = validateCustomer(form.value)
  if (
    !inScope(warehouseId.value) ||
    (props.mode === 'create' &&
      !warehouses.warehouses.some((item) => item.id === warehouseId.value && item.status === 1))
  )
    fields.value.warehouseId = 'Chọn kho hoạt động trong phạm vi được phép.'
  if (props.mode !== 'create' && !detail.value) return
  if (Object.keys(fields.value).length) return
  const current = sequence
  saving.value = true
  error.value = ''
  try {
    const input = customerInput(form.value)
    const result =
      props.mode === 'create'
        ? await createCustomer({ ...input, warehouseId: warehouseId.value })
        : await updateCustomer(props.id!, input)
    if (current !== sequence) return
    message.success('Đã lưu khách hàng.')
    emit('saved', result)
    emit('update:open', false)
  } catch (cause) {
    if (current !== sequence) return
    error.value = salesError(cause)
    fields.value = salesFieldErrors(cause)
    if ((cause as { status?: number }).status === 403) {
      blocked.value = true
      await refreshScope()
    }
  } finally {
    saving.value = false
  }
}
const reload = (): void => {
  Modal.confirm({ title: 'Tải lại sẽ bỏ thay đổi chưa lưu.', onOk: load })
}
</script>
<template>
  <BasicModal
    :open="open"
    :title="
      mode === 'create'
        ? 'Thêm khách hàng'
        : mode === 'edit'
          ? 'Sửa khách hàng'
          : mode === 'toggle'
            ? 'Chuyển trạng thái khách hàng'
            : 'Chi tiết khách hàng'
    "
    :confirm-loading="saving"
    @update:open="emit('update:open', false)"
    @confirm="submit"
  >
    <a-spin :spinning="loading">
      <a-alert v-if="error" type="error" :message="error" />
      <a-alert
        v-if="id && !can('CUSTOMER_VIEW')"
        type="warning"
        message="Cần CUSTOMER_VIEW để tải đầy đủ dữ liệu trước khi sửa."
      />
      <a-form
        v-if="allowed && (!id || detail)"
        layout="vertical"
        :disabled="saving || blocked || mode === 'view' || mode === 'toggle'"
      >
        <a-form-item label="Kho" :help="fields.warehouseId" required>
          <a-select v-if="mode === 'create'" v-model:value="warehouseId" :options="options" />
          <a-input
            v-else
            :value="
              warehouses.warehouses.find((item) => item.id === warehouseId)?.name ?? warehouseId
            "
            disabled
          />
        </a-form-item>
        <p v-if="detail">Mã khách: {{ detail.code }}</p>
        <a-form-item
          label="Tên"
          required
          :help="fields.name"
          :validate-status="fields.name ? 'error' : undefined"
          ><a-input v-model:value="form.name" :maxlength="160"
        /></a-form-item>
        <a-form-item label="Điện thoại" :help="fields.phone"
          ><a-input v-model:value="form.phone" :maxlength="20"
        /></a-form-item>
        <a-form-item label="Địa chỉ" :help="fields.address"
          ><a-textarea v-model:value="form.address" :maxlength="500"
        /></a-form-item>
        <a-form-item label="Ghi chú" :help="fields.note"
          ><a-textarea v-model:value="form.note" :maxlength="2000"
        /></a-form-item>
        <a-form-item label="Trạng thái" :help="fields.status"
          ><a-select
            v-model:value="form.status"
            :options="[
              { value: 1, label: 'Hoạt động' },
              { value: 0, label: 'Ngừng hoạt động' },
            ]"
        /></a-form-item>
        <p v-if="detail">
          Tạo: {{ formatDateTime(detail.createdAt) }} · Cập nhật:
          {{ formatDateTime(detail.updatedAt) }}
        </p>
      </a-form>
    </a-spin>
    <template #footer>
      <a-button :disabled="saving" @click="emit('update:open', false)">Đóng</a-button>
      <a-button v-if="id" :disabled="saving || loading" @click="reload"
        >Tải lại dữ liệu gốc</a-button
      >
      <a-button
        v-if="mode !== 'view'"
        type="primary"
        :loading="saving"
        :disabled="loading || blocked || !allowed || (!!id && !detail)"
        @click="submit"
        >Lưu</a-button
      >
    </template>
  </BasicModal>
</template>
