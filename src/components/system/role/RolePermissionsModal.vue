<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { message } from 'ant-design-vue'
import { SafetyCertificateOutlined, SearchOutlined } from '@ant-design/icons-vue'
import {
  getPermissions,
  getRolePermissions,
  updateRolePermissions,
} from '@/api/permission/permission.api'
import type { Role } from '@/types/role'
import type { Permission } from '@/types/permission'
import type { NormalizedApiError } from '@/utils/request'
import { PERMISSIONS } from '@/constants/permissions'
import { useAuthStore } from '@/stores/auth'
import { hasPermission } from '@/utils/permission'
import RoleDialog from './RoleDialog.vue'
import RoleIdentity from './RoleIdentity.vue'

const props = defineProps<{ open: boolean; role: Role | null }>()
const emit = defineEmits<{ 'update:open': [open: boolean]; saved: [] }>()
const { t } = useI18n()
const auth = useAuthStore()
const options = ref<Permission[]>([])
const savedIds = ref<string[]>([])
const draftIds = ref<string[]>([])
const keyword = ref('')
const loading = ref(false)
const saving = ref(false)
const ready = ref(false)
const error = ref('')
let version = 0
const canUpdate = computed(() =>
  hasPermission(PERMISSIONS.ROLE_UPDATE, auth.user?.permissions ?? []),
)
const disabled = computed(
  () =>
    !ready.value ||
    loading.value ||
    saving.value ||
    !canUpdate.value ||
    props.role?.code === 'ADMIN',
)
const visibleOptions = computed(() => {
  const query = keyword.value.trim().toLocaleLowerCase()
  return options.value.filter((permission) =>
    `${permission.name}\n${permission.code}`.toLocaleLowerCase().includes(query),
  )
})
const apiError = (cause: unknown): string => {
  if (!(cause instanceof Error)) return t('errors.unknown')
  return (cause as NormalizedApiError).status === 403
    ? t('role.actionForbidden')
    : cause.message || t('errors.unknown')
}
const load = async (): Promise<void> => {
  const request = ++version
  const role = props.role
  options.value = []
  savedIds.value = []
  draftIds.value = []
  keyword.value = ''
  error.value = ''
  ready.value = false
  loading.value = false
  if (!props.open || !role || !canUpdate.value) return
  loading.value = true
  const current = (): boolean => request === version && props.open && props.role?.id === role.id
  try {
    const loadAll = async (): Promise<Permission[]> => {
      const permissions: Permission[] = []
      let page = 1
      while (current()) {
        const response = await getPermissions({ page, pageSize: 100 })
        permissions.push(...response.items)
        if (permissions.length >= response.total || response.items.length < 100) break
        page++
      }
      return permissions
    }
    const [all, assigned] = await Promise.all([loadAll(), getRolePermissions(role.id)])
    if (!current()) return
    // The assignment endpoint can include permissions absent from the catalogue.
    // Include these records so a full replacement payload preserves their IDs.
    options.value = [
      ...new Map([...assigned, ...all].map((permission) => [permission.id, permission])).values(),
    ]
    savedIds.value = [...new Set(assigned.map((permission) => permission.id))]
    draftIds.value = [...savedIds.value]
    ready.value = true
  } catch (cause) {
    if (current()) error.value = apiError(cause)
  } finally {
    if (current()) loading.value = false
  }
}
watch([() => props.open, () => props.role?.id], () => void load())
const togglePermission = (id: string, checked: boolean): void => {
  if (disabled.value) return
  // CheckboxGroup drops unmounted (filtered-out) values when another option changes.
  // Update one ID explicitly so the entire draft survives local filtering.
  draftIds.value = checked
    ? [...new Set([...draftIds.value, id])]
    : draftIds.value.filter((value) => value !== id)
}
const save = async (): Promise<void> => {
  if (
    !props.open ||
    !props.role ||
    !ready.value ||
    loading.value ||
    saving.value ||
    !canUpdate.value
  )
    return
  const role = props.role
  const request = version
  // ADMIN checkboxes remain protected; submit the unchanged saved assignment.
  const ids = [...(role.code === 'ADMIN' ? savedIds.value : draftIds.value)]
  saving.value = true
  error.value = ''
  try {
    const response = await updateRolePermissions(role.id, ids)
    if (request !== version || !props.open || props.role?.id !== role.id) return
    savedIds.value = response.map((permission) => permission.id)
    message.success(t('role.assignPermissionSuccess'))
    emit('update:open', false)
    emit('saved')
  } catch (cause) {
    if (request === version) error.value = apiError(cause)
  } finally {
    saving.value = false
  }
}
onBeforeUnmount(() => {
  ++version
})
</script>

<template>
  <RoleDialog
    :open="open"
    :title="$t('role.assignPermissionTitle')"
    :width="780"
    :saving="saving"
    :confirm-disabled="!ready || loading || !canUpdate"
    @update:open="emit('update:open', $event)"
    @confirm="save"
  >
    <template #icon><SafetyCertificateOutlined aria-hidden="true" /></template>
    <div class="role-permissions" :aria-busy="loading">
      <RoleIdentity v-if="role" :role="role" />
      <a-alert
        v-if="role?.code === 'ADMIN'"
        :message="$t('role.adminRestrictedNotice')"
        type="warning"
        show-icon
      />
      <a-alert v-if="error" :message="error" type="error" show-icon
        ><template v-if="!ready" #action
          ><a-button size="small" :loading="loading" @click="load">{{
            $t('common.reload')
          }}</a-button></template
        ></a-alert
      >
      <div class="role-permissions-toolbar">
        <a-input
          v-model:value="keyword"
          :placeholder="$t('role.permissionKeywordPlaceholder')"
          :aria-label="$t('role.permissionKeywordPlaceholder')"
          :disabled="!ready"
          allow-clear
          ><template #prefix><SearchOutlined aria-hidden="true" /></template
        ></a-input>
        <span aria-live="polite">{{
          $t('role.selectedPermissions', { count: draftIds.length })
        }}</span>
      </div>
      <div class="role-permissions-list">
        <a-spin v-if="loading" class="role-permissions-loading" />
        <div
          v-else-if="ready"
          role="group"
          class="role-permissions-grid"
          :aria-label="$t('role.rolePermissions')"
        >
          <a-checkbox
            v-for="permission in visibleOptions"
            :key="permission.id"
            :checked="draftIds.includes(permission.id)"
            :disabled="disabled"
            class="role-permission-option"
            :class="{ 'role-permission-option--selected': draftIds.includes(permission.id) }"
            @change="togglePermission(permission.id, $event.target.checked)"
          >
            <span class="role-permission-copy"
              ><strong>{{ permission.name || permission.code || '—' }}</strong
              ><small v-if="permission.code && permission.code !== permission.name">{{
                permission.code
              }}</small></span
            >
          </a-checkbox>
        </div>
        <a-empty
          v-if="ready && !visibleOptions.length"
          :description="$t('common.noData')"
          :image="null"
        />
      </div>
    </div>
  </RoleDialog>
</template>

<style scoped>
.role-permissions {
  display: flex;
  flex-direction: column;
  min-width: 0;
  min-height: 0;
  gap: 12px;
  padding-top: 12px;
}
.role-permissions > :not(.role-permissions-list) {
  flex-shrink: 0;
}
.role-permissions-toolbar {
  display: flex;
  align-items: center;
  gap: 12px;
  min-width: 0;
}
.role-permissions-toolbar > .ant-input-affix-wrapper {
  flex: 1;
  min-width: 0;
}
.role-permissions-toolbar > span {
  flex-shrink: 0;
  color: #7357cf;
  font-size: 13px;
  font-weight: 600;
}
.role-permissions-list {
  min-width: 0;
  min-height: 80px;
  max-height: 360px;
  overflow: auto;
  padding: 2px;
}
.role-permissions-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  align-items: stretch;
  gap: 8px;
  width: 100%;
}
.role-permission-option {
  align-items: flex-start;
  min-width: 0;
  margin: 0;
  padding: 12px;
  border: 1px solid #eeeaf6;
  border-radius: 8px;
}
.role-permission-option--selected {
  background: #f5f0ff;
  border-color: #ded2fa;
}
.role-permission-option :deep(.ant-checkbox) {
  flex-shrink: 0;
  margin-top: 3px;
}
.role-permission-option :deep(.ant-checkbox + span) {
  min-width: 0;
}
.role-permission-copy {
  display: flex;
  flex-direction: column;
  gap: 4px;
  min-width: 0;
  white-space: normal;
  overflow-wrap: anywhere;
}
.role-permission-copy strong {
  font-size: 13px;
  font-weight: 500;
}
.role-permission-copy small {
  color: #847b99;
  font-size: 12px;
}
.role-permissions-loading {
  display: block;
  padding: 28px;
}
@media (max-width: 599px) {
  .role-permissions-toolbar {
    flex-direction: column;
    align-items: stretch;
    gap: 8px;
  }
  .role-permissions-toolbar > span {
    text-align: right;
  }
  .role-permissions-grid {
    grid-template-columns: minmax(0, 1fr);
  }
  .role-permission-option {
    padding: 12px 10px;
  }
}
</style>
