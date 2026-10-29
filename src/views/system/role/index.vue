<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, reactive, ref } from 'vue'
import { useMediaQuery } from '@vueuse/core'
import { useI18n } from 'vue-i18n'
import { message, Modal, type TableColumnsType } from 'ant-design-vue'
import {
  PlusOutlined,
  SearchOutlined,
  FilterOutlined,
  UpOutlined,
  DownOutlined,
  EyeOutlined,
  EditOutlined,
  SafetyCertificateOutlined,
  DeleteOutlined,
} from '@ant-design/icons-vue'
import { deleteRole, getRole, getRoles } from '@/api/role/role.api'
import FittedListTable from '@/components/catalog/FittedListTable.vue'
import RoleFormModal from '@/components/system/role/RoleFormModal.vue'
import RoleDetailDrawer from '@/components/system/role/RoleDetailDrawer.vue'
import RolePermissionsModal from '@/components/system/role/RolePermissionsModal.vue'
import { PERMISSIONS } from '@/constants/permissions'
import type { Role } from '@/types/role'
import { formatDateTime, formatOrdinal } from '@/utils'
import { hasPermission } from '@/utils/permission'
import { useAuthStore } from '@/stores/auth'
import type { NormalizedApiError } from '@/utils/request'

const { t } = useI18n()
const auth = useAuthStore()
const mobile = useMediaQuery('(max-width: 767px)')
const filtersOpen = ref(false)
const filters = reactive({ keyword: '', status: undefined as number | undefined })
const applied = reactive({ keyword: '', status: undefined as number | undefined })
const roles = ref<Role[]>([])
const loading = ref(false)
const recordLoading = ref(false)
const loadingRecordId = ref<string>()
const error = ref('')
const modalOpen = ref(false)
const drawerOpen = ref(false)
const permissionOpen = ref(false)
const activeTooltip = ref('')
const overlayOpen = computed(() => modalOpen.value || drawerOpen.value || permissionOpen.value)
const changeTooltip = (key: string, open: boolean): void => {
  if (open && !overlayOpen.value) activeTooltip.value = key
  else if (activeTooltip.value === key) activeTooltip.value = ''
}
const editingRole = ref<Role | null>(null)
const selectedRole = ref<Role | null>(null)
const permissionRole = ref<Role | null>(null)
const detailTrigger = ref<HTMLElement | null>(null)
const page = ref(1)
const pageSize = ref(10)
const total = ref(0)
const revision = ref(0)
let listVersion = 0
let recordVersion = 0
const can = (permission: string): boolean => hasPermission(permission, auth.user?.permissions ?? [])
const columns = computed<TableColumnsType<Role>>(() => [
  { title: 'STT', key: 'index', width: 64 },
  { title: t('role.name'), dataIndex: 'name', key: 'name', width: 190 },
  { title: t('role.code'), dataIndex: 'code', key: 'code', width: 165 },
  { title: t('role.description'), dataIndex: 'description', key: 'description', width: 230 },
  { title: t('role.status'), dataIndex: 'status', key: 'status', width: 160 },
  { title: t('role.createdAt'), dataIndex: 'createdAt', key: 'createdAt', width: 175 },
  { title: t('role.updatedAt'), dataIndex: 'updatedAt', key: 'updatedAt', width: 175 },
  {
    title: t('common.actions'),
    key: 'actions',
    fixed: mobile.value ? undefined : 'right',
    width: mobile.value ? 210 : 180,
  },
])
const rangeLabel = computed(() =>
  t('role.range', {
    from: roles.value.length ? (page.value - 1) * pageSize.value + 1 : 0,
    to: roles.value.length
      ? Math.min((page.value - 1) * pageSize.value + roles.value.length, total.value)
      : 0,
    total: total.value,
  }),
)
const optionalText = (value: unknown): string =>
  value == null || value === '' ? '—' : String(value)
const tooltipContainer = (): HTMLElement => document.documentElement
const tooltipOverflow = { adjustX: 1, adjustY: 1, alwaysByViewport: true }
const apiErrorMessage = (cause: unknown): string => {
  if (!(cause instanceof Error)) return t('errors.unknown')
  return (cause as NormalizedApiError).status === 403
    ? t('role.actionForbidden')
    : cause.message || t('errors.unknown')
}
const loadRoles = async (): Promise<void> => {
  const current = ++listVersion
  loading.value = true
  try {
    const response = await getRoles({
      page: page.value,
      pageSize: pageSize.value,
      keyword: applied.keyword || undefined,
      status: applied.status,
    })
    if (current !== listVersion) return
    roles.value = response.items
    total.value = response.total
    error.value = ''
  } catch (cause) {
    if (current === listVersion) error.value = apiErrorMessage(cause)
  } finally {
    if (current === listVersion) loading.value = false
  }
}
const search = (): void => {
  Object.assign(applied, filters)
  page.value = 1
  revision.value++
  void loadRoles()
}
const resetFilters = (): void => {
  Object.assign(filters, { keyword: '', status: undefined })
  search()
}
const changePage = (nextPage: number, size: number): void => {
  if (![10, 20, 50, 100].includes(size)) return
  const next = size === pageSize.value ? nextPage : 1
  if (next === page.value && size === pageSize.value) return
  page.value = next
  pageSize.value = size
  void loadRoles()
}
const openCreate = (): void => {
  if (recordLoading.value) return
  activeTooltip.value = ''
  editingRole.value = null
  modalOpen.value = true
}
const openRecord = async (
  role: Role,
  mode: 'edit' | 'detail',
  event: MouseEvent,
): Promise<void> => {
  if (recordLoading.value) return
  const current = ++recordVersion
  const trigger = event.currentTarget instanceof HTMLElement ? event.currentTarget : null
  recordLoading.value = true
  loadingRecordId.value = role.id
  try {
    const response = await getRole(role.id)
    if (current !== recordVersion) return
    activeTooltip.value = ''
    if (mode === 'edit') {
      editingRole.value = response
      modalOpen.value = true
    } else {
      selectedRole.value = response
      detailTrigger.value = trigger
      drawerOpen.value = true
    }
    error.value = ''
  } catch (cause) {
    if (current === recordVersion) error.value = apiErrorMessage(cause)
  } finally {
    if (current === recordVersion) {
      recordLoading.value = false
      loadingRecordId.value = undefined
    }
  }
}
const openPermissions = (role: Role): void => {
  if (!can(PERMISSIONS.ROLE_UPDATE)) return
  activeTooltip.value = ''
  permissionRole.value = role
  permissionOpen.value = true
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
        error.value = ''
        await loadRoles()
      } catch (cause) {
        error.value = apiErrorMessage(cause)
      }
    },
  })
}
onMounted(() => void loadRoles())
onBeforeUnmount(() => {
  ++listVersion
  ++recordVersion
})
</script>

<template>
  <a-config-provider
    :theme="{ token: { colorPrimary: '#7357cf', borderRadius: 8, colorText: '#252044' } }"
  >
    <section class="role-page" @scroll.capture="activeTooltip = ''">
      <div class="role-page__heading">
        <div>
          <h1>{{ $t('role.management') }}</h1>
          <p>{{ $t('role.managementDescription') }}</p>
        </div>
        <a-button
          v-if="can(PERMISSIONS.ROLE_CREATE)"
          type="primary"
          :disabled="recordLoading"
          @click="openCreate"
          ><template #icon><PlusOutlined aria-hidden="true" /></template
          >{{ $t('role.add') }}</a-button
        >
      </div>
      <div class="role-page__filter-panel">
        <a-button
          v-if="mobile"
          class="role-page__filter-toggle"
          :aria-expanded="filtersOpen"
          aria-controls="role-filter-fields"
          @click="filtersOpen = !filtersOpen"
          ><FilterOutlined aria-hidden="true" />{{ $t('role.filters')
          }}<UpOutlined v-if="filtersOpen" class="filter-chevron" aria-hidden="true" /><DownOutlined
            v-else
            class="filter-chevron"
            aria-hidden="true"
        /></a-button>
        <form
          v-show="!mobile || filtersOpen"
          id="role-filter-fields"
          class="role-page__filters"
          @submit.prevent="search"
        >
          <div class="role-filter">
            <label for="role-keyword">{{ $t('role.keyword') }}</label
            ><a-input
              id="role-keyword"
              v-model:value="filters.keyword"
              :placeholder="$t('role.keywordPlaceholder')"
              allow-clear
              ><template #prefix><SearchOutlined aria-hidden="true" /></template
            ></a-input>
          </div>
          <div class="role-filter">
            <label for="role-status">{{ $t('role.status') }}</label
            ><a-select
              id="role-status"
              v-model:value="filters.status"
              allow-clear
              :placeholder="$t('role.allStatuses')"
              :options="[
                { label: $t('common.active'), value: 1 },
                { label: $t('common.inactive'), value: 0 },
              ]"
            />
          </div>
          <div class="role-filter-actions">
            <a-button type="primary" html-type="submit">{{ $t('common.search') }}</a-button
            ><a-button @click="resetFilters">{{ $t('common.reset') }}</a-button>
          </div>
        </form>
      </div>
      <a-alert v-if="error" :message="error" type="error" show-icon />
      <FittedListTable
        :columns="columns"
        :rows="roles"
        :loading="loading"
        :error="error"
        :page="page"
        :page-size="pageSize"
        :total="total"
        :reset-key="revision"
        :list-title="$t('role.listTitle')"
        total-label=""
        :range-label="rangeLabel"
        :row-height="58"
        :min-body-height="mobile ? 180 : 140"
        preserve-action-columns
        @reload="loadRoles"
        @page-change="changePage"
      >
        <template #bodyCell="{ column, record, index }">
          <span v-if="column.key === 'index'">{{ formatOrdinal(index, page, pageSize) }}</span>
          <template v-else-if="column.key === 'status'"
            ><a-tag
              v-if="record.status != null"
              :color="record.status === 1 ? 'success' : 'default'"
              >{{ $t(record.status === 1 ? 'common.active' : 'common.inactive') }}</a-tag
            ><span v-else>—</span></template
          >
          <span
            v-else-if="column.key === 'createdAt' || column.key === 'updatedAt'"
            class="role-date"
            >{{ formatDateTime(record[column.key]) || '—' }}</span
          >
          <div v-else-if="column.key === 'actions'" class="role-page__actions">
            <a-tooltip
              :open="!overlayOpen && activeTooltip === `detail-${record.id}`"
              :title="$t('common.detail')"
              :get-popup-container="tooltipContainer"
              :auto-adjust-overflow="tooltipOverflow"
              :overlay-class-name="
                mobile ? 'role-page-tooltip role-tooltip-mobile' : 'role-page-tooltip'
              "
              @open-change="changeTooltip(`detail-${record.id}`, $event)"
              ><a-button
                class="role-action"
                :aria-label="$t('common.detail')"
                :loading="recordLoading && loadingRecordId === record.id"
                :disabled="recordLoading"
                @click="openRecord(record, 'detail', $event)"
                ><template #icon><EyeOutlined aria-hidden="true" /></template></a-button
            ></a-tooltip>
            <a-tooltip
              v-if="can(PERMISSIONS.ROLE_UPDATE)"
              :open="!overlayOpen && activeTooltip === `edit-${record.id}`"
              :title="$t('common.edit')"
              :get-popup-container="tooltipContainer"
              :auto-adjust-overflow="tooltipOverflow"
              :overlay-class-name="
                mobile ? 'role-page-tooltip role-tooltip-mobile' : 'role-page-tooltip'
              "
              @open-change="changeTooltip(`edit-${record.id}`, $event)"
              ><a-button
                class="role-action"
                :aria-label="$t('common.edit')"
                :loading="recordLoading && loadingRecordId === record.id"
                :disabled="recordLoading"
                @click="openRecord(record, 'edit', $event)"
                ><template #icon><EditOutlined aria-hidden="true" /></template></a-button
            ></a-tooltip>
            <a-tooltip
              v-if="can(PERMISSIONS.ROLE_UPDATE)"
              :open="!overlayOpen && activeTooltip === `permissions-${record.id}`"
              :title="$t('role.assignPermission')"
              :get-popup-container="tooltipContainer"
              :auto-adjust-overflow="tooltipOverflow"
              :overlay-class-name="
                mobile ? 'role-page-tooltip role-tooltip-mobile' : 'role-page-tooltip'
              "
              @open-change="changeTooltip(`permissions-${record.id}`, $event)"
              ><a-button
                class="role-action"
                :aria-label="$t('role.assignPermission')"
                @click="openPermissions(record)"
                ><template #icon
                  ><SafetyCertificateOutlined aria-hidden="true" /></template></a-button
            ></a-tooltip>
            <a-tooltip
              v-if="can(PERMISSIONS.ROLE_DELETE)"
              :open="!overlayOpen && activeTooltip === `delete-${record.id}`"
              :title="$t('common.delete')"
              :get-popup-container="tooltipContainer"
              :auto-adjust-overflow="tooltipOverflow"
              :overlay-class-name="
                mobile ? 'role-page-tooltip role-tooltip-mobile' : 'role-page-tooltip'
              "
              @open-change="changeTooltip(`delete-${record.id}`, $event)"
              ><a-button
                class="role-action role-action--danger"
                danger
                :aria-label="$t('common.delete')"
                @click="confirmDelete(record)"
                ><template #icon><DeleteOutlined aria-hidden="true" /></template></a-button
            ></a-tooltip>
          </div>
          <a-tooltip
            v-else
            :open="!overlayOpen && activeTooltip === `${column.key}-${record.id}`"
            :title="optionalText(record[column.key])"
            :get-popup-container="tooltipContainer"
            :auto-adjust-overflow="tooltipOverflow"
            :overlay-class-name="
              mobile ? 'role-page-tooltip role-tooltip-mobile' : 'role-page-tooltip'
            "
            :overlay-style="{ maxWidth: 'min(250px, 100%)' }"
            @open-change="changeTooltip(`${column.key}-${record.id}`, $event)"
            ><span class="role-cell">{{ optionalText(record[column.key]) }}</span></a-tooltip
          >
        </template>
      </FittedListTable>
      <RoleFormModal v-model:open="modalOpen" :role="editingRole" @saved="loadRoles" />
      <RolePermissionsModal
        v-model:open="permissionOpen"
        :role="permissionRole"
        @saved="loadRoles"
      />
      <RoleDetailDrawer
        v-model:open="drawerOpen"
        :role="selectedRole"
        :return-focus="detailTrigger"
      />
    </section>
  </a-config-provider>
</template>

<style scoped>
:global(.role-page-tooltip) {
  max-width: min(250px, calc(100vw - 24px));
  pointer-events: none;
}
:global(.role-page-tooltip .ant-tooltip-inner) {
  max-height: min(240px, 50dvh);
  overflow: hidden;
  overflow-wrap: anywhere;
}
:global(.role-tooltip-mobile) {
  inset-inline-start: 50% !important;
  translate: -50% 0;
}
.role-page {
  display: flex;
  flex: 1;
  flex-direction: column;
  gap: 16px;
  min-width: 0;
  min-height: 0;
  color: #252044;
}
.role-page__heading {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 14px;
}
.role-page__heading > div {
  min-width: 0;
}
.role-page__heading h1 {
  margin: 0;
  font-size: 26px;
  font-weight: 750;
  color: #17143d;
}
.role-page__heading p {
  margin: 3px 0 0;
  color: #77708d;
}
.role-page__heading > button {
  flex-shrink: 0;
}
.role-page__filter-panel {
  border: 1px solid #eeeaf6;
  border-radius: 12px;
  background: #fff;
}
.role-page__filters {
  display: grid;
  grid-template-columns: minmax(0, 1.8fr) minmax(0, 1fr) auto;
  align-items: end;
  gap: 14px;
  padding: 18px;
}
.role-filter {
  display: grid;
  gap: 8px;
  min-width: 0;
}
.role-filter label {
  font-size: 13px;
  font-weight: 600;
}
.role-filter :deep(.ant-select),
.role-filter :deep(.ant-input-affix-wrapper) {
  width: 100%;
  height: 36px;
}
.role-filter :deep(.ant-select) {
  display: block;
}
.role-filter :deep(.ant-select-selector) {
  height: 100%;
  align-items: center;
}
.role-filter :deep(.ant-select-selection-item),
.role-filter :deep(.ant-select-selection-placeholder) {
  display: flex;
  align-items: center;
  line-height: normal;
}
.role-filter :deep(.ant-input-prefix) {
  color: #928aa8;
  margin-inline-end: 8px;
}
.role-filter-actions {
  display: flex;
  gap: 10px;
}
.role-filter-actions button {
  height: 36px;
}
.role-page__filter-toggle {
  width: 100%;
  min-height: 44px;
  text-align: left;
  color: #7357cf;
}
.filter-chevron {
  position: absolute;
  inset-inline-end: 12px;
  top: 15px;
  font-size: 12px;
}
.role-cell {
  display: -webkit-box;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 2;
  overflow: hidden;
  overflow-wrap: anywhere;
  max-height: 40px;
}
.role-date {
  font-variant-numeric: tabular-nums;
}
.role-page__actions {
  display: flex;
  gap: 6px;
}
.role-action {
  display: grid;
  place-items: center;
  flex: 0 0 32px;
  width: 32px;
  height: 32px;
  padding: 0;
  border: 1px solid #f1ecfc;
  border-radius: 9px;
  color: #7357cf;
  background: #f7f4ff;
  box-shadow: none;
}
.role-action--danger {
  color: #df4b5b;
  background: #fff2f4;
  border-color: #ffe5e9;
}
.role-action:focus-visible {
  outline: 2px solid #7357cf;
  outline-offset: 2px;
}
@media (max-width: 767px) {
  .role-page {
    gap: 12px;
  }
  .role-page__heading {
    flex-wrap: wrap;
    gap: 10px;
  }
  .role-page__heading h1 {
    font-size: 20px;
  }
  .role-page__heading p {
    font-size: 13px;
  }
  .role-page__heading > button {
    height: 40px;
  }
  .role-page__filters {
    grid-template-columns: minmax(0, 1fr);
    padding: 14px 12px;
  }
  .role-filter-actions button {
    flex: 1;
    height: 44px;
  }
  .role-action {
    width: 40px;
    height: 40px;
    flex-basis: 40px;
  }
}
</style>
