<script setup lang="ts">
import { computed, ref, watch, onBeforeUnmount } from 'vue'
import { useI18n } from 'vue-i18n'
import { Modal, message } from 'ant-design-vue'
import UserAssignmentDrawer from './UserAssignmentDrawer.vue'
import {
  HomeOutlined,
  ReloadOutlined,
  LinkOutlined,
  DisconnectOutlined,
} from '@ant-design/icons-vue'
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
let session = 0
const load = async (): Promise<void> => {
  const id = props.user?.id
  const requestVersion = ++version
  if (!id || !props.open || !canView.value) {
    loading.value = false
    return
  }
  loading.value = true
  error.value = ''
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
  const currentSession = session
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
    if (auth.user) await scope.load(auth.user.id).catch(() => undefined)
    if (currentSession === session) error.value = text
  } finally {
    if (currentSession === session) busy.value = undefined
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
    ++session
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
    ++session
    ++version
    busy.value = undefined
    loading.value = false
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
  <UserAssignmentDrawer
    :open="open"
    :user="user"
    kind="warehouse"
    :title="$t('catalog.assignedWarehouses')"
    :description="$t('user.warehouseDescription')"
    :note="$t('user.warehouseNote')"
    :busy="!!busy"
    @update:open="emit('update:open', $event)"
  >
    <a-alert v-if="!canView" type="warning" show-icon :message="$t('catalog.forbidden')" />
    <a-alert v-if="error" type="error" show-icon :message="error" />
    <div class="warehouse-toolbar">
      <a-button :disabled="!!busy || !canView" :loading="loading" @click="load"
        ><template #icon><ReloadOutlined aria-hidden="true" /></template
        >{{ $t('common.reload') }}</a-button
      >
    </div>
    <a-spin :spinning="loading">
      <h3 class="assignment-section-title">
        {{ $t('catalog.assignedWarehouses') }}
        <span class="assignment-count">{{ assigned.length }}</span>
      </h3>
      <a-empty v-if="!loading && !assigned.length" :description="$t('catalog.emptyAssigned')" />
      <div v-for="warehouse in assigned" :key="warehouse.id" class="assignment-card">
        <span class="assignment-card-icon"><HomeOutlined aria-hidden="true" /></span>
        <div class="assignment-card-copy">
          <strong>{{ warehouse.code || '—' }}</strong
          ><span>{{ warehouse.name || '—' }}</span
          ><a-tag
            v-if="warehouse.status !== undefined && warehouse.status !== null"
            :color="warehouse.status === 1 ? 'success' : 'default'"
            >{{ $t(warehouse.status === 1 ? 'common.active' : 'common.inactive') }}</a-tag
          >
        </div>
        <a-button
          v-if="canAssign"
          danger
          :loading="busy === warehouse.id"
          :disabled="!!busy || loading"
          @click="confirmRemove(warehouse)"
          ><template #icon><DisconnectOutlined aria-hidden="true" /></template
          >{{ $t('catalog.unassign') }}</a-button
        >
      </div>
      <h3 class="assignment-section-title">
        {{ $t('catalog.assignableWarehouses') }}
        <span class="assignment-count">{{ unassigned.length }}</span>
      </h3>
      <a-empty v-if="!loading && !unassigned.length" :description="$t('common.noData')" />
      <div v-for="warehouse in unassigned" :key="warehouse.id" class="assignment-card">
        <span class="assignment-card-icon"><HomeOutlined aria-hidden="true" /></span>
        <div class="assignment-card-copy">
          <strong>{{ warehouse.code || '—' }}</strong
          ><span>{{ warehouse.name || '—' }}</span
          ><a-tag
            v-if="warehouse.status !== undefined && warehouse.status !== null"
            :color="warehouse.status === 1 ? 'success' : 'default'"
            >{{ $t(warehouse.status === 1 ? 'common.active' : 'common.inactive') }}</a-tag
          >
        </div>
        <a-button
          v-if="canAssign"
          type="primary"
          :loading="busy === warehouse.id"
          :disabled="warehouse.status === 0 || !!busy || loading"
          @click="mutate(warehouse, false)"
          ><template #icon><LinkOutlined aria-hidden="true" /></template
          >{{ $t('catalog.assign') }}</a-button
        >
      </div>
    </a-spin>
    <template #footer="{ close }"
      ><a-button :disabled="!!busy" @click="close">{{ $t('user.close') }}</a-button></template
    >
  </UserAssignmentDrawer>
</template>
<style scoped>
.ant-alert {
  margin-bottom: 16px;
}
.warehouse-toolbar {
  display: flex;
  justify-content: flex-end;
  margin-bottom: 20px;
}
.warehouse-toolbar button {
  height: 32px;
  color: #7357cf;
  border-color: #d4c7f6;
}
@media (max-width: 599px) {
  .warehouse-toolbar button {
    height: 44px;
  }
}
</style>
