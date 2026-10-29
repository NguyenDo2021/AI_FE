<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, reactive, ref } from 'vue'
import { useMediaQuery } from '@vueuse/core'
import { useI18n } from 'vue-i18n'
import { message, Modal, type TableColumnsType } from 'ant-design-vue'
import {
  PlusOutlined,
  SearchOutlined,
  ReloadOutlined,
  FilterOutlined,
  UpOutlined,
  DownOutlined,
  EyeOutlined,
  EditOutlined,
  HomeOutlined,
  SafetyCertificateOutlined,
  DeleteOutlined,
} from '@ant-design/icons-vue'
import FittedListTable from '@/components/catalog/FittedListTable.vue'
import UserWarehousesDrawer from '@/components/catalog/UserWarehousesDrawer.vue'
import UserRolesDrawer from '@/components/catalog/UserRolesDrawer.vue'
import UserFormModal from '@/components/catalog/UserFormModal.vue'
import UserDetailDrawer from '@/components/catalog/UserDetailDrawer.vue'
import { useCatalogPermission } from '@/composables/useCatalogPermission'
import { deleteUser, getUser, getUserList } from '@/api/user/user.api'
import { PERMISSIONS } from '@/constants/permissions'
import type { User } from '@/types/user'
import { useAuthStore } from '@/stores/auth'
import { formatDateTime, formatOrdinal } from '@/utils'
import { hasPermission } from '@/utils/permission'
import type { NormalizedApiError } from '@/utils/request'

const { t } = useI18n()
const auth = useAuthStore()
const { can: canCatalog } = useCatalogPermission()
const mobile = useMediaQuery('(max-width: 767px)')
const filtersOpen = ref(false)
const filters = reactive({ keyword: '', status: undefined as number | undefined })
const applied = reactive({ keyword: '', status: undefined as number | undefined })
const users = ref<User[]>([])
const loading = ref(false)
const error = ref('')
const page = ref(1)
const pageSize = ref(10)
const total = ref(0)
const revision = ref(0)
const formOpen = ref(false)
const editingUser = ref<User | null>(null)
const warehouseOpen = ref(false)
const warehouseUser = ref<User | null>(null)
const rolesOpen = ref(false)
const rolesUser = ref<User | null>(null)
const detailOpen = ref(false)
const selectedUser = ref<User | null>(null)
const detailLoading = ref<string>()
const detailTrigger = ref<HTMLElement | null>(null)
const can = (permission: string): boolean => hasPermission(permission, auth.user?.permissions ?? [])
const canAssignRoles = computed(() => can(PERMISSIONS.USER_VIEW) && can(PERMISSIONS.USER_UPDATE))
const columns = computed<TableColumnsType<User>>(() => [
  { title: 'STT', key: 'index', width: 64 },
  { title: t('user.username'), dataIndex: 'username', key: 'username', width: 145 },
  { title: t('user.fullName'), dataIndex: 'fullName', key: 'fullName', width: 170 },
  { title: t('user.email'), dataIndex: 'email', key: 'email', width: 200 },
  { title: t('user.phone'), dataIndex: 'phone', key: 'phone', width: 145 },
  { title: t('user.status'), dataIndex: 'status', key: 'status', width: 160 },
  { title: t('user.createdAt'), dataIndex: 'createdAt', key: 'createdAt', width: 145 },
  { title: t('user.updatedAt'), dataIndex: 'updatedAt', key: 'updatedAt', width: 145 },
  { title: t('user.updatedBy'), dataIndex: 'updatedByName', key: 'updatedByName', width: 160 },
  {
    title: t('common.actions'),
    key: 'actions',
    fixed: mobile.value ? undefined : 'right',
    width: mobile.value ? 248 : 216,
  },
])
const rangeLabel = computed(() =>
  t('user.range', {
    from: users.value.length ? (page.value - 1) * pageSize.value + 1 : 0,
    to: users.value.length
      ? Math.min((page.value - 1) * pageSize.value + users.value.length, total.value)
      : 0,
    total: total.value,
  }),
)
const optionalText = (value: unknown): string =>
  value === null || value === undefined || value === '' ? '—' : String(value)
// Keep tooltip coordinates in the viewport's coordinate space when body is zoomed.
const tooltipContainer = (): HTMLElement => document.documentElement
const tooltipOverflow = { adjustX: 1, adjustY: 1, alwaysByViewport: true }
const apiErrorMessage = (cause: unknown): string => {
  if (!(cause instanceof Error)) return t('errors.unknown')
  const apiError = cause as NormalizedApiError
  return (
    apiError.message ||
    (apiError.status === 403 ? t('user.rolePermissionDenied') : t('errors.unknown'))
  )
}
let version = 0
let detailVersion = 0
const loadUsers = async (): Promise<void> => {
  const current = ++version
  loading.value = true
  error.value = ''
  try {
    const response = await getUserList({
      page: page.value,
      pageSize: pageSize.value,
      keyword: applied.keyword || undefined,
      status: applied.status,
    })
    if (current !== version) return
    users.value = response.items
    total.value = response.total
  } catch (cause) {
    if (current === version) error.value = apiErrorMessage(cause)
  } finally {
    if (current === version) loading.value = false
  }
}
const search = (): void => {
  Object.assign(applied, filters)
  page.value = 1
  revision.value++
  void loadUsers()
}
const resetFilters = (): void => {
  Object.assign(filters, { keyword: '', status: undefined })
  search()
}
const changePage = (nextPage: number, size: number): void => {
  if (![10, 20, 50, 100].includes(size)) return
  const next = size === pageSize.value ? nextPage : 1
  if (page.value === next && pageSize.value === size) return
  page.value = next
  pageSize.value = size
  void loadUsers()
}
const openForm = (user: User | null): void => {
  editingUser.value = user
  formOpen.value = true
}
const openWarehouses = (user: User): void => {
  warehouseUser.value = user
  warehouseOpen.value = true
}
const openRoles = (user: User): void => {
  rolesUser.value = user
  rolesOpen.value = true
}
const openDetail = async (user: User, event: MouseEvent): Promise<void> => {
  const current = ++detailVersion
  const trigger = event.currentTarget instanceof HTMLElement ? event.currentTarget : null
  detailLoading.value = user.id
  try {
    const response = await getUser(user.id)
    if (current !== detailVersion) return
    detailTrigger.value = trigger
    selectedUser.value = response
    detailOpen.value = true
  } catch (cause) {
    if (current === detailVersion) error.value = apiErrorMessage(cause)
  } finally {
    if (current === detailVersion) detailLoading.value = undefined
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
        error.value = ''
        await loadUsers()
      } catch (cause) {
        error.value = apiErrorMessage(cause)
      }
    },
  })
}
onMounted(() => void loadUsers())
onBeforeUnmount(() => {
  ++version
  ++detailVersion
})
</script>

<template>
  <a-config-provider
    :theme="{ token: { colorPrimary: '#7357cf', borderRadius: 8, colorText: '#252044' } }"
  >
    <section class="user-page">
      <div class="user-page__heading">
        <div>
          <h1>
            <span class="desktop-title">{{ $t('user.management') }}</span
            ><span class="mobile-title">{{ $t('common.user') }}</span>
          </h1>
          <p>{{ $t('user.description') }}</p>
        </div>
        <a-button
          v-if="can(PERMISSIONS.USER_CREATE)"
          type="primary"
          class="user-add"
          :aria-label="$t('user.add')"
          @click="openForm(null)"
          ><template #icon><PlusOutlined aria-hidden="true" /></template
          ><span class="desktop-title">{{ $t('user.add') }}</span
          ><span class="mobile-title">{{ $t('common.add') }}</span></a-button
        >
      </div>
      <div class="user-page__filter-panel">
        <a-button
          v-if="mobile"
          class="user-page__filter-toggle"
          :aria-label="$t('user.filters')"
          :aria-expanded="filtersOpen"
          aria-controls="user-filter-fields"
          @click="filtersOpen = !filtersOpen"
          ><FilterOutlined aria-hidden="true" />{{ $t('user.filters')
          }}<UpOutlined v-if="filtersOpen" class="filter-chevron" /><DownOutlined
            v-else
            class="filter-chevron"
        /></a-button>
        <form
          v-show="!mobile || filtersOpen"
          id="user-filter-fields"
          class="user-page__filters"
          @submit.prevent="search"
        >
          <div class="user-filter">
            <label for="user-keyword">{{ $t('user.keyword') }}</label
            ><a-input
              id="user-keyword"
              v-model:value="filters.keyword"
              :placeholder="$t('user.keywordPlaceholder')"
              allow-clear
              ><template #prefix><SearchOutlined aria-hidden="true" /></template
            ></a-input>
          </div>
          <div class="user-filter">
            <label for="user-status">{{ $t('user.status') }}</label
            ><a-select
              id="user-status"
              v-model:value="filters.status"
              allow-clear
              :placeholder="$t('user.allStatuses')"
              :options="[
                { label: $t('common.active'), value: 1 },
                { label: $t('common.inactive'), value: 0 },
              ]"
            />
          </div>
          <div class="user-filter-actions">
            <a-button type="primary" html-type="submit"
              ><template #icon><SearchOutlined aria-hidden="true" /></template
              >{{ $t('common.search') }}</a-button
            ><a-button @click="resetFilters"
              ><template #icon><ReloadOutlined aria-hidden="true" /></template
              >{{ $t('common.reset') }}</a-button
            >
          </div>
        </form>
      </div>
      <a-alert v-if="error" :message="error" type="error" show-icon
        ><template #action
          ><a-button size="small" :loading="loading" @click="loadUsers">{{
            $t('common.reload')
          }}</a-button></template
        ></a-alert
      >
      <FittedListTable
        class="user-list"
        :columns="columns"
        :rows="users"
        :loading="loading"
        :error="error"
        :page="page"
        :page-size="pageSize"
        :total="total"
        :reset-key="revision"
        :list-title="$t('user.listTitle')"
        total-label=""
        :range-label="rangeLabel"
        :row-height="72"
        :min-body-height="mobile ? 180 : 140"
        preserve-action-columns
        @reload="loadUsers"
        @page-change="changePage"
      >
        <template #bodyCell="{ column, record, index }">
          <span v-if="column.key === 'index'">{{ formatOrdinal(index, page, pageSize) }}</span>
          <a-tag
            v-else-if="column.key === 'status'"
            :color="record.status === 1 ? 'success' : 'default'"
            class="user-status"
            ><span class="status-dot" />{{
              record.status === 1 ? $t('common.active') : $t('common.inactive')
            }}</a-tag
          >
          <span
            v-else-if="column.key === 'createdAt' || column.key === 'updatedAt'"
            class="user-date"
            >{{ formatDateTime(record[column.key]) || '—' }}</span
          >
          <div v-else-if="column.key === 'actions'" class="user-page__actions">
            <a-tooltip
              :title="$t('common.detail')"
              :get-popup-container="tooltipContainer"
              :overlay-class-name="mobile ? 'user-page-tooltip-mobile' : undefined"
              :auto-adjust-overflow="tooltipOverflow"
              ><a-button
                class="user-action"
                :aria-label="$t('common.detail')"
                :loading="detailLoading === record.id"
                @click="openDetail(record, $event)"
                ><template #icon><EyeOutlined aria-hidden="true" /></template></a-button
            ></a-tooltip>
            <a-tooltip
              v-if="can(PERMISSIONS.USER_UPDATE)"
              :title="$t('common.edit')"
              :get-popup-container="tooltipContainer"
              :overlay-class-name="mobile ? 'user-page-tooltip-mobile' : undefined"
              :auto-adjust-overflow="tooltipOverflow"
              ><a-button
                class="user-action"
                :aria-label="$t('common.edit')"
                @click="openForm(record)"
                ><template #icon><EditOutlined aria-hidden="true" /></template></a-button
            ></a-tooltip>
            <a-tooltip
              v-if="canCatalog('USER_WAREHOUSE_VIEW')"
              :title="$t('catalog.assignedWarehouses')"
              :get-popup-container="tooltipContainer"
              :overlay-class-name="mobile ? 'user-page-tooltip-mobile' : undefined"
              :auto-adjust-overflow="tooltipOverflow"
              ><a-button
                class="user-action"
                :aria-label="$t('catalog.assignedWarehouses')"
                @click="openWarehouses(record)"
                ><template #icon><HomeOutlined aria-hidden="true" /></template></a-button
            ></a-tooltip>
            <a-tooltip
              v-if="canAssignRoles"
              :title="$t('user.assignRole')"
              :get-popup-container="tooltipContainer"
              :overlay-class-name="mobile ? 'user-page-tooltip-mobile' : undefined"
              :auto-adjust-overflow="tooltipOverflow"
              ><a-button
                class="user-action"
                :aria-label="$t('user.assignRole')"
                @click="openRoles(record)"
                ><template #icon
                  ><SafetyCertificateOutlined aria-hidden="true" /></template></a-button
            ></a-tooltip>
            <a-tooltip
              v-if="can(PERMISSIONS.USER_DELETE)"
              :title="$t('common.delete')"
              :get-popup-container="tooltipContainer"
              :overlay-class-name="mobile ? 'user-page-tooltip-mobile' : undefined"
              :auto-adjust-overflow="tooltipOverflow"
              ><a-button
                class="user-action user-action--danger"
                danger
                :aria-label="$t('common.delete')"
                @click="confirmDelete(record)"
                ><template #icon><DeleteOutlined aria-hidden="true" /></template></a-button
            ></a-tooltip>
          </div>
          <a-tooltip
            v-else
            :title="optionalText(record[column.key])"
            :get-popup-container="tooltipContainer"
            :overlay-class-name="mobile ? 'user-page-tooltip-mobile' : undefined"
            :auto-adjust-overflow="tooltipOverflow"
            :overlay-style="{ maxWidth: 'min(250px, 100%)' }"
            ><span class="user-cell">{{ optionalText(record[column.key]) }}</span></a-tooltip
          >
        </template>
      </FittedListTable>
      <UserFormModal v-model:open="formOpen" :user="editingUser" @saved="loadUsers" />
      <UserWarehousesDrawer v-model:open="warehouseOpen" :user="warehouseUser" />
      <UserRolesDrawer v-model:open="rolesOpen" :user="rolesUser" @saved="loadUsers" />
      <UserDetailDrawer
        v-model:open="detailOpen"
        :user="selectedUser"
        :return-focus="detailTrigger"
      />
    </section>
  </a-config-provider>
</template>

<style scoped>
/* A cell may be partly outside the data scroller while its tooltip is open.
   Keep the portaled mobile tooltip inside the viewport, independent of that anchor. */
:global(.user-page-tooltip-mobile) {
  inset-inline-start: 50% !important;
  translate: -50% 0;
}
.user-page {
  display: flex;
  flex: 1;
  flex-direction: column;
  gap: 18px;
  min-width: 0;
  min-height: 0;
  color: #252044;
}
.user-page__heading {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 16px;
}
.user-page__heading > div {
  min-width: 0;
}
.user-page__heading h1 {
  margin: 0;
  font-size: 26px;
  font-weight: 750;
  color: #17143d;
}
.user-page__heading p {
  margin: 3px 0 0;
  color: #77708d;
}
.user-add {
  flex-shrink: 0;
  height: 32px;
}
.mobile-title {
  display: none;
}
.user-page__filter-panel {
  border: 1px solid #eeeaf6;
  border-radius: 12px;
  background: #fff;
}
.user-page__filters {
  display: grid;
  grid-template-columns: minmax(180px, 1.8fr) minmax(160px, 1fr) auto;
  align-items: end;
  gap: 14px;
  padding: 18px;
}
.user-filter {
  display: grid;
  gap: 8px;
  min-width: 0;
}
.user-filter > label {
  font-size: 13px;
  font-weight: 600;
}
.user-filter :deep(.ant-select),
.user-filter :deep(.ant-input-affix-wrapper) {
  width: 100%;
  height: 36px;
}
.user-filter :deep(.ant-select) {
  display: block;
}
.user-filter :deep(.ant-select-selector) {
  height: 100%;
  align-items: center;
}
.user-filter :deep(.ant-select-selection-item),
.user-filter :deep(.ant-select-selection-placeholder) {
  display: flex;
  align-items: center;
  line-height: normal;
}
.user-filter :deep(.ant-input-prefix) {
  color: #928aa8;
  margin-inline-end: 10px;
}
.user-filter-actions {
  display: flex;
  gap: 10px;
}
.user-filter-actions button {
  height: 36px;
}
.user-page__filter-toggle {
  width: 100%;
  min-height: 44px;
  border-color: #a38be8;
  color: #7357cf;
}
.filter-chevron {
  position: absolute;
  inset-inline-end: 12px;
  top: 15px;
  font-size: 12px;
}
.user-cell {
  display: -webkit-box;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 2;
  overflow: hidden;
  overflow-wrap: anywhere;
  max-height: 40px;
}
.user-date {
  display: block;
  max-width: 120px;
  font-variant-numeric: tabular-nums;
}
.user-status {
  display: inline-flex;
  gap: 6px;
  align-items: center;
}
.status-dot {
  width: 6px;
  height: 6px;
  background: currentColor;
  border-radius: 50%;
  flex-shrink: 0;
}
.user-page__actions {
  display: flex;
  gap: 6px;
}
.user-action {
  display: grid;
  place-items: center;
  width: 32px;
  height: 32px;
  padding: 0;
  border: 1px solid #f1ecfc;
  border-radius: 9px;
  color: #7357cf;
  background: #f7f4ff;
  box-shadow: none;
}
.user-action--danger {
  color: #f03662;
  border-color: #fff0f3;
  background: #fff5f7;
}
.user-action:focus-visible {
  outline: 2px solid #7357cf;
  outline-offset: 2px;
}
.user-list :deep(.products-toolbar h2) {
  font-size: 17px;
  font-weight: 700;
  color: #17143d;
}
.user-list {
  grid-template-columns: minmax(0, 1fr);
}
.user-list :deep(.ant-table-thead > tr > th) {
  color: #252044;
  background: #f5f1ff;
}
@media (max-width: 1100px) and (min-width: 768px) {
  .user-page__filters {
    grid-template-columns: minmax(180px, 1fr) minmax(150px, 1fr);
  }
  .user-filter-actions {
    grid-column: 1 / -1;
    justify-content: flex-end;
  }
}
@media (max-width: 767px) {
  .user-page {
    gap: 12px;
  }
  .user-page__heading {
    gap: 8px;
  }
  .user-page__heading h1 {
    font-size: 21px;
  }
  .user-page__heading p,
  .desktop-title {
    display: none;
  }
  .mobile-title {
    display: inline;
  }
  .user-page__filters {
    grid-template-columns: minmax(0, 1fr);
    padding: 14px 12px;
    gap: 14px;
  }
  .user-filter-actions {
    flex-direction: row-reverse;
  }
  .user-filter-actions button {
    flex: 1;
    height: 44px;
  }
  .user-add {
    height: 44px;
  }
  .user-list :deep(.products-toolbar) {
    display: none;
  }
  .user-list {
    grid-template-rows: minmax(0, 1fr) auto;
  }
  .user-list :deep(.products-footer) {
    display: grid;
    grid-template-columns: minmax(0, 1fr);
  }
  .user-list :deep(.list-range) {
    min-width: 0;
    overflow-wrap: anywhere;
  }
  .user-list :deep(.list-pagination-controls) {
    min-width: 0;
    width: 100%;
    justify-content: space-between;
  }
  .user-list :deep(.list-page-size) {
    flex: 0 1 112px;
    max-width: 100%;
  }
  .user-action {
    width: 40px;
    height: 44px;
  }
  .user-page__actions {
    gap: 4px;
  }
}
</style>
