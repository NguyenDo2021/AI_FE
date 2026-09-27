<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { message, Modal } from 'ant-design-vue'
import type { TableColumnsType } from 'ant-design-vue'
import { createUser, deleteUser, getUser, getUserList, updateUser } from '@/api/user/user.api'
import { PERMISSIONS } from '@/constants/permissions'
import { BasicForm, BasicModal, BasicTable, BasicDrawer, type FormSchema } from '@/components'
import type { PageData } from '@/types/api'
import type { User, UserListParams, UserPayload } from '@/types/user'
import { formatDateTime, formatOrdinal } from '@/utils'
import { validationRules } from '@/utils/validate'

const { t } = useI18n()
const users = ref<User[]>([])
const loading = ref(false)
const saving = ref(false)
const errorMessage = ref('')
const modalOpen = ref(false)
const drawerOpen = ref(false)
const editingUserId = ref<string | null>(null)
const selectedUser = ref<User | null>(null)
const formRef = ref<InstanceType<typeof BasicForm>>()
const page = ref(1)
const pageSize = ref(10)
const total = ref(0)
const filters = reactive({ keyword: '', status: undefined as number | undefined })
const form = ref<Record<string, unknown>>({})
const formRules = computed(() => ({
  username: [validationRules.required(t('user.required'))],
  fullName: [validationRules.required(t('user.required'))],
  email: [validationRules.required(t('user.required')), validationRules.email(t('user.invalidEmail'))],
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
  { title: t('user.createdAt'), dataIndex: 'createdAt', key: 'createdAt' },
  { title: t('user.status'), dataIndex: 'status', key: 'status' },
  { title: t('common.actions'), key: 'actions', fixed: 'right', width: 220 },
])

const pagination = computed(() => ({
  current: page.value,
  pageSize: pageSize.value,
  total: total.value,
  showSizeChanger: true,
  showTotal: (count: number) => `${count}`,
}))

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
  } catch {
    errorMessage.value = t('errors.unknown')
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
  } catch {
    errorMessage.value = t('errors.unknown')
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
      } catch {
        errorMessage.value = t('errors.unknown')
      }
    },
  })
}

onMounted(() => void loadUsers())
</script>

<template>
  <section>
    <a-alert v-if="errorMessage" :message="errorMessage" type="error" show-icon class="user-page__error" />
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

    <BasicDrawer v-model:open="drawerOpen" :title="$t('user.detail')" :destroy-on-close="false">
      <a-descriptions v-if="selectedUser" bordered :column="1">
        <a-descriptions-item :label="$t('user.username')">{{ selectedUser.username }}</a-descriptions-item>
        <a-descriptions-item :label="$t('user.fullName')">{{ selectedUser.fullName }}</a-descriptions-item>
        <a-descriptions-item :label="$t('user.email')">{{ selectedUser.email }}</a-descriptions-item>
        <a-descriptions-item :label="$t('user.phone')">{{ selectedUser.phone || '-' }}</a-descriptions-item>
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
</style>
