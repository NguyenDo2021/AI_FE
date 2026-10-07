<script setup lang="ts">
import UserWarehousesDrawer from '@/components/catalog/UserWarehousesDrawer.vue'
import { useCatalogPermission } from '@/composables/useCatalogPermission'
import { computed, onMounted, reactive, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { message, Modal } from 'ant-design-vue'
import type { TableColumnsType } from 'ant-design-vue'
import { getRoles } from '@/api/role/role.api'
import {
  createUser,
  deleteUser,
  getUser,
  getUserList,
  getUserRoles,
  removeUserRole,
  updateUser,
  updateUserRoles,
} from '@/api/user/user.api'
import { PERMISSIONS } from '@/constants/permissions'
import { BasicForm, BasicModal, BasicTable, BasicDrawer, type FormSchema } from '@/components'
import type { PageData } from '@/types/api'
import type { Role } from '@/types/role'
import type { User, UserListParams, UserPayload } from '@/types/user'
import { useAuthStore } from '@/stores/auth'
import { formatDateTime, formatOrdinal } from '@/utils'
import { hasPermission } from '@/utils/permission'
import { type NormalizedApiError } from '@/utils/request'
import { validationRules } from '@/utils/validate'

const { t } = useI18n()
const authStore = useAuthStore()
const { can: canCatalog } = useCatalogPermission()
const warehouseDrawerOpen = ref(false)
const warehouseUser = ref<User | null>(null)
const openAssignedWarehouses = (user: User): void => {
  warehouseUser.value = user
  warehouseDrawerOpen.value = true
}
const users = ref<User[]>([])
const loading = ref(false)
const saving = ref(false)
const errorMessage = ref('')
const modalOpen = ref(false)
const drawerOpen = ref(false)
const roleModalOpen = ref(false)
const editingUserId = ref<string | null>(null)
const selectedUser = ref<User | null>(null)
const roleAssignUser = ref<User | null>(null)
const roleOptions = ref<Role[]>([])
const selectedRoleIds = ref<string[]>([])
const loadingRoles = ref(false)
const savingRoles = ref(false)
const removingRoleId = ref<string | null>(null)
const formRef = ref<InstanceType<typeof BasicForm>>()
const page = ref(1)
const pageSize = ref(10)
const total = ref(0)
const ROLE_PAGE_SIZE_LIMIT = 100
const filters = reactive({ keyword: '', status: undefined as number | undefined })
const form = ref<Record<string, unknown>>({})
const canViewUserRoles = computed(() =>
  hasPermission(PERMISSIONS.USER_VIEW, authStore.user?.permissions ?? []),
)
const canUpdateUserRoles = computed(() =>
  hasPermission(PERMISSIONS.USER_UPDATE, authStore.user?.permissions ?? []),
)

const formRules = computed(() => ({
  username: [validationRules.required(t('user.required'))],
  fullName: [validationRules.required(t('user.required'))],
  email: [
    validationRules.required(t('user.required')),
    validationRules.email(t('user.invalidEmail')),
  ],
}))
const formSchema = computed<FormSchema[]>(() => [
  { name: 'username', label: t('user.username'), rules: formRules.value.username },
  { name: 'fullName', label: t('user.fullName'), rules: formRules.value.fullName },
  { name: 'email', label: t('user.email'), type: 'email', rules: formRules.value.email },
  { name: 'phone', label: t('user.phone'), placeholder: '+84901234567' },
  {
    name: 'status',
    label: t('user.status'),
    type: 'select',
    options: [
      { label: t('common.active'), value: 1 },
      { label: t('common.inactive'), value: 0 },
    ],
  },
])

const columns = computed<TableColumnsType<User>>(() => [
  {
    title: 'STT',
    key: 'index',
    width: 72,
    customRender: ({ index }) => formatOrdinal(index, page.value, pageSize.value),
  },
  { title: t('user.username'), dataIndex: 'username', key: 'username' },
  { title: t('user.fullName'), dataIndex: 'fullName', key: 'fullName' },
  { title: t('user.email'), dataIndex: 'email', key: 'email' },
  { title: t('user.phone'), dataIndex: 'phone', key: 'phone' },
  { title: t('user.status'), dataIndex: 'status', key: 'status' },
  { title: t('user.createdAt'), dataIndex: 'createdAt', key: 'createdAt' },
  { title: t('user.updatedAt'), dataIndex: 'updatedAt', key: 'updatedAt' },
  { title: t('user.updatedBy'), dataIndex: 'updatedByName', key: 'updatedByName' },
  { title: t('common.actions'), key: 'actions', fixed: 'right', width: 390 },
])

const pagination = computed(() => ({
  current: page.value,
  pageSize: pageSize.value,
  total: total.value,
  showSizeChanger: true,
  showTotal: (count: number) => `${count}`,
}))

const selectedRoles = computed(() =>
  roleOptions.value.filter((role) => selectedRoleIds.value.includes(role.id)),
)

const apiErrorMessage = (error: unknown, fallback = t('errors.unknown')): string => {
  if (!(error instanceof Error)) return fallback
  const apiError = error as NormalizedApiError
  if (apiError.status === 403) return t('user.rolePermissionDenied')
  return apiError.message || fallback
}

const loadUsers = async (): Promise<void> => {
  if (loading.value) return
  loading.value = true
  try {
    const response: PageData<User> = await getUserList({
      page: page.value,
      pageSize: pageSize.value,
      keyword: filters.keyword || undefined,
      status: filters.status,
    } satisfies UserListParams)
    users.value = response.items
    total.value = response.total
    errorMessage.value = ''
  } catch {
    errorMessage.value = t('errors.unknown')
  } finally {
    loading.value = false
  }
}

const search = (keyword: string): void => {
  filters.keyword = keyword
  page.value = 1
  void loadUsers()
}

const resetFilters = (): void => {
  filters.keyword = ''
  filters.status = undefined
  page.value = 1
  void loadUsers()
}

const changePage = (nextPage: number, nextPageSize: number): void => {
  page.value = nextPage
  pageSize.value = nextPageSize
  void loadUsers()
}

const openCreate = (): void => {
  editingUserId.value = null
  form.value = { status: 1 }
  modalOpen.value = true
}

const openEdit = (user: User): void => {
  editingUserId.value = user.id
  form.value = {
    username: user.username,
    fullName: user.fullName,
    email: user.email,
    phone: user.phone,
    status: user.status,
  }
  modalOpen.value = true
}

const openDetail = async (user: User): Promise<void> => {
  try {
    selectedUser.value = await getUser(user.id)
    drawerOpen.value = true
  } catch (error) {
    errorMessage.value = apiErrorMessage(error)
  }
}

const loadAllRolesForAssignment = async (): Promise<Role[]> => {
  const allRoles: Role[] = []
  let currentPage = 1

  while (true) {
    const response = await getRoles({
      page: currentPage,
      pageSize: ROLE_PAGE_SIZE_LIMIT,
    })

    allRoles.push(...response.items)

    if (allRoles.length >= response.total || response.items.length < ROLE_PAGE_SIZE_LIMIT) {
      break
    }

    currentPage += 1
  }

  return allRoles
}

const openAssignRoleModal = async (user: User): Promise<void> => {
  if (!canViewUserRoles.value || !canUpdateUserRoles.value) return

  roleAssignUser.value = user
  roleModalOpen.value = true
  loadingRoles.value = true
  selectedRoleIds.value = []
  roleOptions.value = []

  try {
    const [allRoles, currentRoles] = await Promise.all([
      loadAllRolesForAssignment(),
      getUserRoles(user.id),
    ])
    roleOptions.value = allRoles
    selectedRoleIds.value = currentRoles.map((role) => role.id)
    errorMessage.value = ''
  } catch (error) {
    errorMessage.value = apiErrorMessage(error)
    roleModalOpen.value = false
  } finally {
    loadingRoles.value = false
  }
}

const removeSingleRole = async (roleId: string): Promise<void> => {
  if (!roleAssignUser.value || removingRoleId.value) return
  const targetRole = roleOptions.value.find((role) => role.id === roleId)
  if (!targetRole || targetRole.code === 'ADMIN') return

  removingRoleId.value = roleId
  try {
    await removeUserRole(roleAssignUser.value.id, roleId)
    selectedRoleIds.value = selectedRoleIds.value.filter((id) => id !== roleId)
    message.success(t('user.roleRemovedSuccess'))
  } catch (error) {
    errorMessage.value = apiErrorMessage(error)
  } finally {
    removingRoleId.value = null
  }
}

const saveUserRoles = async (): Promise<void> => {
  if (!roleAssignUser.value || savingRoles.value) return

  savingRoles.value = true
  try {
    await updateUserRoles(roleAssignUser.value.id, selectedRoleIds.value)
    message.success(t('user.assignRoleSuccess'))
    roleModalOpen.value = false
    errorMessage.value = ''
    await loadUsers()
  } catch (error) {
    errorMessage.value = apiErrorMessage(error)
  } finally {
    savingRoles.value = false
  }
}

const toPayload = (value: Record<string, unknown>): UserPayload => ({
  username: String(value.username ?? ''),
  fullName: String(value.fullName ?? ''),
  email: String(value.email ?? ''),
  phone: typeof value.phone === 'string' ? value.phone : undefined,
  status: typeof value.status === 'number' ? value.status : 1,
})

const saveUser = async (): Promise<void> => {
  if (saving.value) return
  await formRef.value?.validate()
  saving.value = true
  try {
    const payload = toPayload(formRef.value?.getValues() ?? form.value)
    if (editingUserId.value) await updateUser(editingUserId.value, payload)
    else await createUser(payload)
    message.success(t('user.saveSuccess'))
    modalOpen.value = false
    errorMessage.value = ''
    await loadUsers()
  } catch (error) {
    errorMessage.value = apiErrorMessage(error)
  } finally {
    saving.value = false
  }
}

const confirmDelete = (user: User): void => {
  Modal.confirm({
    title: t('user.deleteConfirm'),
    okText: t('common.delete'),
    cancelText: t('common.cancel'),
    okButtonProps: { danger: true },
    onOk: async () => {
      try {
        await deleteUser(user.id)
        message.success(t('user.deleteSuccess'))
        errorMessage.value = ''
        await loadUsers()
      } catch (error) {
        errorMessage.value = apiErrorMessage(error)
      }
    },
  })
}

onMounted(() => void loadUsers())
</script>

<template>
  <section>
    <a-alert
      v-if="errorMessage"
      :message="errorMessage"
      type="error"
      show-icon
      class="user-page__error"
    />
    <div class="user-page__heading">
      <div>
        <h1>{{ $t('user.management') }}</h1>
      </div>
      <a-button v-permission="PERMISSIONS.USER_CREATE" type="primary" @click="openCreate">
        {{ $t('user.add') }}
      </a-button>
    </div>
    <div class="user-page__filters">
      <a-input
        :value="filters.keyword"
        :placeholder="$t('user.keywordPlaceholder')"
        allow-clear
        @press-enter="search(filters.keyword)"
        @update:value="filters.keyword = $event"
      />
      <a-select
        v-model:value="filters.status"
        allow-clear
        :placeholder="$t('user.status')"
        :options="[
          { label: $t('common.active'), value: 1 },
          { label: $t('common.inactive'), value: 0 },
        ]"
      />
      <a-button type="primary" @click="search(filters.keyword)">{{ $t('common.search') }}</a-button>
      <a-button @click="resetFilters">
        {{ $t('common.reset') }}
      </a-button>
    </div>
    <BasicTable
      :columns="columns"
      :data-source="users"
      :loading="loading"
      :pagination="pagination"
      :searchable="false"
      @reload="loadUsers"
      @page-change="changePage"
    >
      <template #bodyCell="{ column, record }">
        <a-tag v-if="column.key === 'status'" :color="record.status === 1 ? 'green' : 'default'">
          {{ record.status === 1 ? $t('common.active') : $t('common.inactive') }}
        </a-tag>
        <span v-else-if="column.key === 'createdAt'">{{ formatDateTime(record.createdAt) }}</span>
        <span v-else-if="column.key === 'updatedAt'">{{ formatDateTime(record.updatedAt) }}</span>
        <div v-else-if="column.key === 'actions'" class="user-page__actions">
          <a-button type="link" size="small" @click="openDetail(record)">
            {{ $t('common.detail') }}
          </a-button>
          <a-button
            v-permission="PERMISSIONS.USER_UPDATE"
            type="link"
            size="small"
            @click="openEdit(record)"
          >
            {{ $t('common.edit') }}
          </a-button>
          <a-button
            v-if="canCatalog('USER_WAREHOUSE_VIEW')"
            type="link"
            size="small"
            @click="openAssignedWarehouses(record)"
            >{{ $t('catalog.assignedWarehouses') }}</a-button
          >
          <a-button
            v-if="canViewUserRoles && canUpdateUserRoles"
            type="link"
            size="small"
            @click="openAssignRoleModal(record)"
          >
            {{ $t('user.assignRole') }}
          </a-button>
          <a-button
            v-permission="PERMISSIONS.USER_DELETE"
            type="link"
            danger
            size="small"
            @click="confirmDelete(record)"
          >
            {{ $t('common.delete') }}
          </a-button>
        </div>
      </template>
    </BasicTable>

    <UserWarehousesDrawer v-model:open="warehouseDrawerOpen" :user="warehouseUser" />
    <BasicModal
      v-model:open="modalOpen"
      :title="editingUserId ? $t('user.edit') : $t('user.add')"
      :confirm-loading="saving"
      @confirm="saveUser"
    >
      <BasicForm
        ref="formRef"
        v-model="form"
        :schema="formSchema"
        :rules="formRules"
        :loading="saving"
        :label-col="7"
        :wrapper-col="17"
      />
    </BasicModal>

    <BasicModal
      v-model:open="roleModalOpen"
      :title="$t('user.assignRoleTitle')"
      :confirm-loading="savingRoles"
      width="560px"
      @confirm="saveUserRoles"
    >
      <a-spin :spinning="loadingRoles">
        <div v-if="roleAssignUser" class="user-role-modal__meta">
          <div>
            <strong>{{ $t('user.fullName') }}:</strong> {{ roleAssignUser.fullName }}
          </div>
          <div>
            <strong>{{ $t('user.username') }}:</strong> {{ roleAssignUser.username }}
          </div>
        </div>

        <div class="user-role-modal__section">
          <div class="user-role-modal__title">{{ $t('user.userRoles') }}</div>
          <a-checkbox-group v-model:value="selectedRoleIds" class="user-role-modal__group">
            <a-row :gutter="[8, 8]">
              <a-col v-for="role in roleOptions" :key="role.id" :span="24">
                <a-checkbox :value="role.id" :disabled="role.code === 'ADMIN'">
                  {{ role.name }} <span class="user-role-modal__code">({{ role.code }})</span>
                </a-checkbox>
              </a-col>
            </a-row>
          </a-checkbox-group>
        </div>

        <div v-if="selectedRoles.length" class="user-role-modal__section">
          <div class="user-role-modal__title">{{ $t('user.removeRole') }}</div>
          <div class="user-role-modal__selected-list">
            <div
              v-for="role in selectedRoles"
              :key="role.id"
              class="user-role-modal__selected-item"
            >
              <span>{{ role.name }}</span>
              <a-button
                v-if="role.code !== 'ADMIN'"
                v-permission="PERMISSIONS.USER_UPDATE"
                size="small"
                danger
                :loading="removingRoleId === role.id"
                @click="removeSingleRole(role.id)"
              >
                {{ $t('common.delete') }}
              </a-button>
            </div>
          </div>
        </div>
      </a-spin>
    </BasicModal>

    <BasicDrawer v-model:open="drawerOpen" :title="$t('user.detail')" :destroy-on-close="false">
      <a-descriptions v-if="selectedUser" bordered :column="1">
        <a-descriptions-item :label="$t('user.username')">{{
          selectedUser.username
        }}</a-descriptions-item>
        <a-descriptions-item :label="$t('user.fullName')">{{
          selectedUser.fullName
        }}</a-descriptions-item>
        <a-descriptions-item :label="$t('user.email')">{{
          selectedUser.email
        }}</a-descriptions-item>
        <a-descriptions-item :label="$t('user.phone')">{{
          selectedUser.phone || '-'
        }}</a-descriptions-item>
        <a-descriptions-item :label="$t('user.status')">
          {{ selectedUser.status === 1 ? $t('common.active') : $t('common.inactive') }}
        </a-descriptions-item>
      </a-descriptions>
      <template #footer><span /></template>
    </BasicDrawer>
  </section>
</template>

<style scoped>
.user-page__heading {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 20px;
}

.user-page__error {
  margin-bottom: 16px;
}

.user-page__heading h1 {
  margin: 0;
}

.user-page__filters {
  display: grid;
  grid-template-columns: minmax(240px, 1fr) 180px auto auto;
  gap: 12px;
  max-width: 900px;
  margin-bottom: 20px;
}

.user-page__actions {
  display: flex;
  gap: 4px;
}

@media (max-width: 720px) {
  .user-page__filters {
    grid-template-columns: 1fr 1fr;
  }
}

.user-role-modal__meta {
  display: grid;
  gap: 8px;
  margin-bottom: 16px;
}

.user-role-modal__section {
  margin-top: 16px;
}

.user-role-modal__title {
  font-weight: 600;
  margin-bottom: 12px;
}

.user-role-modal__group {
  width: 100%;
}

.user-role-modal__code {
  color: rgba(0, 0, 0, 0.45);
}

.user-role-modal__selected-list {
  display: grid;
  gap: 8px;
}

.user-role-modal__selected-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 8px 10px;
  border: 1px solid #f0f0f0;
  border-radius: 8px;
}
</style>
