<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import { message, Modal } from 'ant-design-vue'
import { BasicDrawer } from '@/components'
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
const title = computed(
  () =>
    ({
      create: 'Thêm khách hàng',
      edit: 'Sửa khách hàng',
      view: 'Chi tiết khách hàng',
      toggle: 'Chuyển trạng thái khách hàng',
    })[props.mode],
)
const warehouseName = computed(
  () =>
    warehouses.warehouses.find((item) => item.id === warehouseId.value)?.name ?? warehouseId.value,
)
const detailItems = computed(() => {
  const item = detail.value
  if (!item) return []
  return [
    { label: 'Mã khách', value: item.code, wide: true },
    { label: 'Tên khách', value: item.name },
    { label: 'Kho', value: warehouseName.value },
    { label: 'Điện thoại', value: item.phone || '—' },
    { label: 'Trạng thái', value: item.status === 1 ? 'Hoạt động' : 'Ngừng hoạt động' },
    { label: 'Địa chỉ', value: item.address || '—', wide: true },
    { label: 'Ghi chú', value: item.note || '—', wide: true },
    { label: 'Ngày tạo', value: formatDateTime(item.createdAt) || '—' },
    { label: 'Cập nhật', value: formatDateTime(item.updatedAt) || '—' },
  ]
})
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
  <BasicDrawer
    :open="open"
    :title="title"
    :confirm-loading="saving"
    width="min(760px, 100vw)"
    @update:open="emit('update:open', false)"
    @confirm="submit"
  >
    <a-spin :spinning="loading">
      <a-alert v-if="error" type="error" show-icon :message="error" class="customer-alert" />
      <a-alert
        v-if="id && !can('CUSTOMER_VIEW')"
        type="warning"
        show-icon
        message="Cần CUSTOMER_VIEW để tải đầy đủ dữ liệu trước khi sửa."
        class="customer-alert"
      />
      <template v-if="allowed && (!id || detail)">
        <template v-if="detail && (mode === 'view' || mode === 'toggle')">
          <a-alert
            v-if="mode === 'toggle'"
            class="customer-alert"
            type="warning"
            show-icon
            :message="detail.status === 1 ? 'Ngừng hoạt động khách hàng?' : 'Kích hoạt khách hàng?'"
            :description="'Xác nhận chuyển trạng thái của ' + detail.name + '.'"
          />
          <dl class="customer-detail">
            <div
              v-for="item in detailItems"
              :key="item.label"
              :class="{ 'customer-detail-wide': item.wide }"
            >
              <dt>{{ item.label }}</dt>
              <dd>{{ item.value }}</dd>
            </div>
          </dl>
        </template>
        <a-form v-else layout="vertical" :disabled="saving || loading || blocked" :model="form">
          <div class="customer-form">
            <a-form-item
              label="Kho"
              html-for="customer-warehouse"
              :help="fields.warehouseId"
              :validate-status="fields.warehouseId ? 'error' : undefined"
              required
            >
              <a-select
                v-if="mode === 'create'"
                id="customer-warehouse"
                v-model:value="warehouseId"
                :options="options"
                placeholder="Chọn kho"
              />
              <a-input v-else id="customer-warehouse" :value="warehouseName" disabled />
            </a-form-item>
            <a-form-item
              label="Trạng thái"
              html-for="customer-status"
              :help="fields.status"
              :validate-status="fields.status ? 'error' : undefined"
              required
            >
              <a-select
                id="customer-status"
                v-model:value="form.status"
                :options="[
                  { value: 1, label: 'Hoạt động' },
                  { value: 0, label: 'Ngừng hoạt động' },
                ]"
              />
            </a-form-item>
            <div v-if="detail" class="customer-form-wide customer-code-detail">
              <span>Mã khách</span>
              <p>{{ detail.code }}</p>
            </div>
            <a-form-item
              label="Tên"
              html-for="customer-name"
              required
              :help="fields.name"
              :validate-status="fields.name ? 'error' : undefined"
            >
              <a-input id="customer-name" v-model:value="form.name" :maxlength="160" />
            </a-form-item>
            <a-form-item
              label="Điện thoại"
              html-for="customer-phone"
              :help="fields.phone"
              :validate-status="fields.phone ? 'error' : undefined"
            >
              <a-input
                id="customer-phone"
                v-model:value="form.phone"
                :maxlength="20"
                inputmode="tel"
              />
            </a-form-item>
            <a-form-item
              class="customer-form-wide"
              label="Địa chỉ"
              html-for="customer-address"
              :help="fields.address"
              :validate-status="fields.address ? 'error' : undefined"
            >
              <a-textarea
                id="customer-address"
                v-model:value="form.address"
                :maxlength="500"
                :rows="3"
                show-count
              />
            </a-form-item>
            <a-form-item
              class="customer-form-wide"
              label="Ghi chú"
              html-for="customer-note"
              :help="fields.note"
              :validate-status="fields.note ? 'error' : undefined"
            >
              <a-textarea
                id="customer-note"
                v-model:value="form.note"
                :maxlength="2000"
                :rows="4"
                show-count
              />
            </a-form-item>
          </div>
          <p v-if="detail" class="customer-timestamps">
            Ngày tạo: {{ formatDateTime(detail.createdAt) || '—' }} · Cập nhật:
            {{ formatDateTime(detail.updatedAt) || '—' }}
          </p>
        </a-form>
      </template>
    </a-spin>
    <template #footer="{ close }">
      <div class="customer-dialog-footer">
        <a-button :disabled="saving" @click="close">{{
          mode === 'view' ? 'Đóng' : 'Hủy'
        }}</a-button>
        <a-button v-if="id" :disabled="saving || loading" @click="reload"
          >Tải lại dữ liệu gốc</a-button
        >
        <a-button
          v-if="mode !== 'view'"
          type="primary"
          :loading="saving"
          :disabled="loading || blocked || !allowed || (!!id && !detail)"
          @click="submit"
        >
          {{ mode === 'toggle' ? (detail?.status === 1 ? 'Ngừng hoạt động' : 'Kích hoạt') : 'Lưu' }}
        </a-button>
      </div>
    </template>
  </BasicDrawer>
</template>
<style scoped>
.customer-alert {
  margin-bottom: 16px;
}
.customer-form,
.customer-detail {
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
  gap: 0 16px;
}
.customer-form-wide,
.customer-detail-wide {
  grid-column: 1 / -1;
}
.customer-code-detail {
  margin-bottom: 24px;
}
.customer-code-detail span,
.customer-detail dt {
  color: #757080;
  font-size: 13px;
}
.customer-code-detail p {
  margin: 6px 0 0;
  overflow-wrap: anywhere;
}
.customer-detail {
  margin: 0;
  gap: 20px 24px;
}
.customer-detail > div {
  min-width: 0;
}
.customer-detail dd {
  margin: 6px 0 0;
  white-space: pre-wrap;
  overflow-wrap: anywhere;
}
.customer-timestamps {
  color: #757080;
  font-size: 13px;
  overflow-wrap: anywhere;
}
.customer-dialog-footer {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  flex-wrap: wrap;
  gap: 8px;
}
@media (max-width: 650px) {
  .customer-form,
  .customer-detail {
    grid-template-columns: minmax(0, 1fr);
  }
}
</style>
