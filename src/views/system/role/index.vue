<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { message, Modal } from 'ant-design-vue'
import type { TableColumnsType } from 'ant-design-vue'
import { createRole, deleteRole, getRole, getRoles, updateRole } from '@/api/role/role.api'
import { PERMISSIONS } from '@/constants/permissions'
import { BasicForm, BasicModal, BasicTable, BasicDrawer, type FormSchema } from '@/components'
import type { PageData } from '@/types/api'
import type { Role, RoleSearchParams, UpdateRoleRequest } from '@/types/role'
import { formatDateTime, formatOrdinal } from '@/utils'
import { type NormalizedApiError } from '@/utils/request'
import { validationRules } from '@/utils/validate'
import type { Rule } from 'ant-design-vue/es/form'

const { t } = useI18n()
const roles = ref<Role[]>([])
const loading = ref(false)
const saving = ref(false)
const recordLoading = ref(false)
const errorMessage = ref('')
const modalOpen = ref(false)
const drawerOpen = ref(false)
const editingRoleId = ref<string | null>(null)
const selectedRole = ref<Role | null>(null)
const formRef = ref<InstanceType<typeof BasicForm>>()
const page = ref(1)
const pageSize = ref(10)
const total = ref(0)
const filters = reactive({ keyword: '', status: undefined as number | undefined })
const form = ref<Record<string, unknown>>({})
let latestListRequest = 0

const requiredTextRule = (maxLength: number): Rule => ({
  validator: (_rule, value) => {
    if (typeof value !== 'string' || !value.trim()) {
      return Promise.reject(new Error(t('role.required')))
    }
    if (value.trim().length > maxLength) {
      return Promise.reject(new Error(t('role.maxLength', { count: maxLength })))
    }
    return Promise.resolve()
  },
  trigger: 'blur',
})

const formRules = computed(() => ({
  name: [requiredTextRule(100)],
  code: [
    requiredTextRule(50),
    {
      pattern: /^\s*[A-Za-z][A-Za-z0-9_]*\s*$/,
      message: t('role.invalidCode'),
      trigger: 'blur',
    },
  ],
  description: [validationRules.max(500, t('role.descriptionMaxLength'))],
  status: [validationRules.required(t('role.required'))],
}))

const formSchema = computed<FormSchema[]>(() => [
  { name: 'name', label: t('role.name'), rules: formRules.value.name },
  { name: 'code', label: t('role.code'), rules: formRules.value.code },
  { name: 'description', label: t('role.description'), rules: formRules.value.description },
  {
    name: 'status',
    label: t('role.status'),
    type: 'select',
    options: [
      { label: t('common.active'), value: 1 },
      { label: t('common.inactive'), value: 0 },
    ],
    rules: formRules.value.status,
  },
])

const columns = computed<TableColumnsType<Role>>(() => [
  {
    title: 'STT',
    key: 'index',
    width: 72,
    customRender: ({ index }) => formatOrdinal(index, page.value, pageSize.value),
  },
  { title: t('role.name'), dataIndex: 'name', key: 'name' },
  { title: t('role.code'), dataIndex: 'code', key: 'code' },
  { title: t('role.description'), dataIndex: 'description', key: 'description' },
  { title: t('role.status'), dataIndex: 'status', key: 'status' },
  { title: t('role.createdAt'), dataIndex: 'createdAt', key: 'createdAt' },
  { title: t('role.updatedAt'), dataIndex: 'updatedAt', key: 'updatedAt' },
  { title: t('common.actions'), key: 'actions', fixed: 'right', width: 220 },
])

const pagination = computed(() => ({
  current: page.value,
  pageSize: pageSize.value,
  total: total.value,
  showSizeChanger: true,
  showTotal: (count: number) => `${count}`,
}))

const apiErrorMessage = (error: unknown, fallback = t('errors.unknown')): string => {
  if (!(error instanceof Error)) return fallback
  const apiError = error as NormalizedApiError
  if (apiError.status === 403) return t('role.actionForbidden')
  return apiError.message || fallback
}

const loadRoles = async (): Promise<void> => {
  const requestId = ++latestListRequest
  loading.value = true
  try {
    const response: PageData<Role> = await getRoles({
      page: page.value,
      pageSize: pageSize.value,
      keyword: filters.keyword || undefined,
      status: filters.status,
    } satisfies RoleSearchParams)
    if (requestId !== latestListRequest) return
    roles.value = response.items
    total.value = response.total
    errorMessage.value = ''
  } catch (error) {
    if (requestId === latestListRequest) errorMessage.value = apiErrorMessage(error)
  } finally {
    if (requestId === latestListRequest) loading.value = false
  }
}

const search = (): void => {
  page.value = 1
  void loadRoles()
}

const resetFilters = (): void => {
  filters.keyword = ''
  filters.status = undefined
  page.value = 1
  void loadRoles()
}

const changePage = (nextPage: number, nextPageSize: number): void => {
  page.value = nextPage
  pageSize.value = nextPageSize
  void loadRoles()
}

const openCreate = (): void => {
  editingRoleId.value = null
  form.value = { status: 1 }
  modalOpen.value = true
}

const openEdit = async (role: Role): Promise<void> => {
  if (recordLoading.value) return
  recordLoading.value = true
  try {
    const currentRole = await getRole(role.id)
    editingRoleId.value = currentRole.id
    form.value = {
      name: currentRole.name,
      code: currentRole.code,
      description: currentRole.description ?? '',
      status: currentRole.status,
    }
    errorMessage.value = ''
    modalOpen.value = true
  } catch (error) {
    errorMessage.value = apiErrorMessage(error)
  } finally {
    recordLoading.value = false
  }
}

const openDetail = async (role: Role): Promise<void> => {
  if (recordLoading.value) return
  recordLoading.value = true
  try {
    selectedRole.value = await getRole(role.id)
    errorMessage.value = ''
    drawerOpen.value = true
  } catch (error) {
    errorMessage.value = apiErrorMessage(error)
  } finally {
    recordLoading.value = false
  }
}

const toPayload = (value: Record<string, unknown>): UpdateRoleRequest => ({
  name: String(value.name ?? '').trim(),
  code: String(value.code ?? '').trim(),
  description: typeof value.description === 'string' ? value.description.trim() : '',
  status: typeof value.status === 'number' ? value.status : 1,
})

const saveRole = async (): Promise<void> => {
  if (saving.value || !formRef.value) return
  try {
    await formRef.value.validate()
  } catch {
    return
  }

  saving.value = true
  try {
    const payload = toPayload(formRef.value.getValues())
    if (editingRoleId.value) await updateRole(editingRoleId.value, payload)
    else await createRole(payload)
    message.success(t('role.saveSuccess'))
    modalOpen.value = false
    errorMessage.value = ''
    await loadRoles()
  } catch (error) {
    const apiError = error as NormalizedApiError
    errorMessage.value = apiError.status === 409 ? t('role.codeExists') : apiErrorMessage(error)
  } finally {
    saving.value = false
  }
}

const confirmDelete = (role: Role): void => {
  Modal.confirm({
    title: t('role.deleteConfirm'),
    okText: t('common.delete'),
    cancelText: t('common.cancel'),
    okButtonProps: { danger: true },
    onOk: async () => {
      try {
        await deleteRole(role.id)
        message.success(t('role.deleteSuccess'))
        errorMessage.value = ''
        await loadRoles()
      } catch (error) {
        errorMessage.value = apiErrorMessage(error)
      }
    },
  })
}

onMounted(() => void loadRoles())
</script>

<template>
  <section>
    <a-alert
      v-if="errorMessage"
      :message="errorMessage"
      type="error"
      show-icon
      class="role-page__error"
    />
    <div class="role-page__heading">
      <h1>{{ $t('role.management') }}</h1>
      <a-button v-permission="PERMISSIONS.ROLE_CREATE" type="primary" @click="openCreate">
        {{ $t('role.add') }}
      </a-button>
    </div>
    <div class="role-page__filters">
      <a-input
        v-model:value="filters.keyword"
        :placeholder="$t('role.keywordPlaceholder')"
        allow-clear
        @press-enter="search"
      />
      <a-select
        v-model:value="filters.status"
        allow-clear
        :placeholder="$t('role.status')"
        :options="[
          { label: $t('common.active'), value: 1 },
          { label: $t('common.inactive'), value: 0 },
        ]"
      />
      <a-button type="primary" @click="search">{{ $t('common.search') }}</a-button>
      <a-button @click="resetFilters">{{ $t('common.reset') }}</a-button>
    </div>
    <BasicTable
      :columns="columns"
      :data-source="roles"
      :loading="loading"
      :pagination="pagination"
      :searchable="false"
      @reload="loadRoles"
      @page-change="changePage"
    >
      <template #bodyCell="{ column, record }">
        <a-tag v-if="column.key === 'status'" :color="record.status === 1 ? 'green' : 'default'">
          {{ record.status === 1 ? $t('common.active') : $t('common.inactive') }}
        </a-tag>
        <span v-else-if="column.key === 'createdAt'">{{ formatDateTime(record.createdAt) }}</span>
        <span v-else-if="column.key === 'updatedAt'">{{ formatDateTime(record.updatedAt) }}</span>
        <div v-else-if="column.key === 'actions'" class="role-page__actions">
          <a-button type="link" size="small" :loading="recordLoading" @click="openDetail(record)">
            {{ $t('common.detail') }}
          </a-button>
          <a-button
            v-permission="PERMISSIONS.ROLE_UPDATE"
            type="link"
            size="small"
            :loading="recordLoading"
            @click="openEdit(record)"
          >
            {{ $t('common.edit') }}
          </a-button>
          <a-button
            v-permission="PERMISSIONS.ROLE_DELETE"
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

    <BasicModal
      v-model:open="modalOpen"
      :title="editingRoleId ? $t('role.edit') : $t('role.add')"
      :confirm-loading="saving"
      @confirm="saveRole"
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

    <BasicDrawer v-model:open="drawerOpen" :title="$t('role.detail')" :destroy-on-close="false">
      <a-descriptions v-if="selectedRole" bordered :column="1">
        <a-descriptions-item :label="$t('role.name')">{{ selectedRole.name }}</a-descriptions-item>
        <a-descriptions-item :label="$t('role.code')">{{ selectedRole.code }}</a-descriptions-item>
        <a-descriptions-item :label="$t('role.description')">
          {{ selectedRole.description || '-' }}
        </a-descriptions-item>
        <a-descriptions-item :label="$t('role.status')">
          {{ selectedRole.status === 1 ? $t('common.active') : $t('common.inactive') }}
        </a-descriptions-item>
        <a-descriptions-item :label="$t('role.createdAt')">
          {{ formatDateTime(selectedRole.createdAt) }}
        </a-descriptions-item>
        <a-descriptions-item :label="$t('role.updatedAt')">
          {{ formatDateTime(selectedRole.updatedAt) }}
        </a-descriptions-item>
      </a-descriptions>
      <template #footer><span /></template>
    </BasicDrawer>
  </section>
</template>

<style scoped>
.role-page__heading {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 20px;
}

.role-page__heading h1 {
  margin: 0;
}

.role-page__error {
  margin-bottom: 16px;
}

.role-page__filters {
  display: grid;
  grid-template-columns: minmax(240px, 1fr) 180px auto auto;
  gap: 12px;
  max-width: 900px;
  margin-bottom: 20px;
}

.role-page__actions {
  display: flex;
  gap: 4px;
}

@media (max-width: 720px) {
  .role-page__filters {
    grid-template-columns: 1fr 1fr;
  }
}
</style>
