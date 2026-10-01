<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { message, Modal } from 'ant-design-vue'
import type { TableColumnsType } from 'ant-design-vue'
import {
  createPermission,
  deletePermission,
  getPermission,
  getPermissions,
  updatePermission,
} from '@/api/permission/permission.api'
import { PERMISSIONS } from '@/constants/permissions'
import { BasicDrawer, BasicForm, BasicModal, BasicTable, type FormSchema } from '@/components'
import type { PageData } from '@/types/api'
import type {
  Permission,
  PermissionSearchParams,
  UpdatePermissionRequest,
} from '@/types/permission'
import { formatDateTime, formatOrdinal } from '@/utils'
import { type NormalizedApiError } from '@/utils/request'
import { validationRules } from '@/utils/validate'
import type { Rule } from 'ant-design-vue/es/form'

const { t } = useI18n()
const permissions = ref<Permission[]>([])
const loading = ref(false)
const saving = ref(false)
const recordLoading = ref(false)
const errorMessage = ref('')
const modalOpen = ref(false)
const drawerOpen = ref(false)
const editingPermissionId = ref<string | null>(null)
const selectedPermission = ref<Permission | null>(null)
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
      return Promise.reject(new Error(t('permission.required')))
    }
    if (value.trim().length > maxLength) {
      return Promise.reject(new Error(t('permission.maxLength', { count: maxLength })))
    }
    return Promise.resolve()
  },
  trigger: 'blur',
})

const formRules = computed(() => ({
  name: [requiredTextRule(100)],
  code: [
    requiredTextRule(80),
    {
      pattern: /^[A-Z][A-Z0-9_]*$/,
      message: t('permission.invalidCode'),
      trigger: 'blur',
    },
  ],
  description: [validationRules.max(500, t('permission.descriptionMaxLength'))],
  status: [validationRules.required(t('permission.required'))],
}))

const formSchema = computed<FormSchema[]>(() => [
  { name: 'name', label: t('permission.name'), rules: formRules.value.name },
  { name: 'code', label: t('permission.code'), rules: formRules.value.code },
  {
    name: 'description',
    label: t('permission.description'),
    rules: formRules.value.description,
  },
  {
    name: 'status',
    label: t('permission.status'),
    type: 'select',
    options: [
      { label: t('common.active'), value: 1 },
      { label: t('common.inactive'), value: 0 },
    ],
    rules: formRules.value.status,
  },
])

const columns = computed<TableColumnsType<Permission>>(() => [
  {
    title: 'STT',
    key: 'index',
    width: 72,
    customRender: ({ index }) => formatOrdinal(index, page.value, pageSize.value),
  },
  { title: t('permission.name'), dataIndex: 'name', key: 'name' },
  { title: t('permission.code'), dataIndex: 'code', key: 'code' },
  { title: t('permission.description'), dataIndex: 'description', key: 'description' },
  { title: t('permission.status'), dataIndex: 'status', key: 'status' },
  { title: t('permission.createdAt'), dataIndex: 'createdAt', key: 'createdAt' },
  { title: t('permission.updatedAt'), dataIndex: 'updatedAt', key: 'updatedAt' },
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
  if (apiError.status === 403) return t('permission.actionForbidden')
  return apiError.message || fallback
}

const loadPermissions = async (): Promise<void> => {
  const requestId = ++latestListRequest
  loading.value = true
  try {
    const response: PageData<Permission> = await getPermissions({
      page: page.value,
      pageSize: pageSize.value,
      keyword: filters.keyword || undefined,
      status: filters.status,
    } satisfies PermissionSearchParams)
    if (requestId !== latestListRequest) return
    permissions.value = response.items
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
  void loadPermissions()
}

const resetFilters = (): void => {
  filters.keyword = ''
  filters.status = undefined
  page.value = 1
  void loadPermissions()
}

const changePage = (nextPage: number, nextPageSize: number): void => {
  page.value = nextPage
  pageSize.value = nextPageSize
  void loadPermissions()
}

const openCreate = (): void => {
  editingPermissionId.value = null
  form.value = { status: 1 }
  modalOpen.value = true
}

const openEdit = async (permission: Permission): Promise<void> => {
  if (recordLoading.value) return
  recordLoading.value = true
  try {
    const currentPermission = await getPermission(permission.id)
    editingPermissionId.value = currentPermission.id
    form.value = {
      name: currentPermission.name,
      code: currentPermission.code,
      description: currentPermission.description ?? '',
      status: currentPermission.status,
    }
    errorMessage.value = ''
    modalOpen.value = true
  } catch (error) {
    errorMessage.value = apiErrorMessage(error)
  } finally {
    recordLoading.value = false
  }
}

const openDetail = async (permission: Permission): Promise<void> => {
  if (recordLoading.value) return
  recordLoading.value = true
  try {
    selectedPermission.value = await getPermission(permission.id)
    errorMessage.value = ''
    drawerOpen.value = true
  } catch (error) {
    errorMessage.value = apiErrorMessage(error)
  } finally {
    recordLoading.value = false
  }
}

const toPayload = (value: Record<string, unknown>): UpdatePermissionRequest => ({
  name: String(value.name ?? '').trim(),
  code: String(value.code ?? '').trim(),
  description: typeof value.description === 'string' ? value.description.trim() : '',
  status: typeof value.status === 'number' ? value.status : 1,
})

const savePermission = async (): Promise<void> => {
  if (saving.value || !formRef.value) return
  try {
    await formRef.value.validate()
  } catch {
    return
  }

  saving.value = true
  try {
    const payload = toPayload(formRef.value.getValues())
    if (editingPermissionId.value) {
      await updatePermission(editingPermissionId.value, payload)
    } else {
      await createPermission(payload)
    }
    message.success(t('permission.saveSuccess'))
    modalOpen.value = false
    errorMessage.value = ''
    await loadPermissions()
  } catch (error) {
    const apiError = error as NormalizedApiError
    errorMessage.value =
      apiError.status === 409 ? t('permission.codeExists') : apiErrorMessage(error)
  } finally {
    saving.value = false
  }
}

const confirmDelete = (permission: Permission): void => {
  Modal.confirm({
    title: t('permission.deleteConfirm'),
    okText: t('common.delete'),
    cancelText: t('common.cancel'),
    okButtonProps: { danger: true },
    onOk: async () => {
      try {
        await deletePermission(permission.id)
        message.success(t('permission.deleteSuccess'))
        errorMessage.value = ''
        await loadPermissions()
      } catch (error) {
        errorMessage.value = apiErrorMessage(error)
      }
    },
  })
}

onMounted(() => void loadPermissions())
</script>

<template>
  <section>
    <a-alert
      v-if="errorMessage"
      :message="errorMessage"
      type="error"
      show-icon
      class="permission-page__error"
    />
    <div class="permission-page__heading">
      <h1>{{ $t('permission.management') }}</h1>
      <a-button v-permission="PERMISSIONS.PERMISSION_CREATE" type="primary" @click="openCreate">
        {{ $t('permission.add') }}
      </a-button>
    </div>

    <div class="permission-page__filters">
      <a-input
        v-model:value="filters.keyword"
        :placeholder="$t('permission.keywordPlaceholder')"
        allow-clear
        @press-enter="search"
      />
      <a-select
        v-model:value="filters.status"
        allow-clear
        :placeholder="$t('permission.status')"
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
      :data-source="permissions"
      :loading="loading"
      :pagination="pagination"
      :searchable="false"
      @reload="loadPermissions"
      @page-change="changePage"
    >
      <template #bodyCell="{ column, record }">
        <a-tag v-if="column.key === 'status'" :color="record.status === 1 ? 'green' : 'default'">
          {{ record.status === 1 ? $t('common.active') : $t('common.inactive') }}
        </a-tag>
        <span v-else-if="column.key === 'createdAt'">{{ formatDateTime(record.createdAt) }}</span>
        <span v-else-if="column.key === 'updatedAt'">{{ formatDateTime(record.updatedAt) }}</span>
        <div v-else-if="column.key === 'actions'" class="permission-page__actions">
          <a-button type="link" size="small" :loading="recordLoading" @click="openDetail(record)">
            {{ $t('common.detail') }}
          </a-button>
          <a-button
            v-permission="PERMISSIONS.PERMISSION_UPDATE"
            type="link"
            size="small"
            :loading="recordLoading"
            @click="openEdit(record)"
          >
            {{ $t('common.edit') }}
          </a-button>
          <a-button
            v-permission="PERMISSIONS.PERMISSION_DELETE"
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
      :title="editingPermissionId ? $t('permission.edit') : $t('permission.add')"
      :confirm-loading="saving"
      @confirm="savePermission"
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

    <BasicDrawer
      v-model:open="drawerOpen"
      :title="$t('permission.detail')"
      :destroy-on-close="false"
    >
      <a-descriptions v-if="selectedPermission" bordered :column="1">
        <a-descriptions-item :label="$t('permission.name')">{{
          selectedPermission.name
        }}</a-descriptions-item>
        <a-descriptions-item :label="$t('permission.code')">{{
          selectedPermission.code
        }}</a-descriptions-item>
        <a-descriptions-item :label="$t('permission.description')">
          {{ selectedPermission.description || '-' }}
        </a-descriptions-item>
        <a-descriptions-item :label="$t('permission.status')">
          {{ selectedPermission.status === 1 ? $t('common.active') : $t('common.inactive') }}
        </a-descriptions-item>
        <a-descriptions-item :label="$t('permission.createdAt')">
          {{ formatDateTime(selectedPermission.createdAt) }}
        </a-descriptions-item>
        <a-descriptions-item :label="$t('permission.updatedAt')">
          {{ formatDateTime(selectedPermission.updatedAt) }}
        </a-descriptions-item>
      </a-descriptions>
      <template #footer><span /></template>
    </BasicDrawer>
  </section>
</template>

<style scoped>
.permission-page__heading {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 20px;
}

.permission-page__heading h1 {
  margin: 0;
}

.permission-page__error {
  margin-bottom: 16px;
}

.permission-page__filters {
  display: grid;
  grid-template-columns: minmax(240px, 1fr) 180px auto auto;
  gap: 12px;
  max-width: 900px;
  margin-bottom: 20px;
}

.permission-page__actions {
  display: flex;
  gap: 4px;
}

@media (max-width: 720px) {
  .permission-page__filters {
    grid-template-columns: 1fr 1fr;
  }
}
</style>
