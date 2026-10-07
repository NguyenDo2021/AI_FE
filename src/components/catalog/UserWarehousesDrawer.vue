<script setup lang="ts">
import { computed, ref, watch, onBeforeUnmount } from 'vue'
import { useI18n } from 'vue-i18n'
import { Modal, message } from 'ant-design-vue'
import { BasicDrawer } from '@/components'
import {
  getAssignedWarehouses,
  getMyWarehouses,
  assignWarehouse,
  unassignWarehouse,
} from '@/api/catalog/catalog.api'
import type { Warehouse } from '@/types/catalog'
import type { User } from '@/types/user'
import { useCatalogPermission } from '@/composables/useCatalogPermission'
import { useAuthStore } from '@/stores/auth'
import { useWarehouseStore } from '@/stores/warehouse'
import { catalogError } from '@/utils/catalog'
const props = defineProps<{ open: boolean; user: User | null }>()
const emit = defineEmits<{ 'update:open': [open: boolean] }>()
const { t } = useI18n()
const { can } = useCatalogPermission()
const auth = useAuthStore()
const scope = useWarehouseStore()
const assigned = ref<Warehouse[]>([])
const available = ref<Warehouse[]>([])
const loading = ref(false)
const busy = ref<string>()
const error = ref('')
const canAssign = computed(() => can('USER_WAREHOUSE_ASSIGN'))
const canView = computed(() => can('USER_WAREHOUSE_VIEW'))
const unassigned = computed(() =>
  available.value.filter((item) => !assigned.value.some((existing) => existing.id === item.id)),
)
let version = 0
const load = async (): Promise<void> => {
  const id = props.user?.id
  const requestVersion = ++version
  if (!id || !props.open || !canView.value) {
    loading.value = false
    return
  }
  loading.value = true
  error.value = ''
  assigned.value = []
  available.value = []
  try {
    const [current, options] = await Promise.all([getAssignedWarehouses(id), getMyWarehouses()])
    if (requestVersion !== version) return
    assigned.value = current
    available.value = options
  } catch (cause) {
    if (requestVersion === version) error.value = catalogError(cause, t)
  } finally {
    if (requestVersion === version) loading.value = false
  }
}
const mutate = async (warehouse: Warehouse, remove: boolean): Promise<void> => {
  const id = props.user?.id
  if (!id || busy.value || loading.value || !canAssign.value || !canView.value) return
  if (!remove && warehouse.status === 0) return
  if (remove && !assigned.value.some((item) => item.id === warehouse.id)) return
  const currentVersion = version
  busy.value = warehouse.id
  error.value = ''
  try {
    if (remove) await unassignWarehouse(id, warehouse.id)
    else await assignWarehouse(id, warehouse.id)
    if (currentVersion !== version) return
    message.success(t('catalog.saved'))
    await Promise.all([
      load(),
      auth.user ? scope.load(auth.user.id).catch(() => undefined) : Promise.resolve(),
    ])
  } catch (cause) {
    if (currentVersion !== version) return
    const text = catalogError(cause, t)
    await Promise.all([
      load(),
      auth.user ? scope.load(auth.user.id).catch(() => undefined) : Promise.resolve(),
    ])
    error.value = text
  } finally {
    if (props.user?.id === id) busy.value = undefined
  }
}
const confirmRemove = (warehouse: Warehouse): void => {
  const userId = props.user?.id
  Modal.confirm({
    title: t('catalog.unassignConfirm'),
    okButtonProps: { danger: true },
    onOk: () => (props.open && props.user?.id === userId ? mutate(warehouse, true) : undefined),
  })
}
watch(
  [() => props.open, () => props.user?.id],
  () => {
    ++version
    busy.value = undefined
    assigned.value = []
    available.value = []
    error.value = ''
    void load()
  },
  { immediate: true },
)
watch(canView, (allowed) => {
  if (!allowed) {
    ++version
    assigned.value = []
    available.value = []
    error.value = t('catalog.forbidden')
  } else void load()
})
onBeforeUnmount(() => {
  ++version
})
</script>
<template>
  <BasicDrawer
    :open="open"
    :title="`${$t('catalog.assignedWarehouses')} — ${user?.fullName ?? user?.username ?? ''}`"
    width="700px"
    :confirm-loading="!!busy"
    @update:open="emit('update:open', $event)"
  >
    <a-alert
      v-if="!auth.isCatalogAdmin"
      type="info"
      show-icon
      :message="$t('catalog.partialScope')"
    />
    <a-alert v-if="error" type="error" show-icon :message="error" />
    <a-button :disabled="!!busy" :loading="loading" @click="load">{{
      $t('common.reload')
    }}</a-button>
    <a-spin :spinning="loading">
      <h3>{{ $t('catalog.assignedWarehouses') }}</h3>
      <a-empty v-if="!assigned.length" :description="$t('catalog.emptyAssigned')" />
      <div v-for="warehouse in assigned" :key="warehouse.id" class="warehouse-row">
        <div>
          <strong>{{ warehouse.code }}</strong> — {{ warehouse.name }}
          <a-tag :color="warehouse.status === 1 ? 'green' : 'default'">{{
            $t(warehouse.status === 1 ? 'common.active' : 'common.inactive')
          }}</a-tag>
        </div>
        <a-button
          v-if="canAssign"
          danger
          :loading="busy === warehouse.id"
          :disabled="!!busy || loading"
          @click="confirmRemove(warehouse)"
          >{{ $t('catalog.unassign') }}</a-button
        >
      </div>
      <h3>{{ $t('catalog.assignableWarehouses') }}</h3>
      <a-empty v-if="!unassigned.length" :description="$t('common.noData')" />
      <div v-for="warehouse in unassigned" :key="warehouse.id" class="warehouse-row">
        <div>
          <strong>{{ warehouse.code }}</strong> — {{ warehouse.name }}
          <a-tag v-if="warehouse.status === 0">{{ $t('common.inactive') }}</a-tag>
        </div>
        <a-button
          v-if="canAssign"
          :loading="busy === warehouse.id"
          :disabled="warehouse.status === 0 || !!busy || loading"
          @click="mutate(warehouse, false)"
          >{{ $t('catalog.assign') }}</a-button
        >
      </div>
    </a-spin>
    <template #footer="{ close }"
      ><a-button :disabled="!!busy" @click="close">{{ $t('common.cancel') }}</a-button></template
    >
  </BasicDrawer>
</template>
<style scoped>
.ant-alert {
  margin-bottom: 16px;
}
h3 {
  margin-top: 24px;
}
.warehouse-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 12px 0;
  border-bottom: 1px solid #eee;
}
</style>
