<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { message } from 'ant-design-vue'
import {
  LockOutlined,
  SafetyCertificateOutlined,
  DisconnectOutlined,
  SaveOutlined,
  ReloadOutlined,
} from '@ant-design/icons-vue'
import UserAssignmentDrawer from './UserAssignmentDrawer.vue'
import { getRoles } from '@/api/role/role.api'
import { getUserRoles, updateUserRoles, removeUserRole } from '@/api/user/user.api'
import { useAuthStore } from '@/stores/auth'
import { PERMISSIONS } from '@/constants/permissions'
import { hasPermission } from '@/utils/permission'
import type { Role } from '@/types/role'
import type { User } from '@/types/user'

const props = defineProps<{ open: boolean; user: User | null }>()
const emit = defineEmits<{ 'update:open': [open: boolean]; saved: [] }>()
const { t } = useI18n()
const auth = useAuthStore()
const canView = computed(() => hasPermission(PERMISSIONS.USER_VIEW, auth.user?.permissions ?? []))
const canUpdate = computed(() =>
  hasPermission(PERMISSIONS.USER_UPDATE, auth.user?.permissions ?? []),
)
const options = ref<Role[]>([])
const assigned = ref<Role[]>([])
const selectedRoleIds = ref<string[]>([])
const loading = ref(false)
const saving = ref(false)
const removing = ref<string>()
const error = ref('')
const busy = computed(() => saving.value || !!removing.value)
// Preserve the existing system-user ADMIN protections for both checkbox and DELETE.
const protectedRole = (role: Role): boolean => role.code === 'ADMIN'
const roleChoices = computed(() => [
  ...options.value,
  ...assigned.value.filter((role) => !options.value.some((option) => option.id === role.id)),
])
const errorText = (cause: unknown): string =>
  cause instanceof Error ? cause.message : t('errors.unknown')
let version = 0
const load = async (): Promise<void> => {
  const id = props.user?.id
  const current = ++version
  if (!props.open || !id || !canView.value || !canUpdate.value) return
  loading.value = true
  error.value = ''
  options.value = []
  assigned.value = []
  selectedRoleIds.value = []
  try {
    const allRoles = async (): Promise<Role[]> => {
      const roles: Role[] = []
      let page = 1
      while (true) {
        const response = await getRoles({ page, pageSize: 100 })
        if (current !== version) return []
        roles.push(...response.items)
        if (roles.length >= response.total || response.items.length < 100) return roles
        page++
      }
    }
    const [roles, currentRoles] = await Promise.all([allRoles(), getUserRoles(id)])
    if (current !== version) return
    options.value = roles
    assigned.value = currentRoles
    selectedRoleIds.value = currentRoles.map((role) => role.id)
  } catch (cause) {
    if (current === version) error.value = errorText(cause)
  } finally {
    if (current === version) loading.value = false
  }
}
const remove = async (role: Role): Promise<void> => {
  const id = props.user?.id
  if (
    !id ||
    busy.value ||
    loading.value ||
    !canUpdate.value ||
    !canView.value ||
    protectedRole(role)
  )
    return
  const current = version
  removing.value = role.id
  error.value = ''
  try {
    await removeUserRole(id, role.id)
    if (current !== version) return
    assigned.value = assigned.value.filter((item) => item.id !== role.id)
    selectedRoleIds.value = selectedRoleIds.value.filter((item) => item !== role.id)
    message.success(t('user.roleRemovedSuccess'))
  } catch (cause) {
    if (current === version) error.value = errorText(cause)
  } finally {
    if (current === version) removing.value = undefined
  }
}
const save = async (): Promise<void> => {
  const id = props.user?.id
  if (
    !id ||
    busy.value ||
    loading.value ||
    (error.value && !roleChoices.value.length) ||
    !canUpdate.value ||
    !canView.value
  )
    return
  const current = version
  saving.value = true
  error.value = ''
  try {
    const response = await updateUserRoles(id, [...selectedRoleIds.value])
    if (current !== version) return
    assigned.value = response
    selectedRoleIds.value = response.map((role) => role.id)
    message.success(t('user.assignRoleSuccess'))
    emit('update:open', false)
    emit('saved')
  } catch (cause) {
    if (current === version) error.value = errorText(cause)
  } finally {
    if (current === version) saving.value = false
  }
}
watch(
  [() => props.open, () => props.user?.id, canView, canUpdate],
  () => {
    ++version
    assigned.value = []
    options.value = []
    selectedRoleIds.value = []
    error.value = ''
    loading.value = false
    saving.value = false
    removing.value = undefined
    void load()
  },
  { immediate: true },
)
onBeforeUnmount(() => ++version)
</script>

<template>
  <UserAssignmentDrawer
    :open="open"
    :user="user"
    kind="role"
    :title="$t('user.assignRole')"
    :description="$t('user.roleDescription')"
    :note="$t('user.roleNote')"
    :busy="busy"
    @update:open="emit('update:open', $event)"
  >
    <a-alert v-if="error" :message="error" type="error" show-icon class="role-error">
      <template #action
        ><a-button v-if="!roleChoices.length" size="small" :disabled="loading || busy" @click="load"
          ><ReloadOutlined aria-hidden="true" />{{ $t('common.reload') }}</a-button
        ></template
      >
    </a-alert>
    <a-spin :spinning="loading">
      <h3 class="assignment-section-title">
        {{ $t('user.chooseRoles') }}
        <span class="assignment-count">{{
          $t('user.selectedCount', { count: selectedRoleIds.length })
        }}</span>
      </h3>
      <a-checkbox-group
        v-model:value="selectedRoleIds"
        class="role-choices"
        :disabled="loading || busy || !canUpdate || !canView"
      >
        <a-checkbox
          v-for="role in roleChoices"
          :key="role.id"
          :value="role.id"
          :disabled="protectedRole(role) || loading || busy || !canUpdate || !canView"
          class="role-choice"
          :class="{
            'role-choice--selected': selectedRoleIds.includes(role.id),
            'role-choice--protected': protectedRole(role),
          }"
        >
          <LockOutlined v-if="protectedRole(role)" class="role-lock" />
          <span class="role-copy"
            ><strong>{{ role.name || '—' }}</strong
            ><span>{{ role.code || '—' }}</span></span
          >
        </a-checkbox>
      </a-checkbox-group>
      <a-empty v-if="!loading && !roleChoices.length" :description="$t('common.noData')" />
      <h3 class="assignment-section-title">
        {{ $t('user.assignedRoles') }} <span class="assignment-count">{{ assigned.length }}</span>
      </h3>
      <div v-for="role in assigned" :key="role.id" class="assignment-card">
        <span class="assignment-card-icon"><SafetyCertificateOutlined aria-hidden="true" /></span>
        <div class="assignment-card-copy">
          <strong>{{ role.name || '—' }}</strong
          ><span>{{ role.code || '—' }}</span>
        </div>
        <a-button
          v-if="!protectedRole(role) && canUpdate && canView"
          danger
          :loading="removing === role.id"
          :disabled="busy || loading"
          @click="remove(role)"
          ><template #icon><DisconnectOutlined aria-hidden="true" /></template
          >{{ $t('user.removeRole') }}</a-button
        >
        <LockOutlined v-else class="role-lock" :aria-label="$t('user.protectedRole')" />
      </div>
      <a-empty v-if="!loading && !assigned.length" :description="$t('common.noData')" />
    </a-spin>
    <template #footer="{ close }">
      <a-button :disabled="busy" @click="close">{{ $t('common.cancel') }}</a-button>
      <a-button
        type="primary"
        :loading="saving"
        :disabled="
          loading || !!removing || !canUpdate || !canView || (!!error && !roleChoices.length)
        "
        @click="save"
        ><template #icon><SaveOutlined aria-hidden="true" /></template
        >{{ $t('common.save') }}</a-button
      >
    </template>
  </UserAssignmentDrawer>
</template>

<style scoped>
.role-error {
  margin-bottom: 16px;
}
.role-choices {
  display: grid;
  grid-template-columns: minmax(0, 1fr);
  width: 100%;
  gap: 4px;
}
.role-choice {
  display: flex;
  align-items: center;
  gap: 16px;
  padding: 14px 12px;
  min-height: 68px;
  border-radius: 10px;
  cursor: pointer;
  margin-inline-start: 0;
  width: 100%;
  min-width: 0;
  white-space: normal;
}
.role-choice :deep(.ant-checkbox + span) {
  display: flex;
  flex: 1;
  align-items: center;
  gap: 14px;
  min-width: 0;
}
.role-choice--selected {
  background: #f3efff;
}
.role-choice--protected {
  color: #96929f;
  cursor: default;
}
.role-copy {
  display: grid;
  gap: 2px;
  min-width: 0;
  overflow-wrap: anywhere;
}
.role-copy strong {
  font-size: 15px;
}
.role-copy > span {
  color: #696480;
}
.role-lock {
  color: #aaa6b5;
  font-size: 20px;
}
.role-choice :deep(.ant-checkbox-wrapper) {
  margin: 0;
}
</style>
