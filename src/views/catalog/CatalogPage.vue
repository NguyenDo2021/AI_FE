<script setup lang="ts">
import { computed, onBeforeUnmount, reactive, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { Modal, message, type TableColumnsType } from 'ant-design-vue'
import { BasicTable, BasicModal, BasicDrawer } from '@/components'
import {
  getCatalogList,
  getCatalogDetail,
  createCatalog,
  updateCatalog,
  getProductGroups,
  getProductGroup,
} from '@/api/catalog/catalog.api'
import type { CatalogKind, CatalogRecord, ProductGroup, Status } from '@/types/catalog'
import {
  catalogPayload,
  catalogError,
  catalogFieldErrors,
  toCatalogForm,
  unsafePrices,
  validateCatalog,
  type CatalogForm,
  type FieldErrors,
} from '@/utils/catalog'
import { formatDateTime } from '@/utils/date'
import type { NormalizedApiError } from '@/utils/request'
import { useCatalogPermission } from '@/composables/useCatalogPermission'
import { useAuthStore } from '@/stores/auth'
import { useWarehouseStore } from '@/stores/warehouse'
const props = defineProps<{ kind: CatalogKind }>()
const { t } = useI18n()
const auth = useAuthStore()
const scope = useWarehouseStore()
const { can } = useCatalogPermission()
const prefix = computed(
  () =>
    ({ warehouses: 'WAREHOUSE', 'product-groups': 'PRODUCT_GROUP', products: 'PRODUCT' })[
      props.kind
    ],
)
const canView = computed(() => can(`${prefix.value}_VIEW`))
const canCreate = computed(() => can(`${prefix.value}_CREATE`))
const canUpdate = computed(() => can(`${prefix.value}_UPDATE`))
const canReadGroups = computed(() => can('PRODUCT_GROUP_VIEW'))
const rows = ref<CatalogRecord[]>([])
const loading = ref(false)
const detailLoading = ref(false)
const saving = ref(false)
const statusBusy = ref<string>()
const groupsLoading = ref(false)
const error = ref('')
const formError = ref('')
const groupError = ref('')
const fieldErrors = ref<FieldErrors>({})
const form = ref<CatalogForm>(toCatalogForm())
const editingId = ref<string>()
const originalGroupId = ref<string>()
const originalUnsafe = ref(false)
const detailReady = ref(false)
const modalOpen = ref(false)
const drawerOpen = ref(false)
const detail = ref<CatalogRecord>()
const groups = ref<ProductGroup[]>([])
const page = ref(1)
const pageSize = ref(10)
const total = ref(0)
const filters = reactive({
  keyword: '',
  status: undefined as Status | undefined,
  groupId: undefined as string | undefined,
})
let listVersion = 0
let detailVersion = 0
let groupVersion = 0
let viewVersion = 0
const fields = computed(() => {
  const base = ['code', 'name']
  if (props.kind === 'warehouses') return [...base, 'address', 'phone', 'note', 'status']
  if (props.kind === 'product-groups') return [...base, 'description', 'status']
  return [
    ...base,
    'groupId',
    'material',
    'color',
    'dimensions',
    'lengthMeters',
    'unit',
    'referencePurchasePrice',
    'defaultSalePrice',
    'lowStockThreshold',
    'description',
    'status',
  ]
})
const tableFields = computed(() =>
  props.kind === 'warehouses'
    ? ['code', 'name', 'address', 'phone', 'status']
    : props.kind === 'product-groups'
      ? ['code', 'name', 'description', 'status']
      : [
          'code',
          'name',
          'groupId',
          'material',
          'color',
          'lengthMeters',
          'referencePurchasePrice',
          'defaultSalePrice',
          'lowStockThreshold',
          'status',
        ],
)
const columns = computed<TableColumnsType<CatalogRecord>>(() => [
  ...tableFields.value.map((key) => ({ title: t(`catalog.${key}`), dataIndex: key, key })),
  { title: t('common.actions'), key: 'actions', width: 280 },
])
const pagination = computed(() => ({
  current: page.value,
  pageSize: pageSize.value,
  total: total.value,
  showSizeChanger: true,
  pageSizeOptions: ['10', '20', '50', '100'],
}))
const statusOptions = computed(() => [
  { value: 1, label: t('common.active') },
  { value: 0, label: t('common.inactive') },
])
const groupLabel = (id: string): string => {
  const group = groups.value.find((item) => item.id === id)
  return group ? `${group.name}${group.status === 0 ? ` (${t('common.inactive')})` : ''}` : id
}
const filterGroups = computed(() =>
  groups.value.map((item) => ({ value: item.id, label: groupLabel(item.id) })),
)
const formGroups = computed(() => {
  const options = groups.value
    .filter((item) => item.status === 1 || item.id === originalGroupId.value)
    .map((item) => ({ value: item.id, label: groupLabel(item.id), disabled: item.status === 0 }))
  if (originalGroupId.value && !options.some((item) => item.value === originalGroupId.value))
    options.push({ value: originalGroupId.value, label: originalGroupId.value, disabled: true })
  return options
})
const filterOption = (input: string, option: { label?: string }): boolean =>
  (option.label ?? '').toLowerCase().includes(input.toLowerCase())
const price = (value: unknown): string => {
  if (typeof value !== 'number') return '—'
  if (!Number.isSafeInteger(value)) return t('catalog.unsafeResponse')
  return new Intl.NumberFormat('vi-VN', {
    style: 'currency',
    currency: 'VND',
    maximumFractionDigits: 0,
  }).format(value)
}
const display = (record: CatalogRecord, key: string): string => {
  const value = (record as unknown as Record<string, unknown>)[key]
  if (key === 'groupId') return groupLabel(String(value ?? ''))
  if (key === 'referencePurchasePrice' || key === 'defaultSalePrice') return price(value)
  if (key === 'status') return t(value === 1 ? 'common.active' : 'common.inactive')
  if (key === 'unit') return t('catalog.tree')
  if (key === 'createdAt' || key === 'updatedAt') return value ? formatDateTime(String(value)) : '—'
  return value === undefined || value === null || value === '' ? '—' : String(value)
}
const recover = async (cause: unknown): Promise<void> => {
  const code = (cause as NormalizedApiError | undefined)?.code
  if (code === 'WAREHOUSE_ACCESS_DENIED' && auth.user)
    await scope.load(auth.user.id).catch(() => undefined)
  if (code === 'PRODUCT_GROUP_INACTIVE') await loadGroups()
}
const loadList = async (): Promise<void> => {
  const version = ++listVersion
  const kind = props.kind
  if (!canView.value) {
    rows.value = []
    total.value = 0
    loading.value = false
    return
  }
  loading.value = true
  error.value = ''
  try {
    const result = await getCatalogList(kind, {
      page: page.value,
      pageSize: pageSize.value,
      keyword: filters.keyword.trim() || undefined,
      status: filters.status,
      ...(kind === 'products' && filters.groupId ? { groupId: filters.groupId } : {}),
    })
    if (version !== listVersion) return
    rows.value = result.items
    total.value = result.total
    if (
      result.items.length === 0 &&
      result.total > 0 &&
      page.value > Math.ceil(result.total / pageSize.value)
    ) {
      page.value = Math.ceil(result.total / pageSize.value)
      await loadList()
    }
  } catch (cause) {
    if (version !== listVersion) return
    rows.value = []
    total.value = 0
    error.value = catalogError(cause, t)
    await recover(cause)
  } finally {
    if (version === listVersion) loading.value = false
  }
}
const loadGroups = async (): Promise<void> => {
  const version = ++groupVersion
  if (props.kind !== 'products') return
  groupError.value = ''
  if (!canReadGroups.value) {
    groups.value = []
    groupError.value = t('catalog.groupUnavailable')
    return
  }
  groupsLoading.value = true
  try {
    const all: ProductGroup[] = []
    let nextPage = 1
    while (true) {
      const result = await getProductGroups({ page: nextPage, pageSize: 100 })
      if (version !== groupVersion) return
      all.push(...result.items)
      if (all.length >= result.total || result.items.length === 0) break
      nextPage++
    }
    if (originalGroupId.value && !all.some((item) => item.id === originalGroupId.value)) {
      try {
        all.push(await getProductGroup(originalGroupId.value))
      } catch {
        /* Keep the original ID even when the group is inaccessible. */
      }
    }
    if (version === groupVersion) groups.value = all
  } catch (cause) {
    if (version === groupVersion) {
      groups.value = []
      groupError.value = catalogError(cause, t)
    }
  } finally {
    if (version === groupVersion) groupsLoading.value = false
  }
}
const search = (): void => {
  page.value = 1
  void loadList()
}
const resetFilters = (): void => {
  filters.keyword = ''
  filters.status = undefined
  filters.groupId = undefined
  search()
}
const changePage = (next: number, size: number): void => {
  page.value = size !== pageSize.value ? 1 : next
  pageSize.value = size
  void loadList()
}
const openCreate = (): void => {
  if (!canCreate.value || saving.value || statusBusy.value) return
  ++detailVersion
  detailLoading.value = false
  editingId.value = undefined
  originalGroupId.value = undefined
  originalUnsafe.value = false
  detailReady.value = true
  form.value = toCatalogForm()
  fieldErrors.value = {}
  formError.value = ''
  modalOpen.value = true
  void loadGroups()
}
const fetchEdit = async (id: string): Promise<void> => {
  const version = ++detailVersion
  detailLoading.value = true
  detailReady.value = false
  formError.value = ''
  fieldErrors.value = {}
  try {
    const item = await getCatalogDetail(props.kind, id)
    if (version !== detailVersion) return
    form.value = toCatalogForm(item)
    originalUnsafe.value = unsafePrices(item)
    detailReady.value = true
    originalGroupId.value = 'groupId' in item ? item.groupId : undefined
    if (originalUnsafe.value) formError.value = t('catalog.unsafeResponse')
    await loadGroups()
  } catch (cause) {
    if (version === detailVersion) {
      formError.value = catalogError(cause, t)
      await recover(cause)
    }
  } finally {
    if (version === detailVersion) detailLoading.value = false
  }
}
const openEdit = (item: CatalogRecord): void => {
  if (!canUpdate.value || saving.value || statusBusy.value) return
  editingId.value = item.id
  detailReady.value = false
  originalGroupId.value = undefined
  form.value = toCatalogForm()
  originalUnsafe.value = false
  modalOpen.value = true
  void fetchEdit(item.id)
}
const closeEdit = (): void => {
  ++detailVersion
  detailLoading.value = false
}
const reloadForm = (): void => {
  if (!editingId.value || saving.value) return
  Modal.confirm({
    title: t('catalog.reloadConfirm'),
    onOk: () => (editingId.value ? fetchEdit(editingId.value) : undefined),
  })
}
const openDetail = async (item: CatalogRecord): Promise<void> => {
  const version = ++detailVersion
  detail.value = undefined
  drawerOpen.value = true
  detailLoading.value = true
  error.value = ''
  try {
    const result = await getCatalogDetail(props.kind, item.id)
    if (version === detailVersion) detail.value = result
  } catch (cause) {
    if (version === detailVersion) {
      error.value = catalogError(cause, t)
      await recover(cause)
    }
  } finally {
    if (version === detailVersion) detailLoading.value = false
  }
}
const refreshScope = async (): Promise<void> => {
  if (props.kind === 'warehouses' && auth.user)
    await scope.load(auth.user.id).catch(() => undefined)
}
const save = async (): Promise<void> => {
  if (
    saving.value ||
    detailLoading.value ||
    groupsLoading.value ||
    originalUnsafe.value ||
    !detailReady.value
  )
    return
  if (!(editingId.value ? canUpdate.value : canCreate.value)) {
    formError.value = t('catalog.forbidden')
    return
  }
  fieldErrors.value = validateCatalog(props.kind, form.value, t)
  if (
    props.kind === 'products' &&
    form.value.groupId !== originalGroupId.value &&
    !groups.value.some((item) => item.id === form.value.groupId && item.status === 1)
  )
    fieldErrors.value.groupId = t('catalog.groupInactive')
  if (Object.keys(fieldErrors.value).length) return
  const kind = props.kind
  const version = viewVersion
  saving.value = true
  formError.value = ''
  try {
    const payload = catalogPayload(kind, form.value)
    if (editingId.value) await updateCatalog(kind, editingId.value, payload)
    else await createCatalog(kind, payload)
    if (version !== viewVersion) return
    message.success(t('catalog.saved'))
    modalOpen.value = false
    await Promise.all([loadList(), refreshScope()])
  } catch (cause) {
    if (version !== viewVersion) return
    fieldErrors.value = catalogFieldErrors(cause)
    formError.value = catalogError(cause, t)
    await recover(cause)
  } finally {
    if (version === viewVersion) saving.value = false
  }
}
const toggleStatus = (item: CatalogRecord): void => {
  if (!canUpdate.value || statusBusy.value || saving.value) return
  const kind = props.kind
  const version = viewVersion
  Modal.confirm({
    title: t('catalog.statusConfirm'),
    onOk: async () => {
      if (version !== viewVersion || !canUpdate.value || statusBusy.value) return
      statusBusy.value = item.id
      error.value = ''
      try {
        const current = await getCatalogDetail(kind, item.id)
        if (unsafePrices(current)) throw new Error(t('catalog.unsafeResponse'))
        const values = toCatalogForm(current)
        values.status = current.status === 1 ? 0 : 1
        await updateCatalog(kind, item.id, catalogPayload(kind, values))
        if (version !== viewVersion) return
        message.success(t('catalog.saved'))
        await Promise.all([loadList(), refreshScope()])
      } catch (cause) {
        if (version === viewVersion) {
          error.value = catalogError(cause, t)
          await recover(cause)
        }
      } finally {
        if (version === viewVersion) statusBusy.value = undefined
      }
    },
  })
}
watch(
  () => props.kind,
  () => {
    ++viewVersion
    ++detailVersion
    ++groupVersion
    groupsLoading.value = false
    saving.value = false
    statusBusy.value = undefined
    modalOpen.value = false
    drawerOpen.value = false
    detailLoading.value = false
    detail.value = undefined
    rows.value = []
    groups.value = []
    originalGroupId.value = undefined
    resetFilters()
    void loadGroups()
  },
  { immediate: true },
)
watch([() => filters.status, () => filters.groupId], search)
watch(canView, (allowed) => {
  if (!allowed) {
    ++listVersion
    rows.value = []
    total.value = 0
    loading.value = false
    error.value = t('catalog.permissionChanged')
  } else void loadList()
})
watch(canReadGroups, () => {
  void loadGroups()
})
onBeforeUnmount(() => {
  ++viewVersion
  ++listVersion
  ++detailVersion
  ++groupVersion
})
</script>
<template>
  <section class="catalog-page">
    <a-alert
      v-if="!auth.adminVerified"
      type="warning"
      show-icon
      :message="$t('catalog.adminUnverified')"
    />
    <a-alert v-if="error" type="error" show-icon :message="error"
      ><template #action
        ><a-button size="small" @click="loadList">{{ $t('common.reload') }}</a-button></template
      ></a-alert
    >
    <a-alert
      v-if="kind === 'warehouses' && scope.loaded && !scope.warehouses.length"
      type="info"
      show-icon
      :message="$t('catalog.noWarehouses')"
    />
    <div class="catalog-heading">
      <h1>{{ $t(`catalog.${kind}`) }}</h1>
      <a-button
        v-if="canCreate"
        type="primary"
        :disabled="saving || !!statusBusy"
        @click="openCreate"
        >{{ $t('common.add') }}</a-button
      >
    </div>
    <div class="catalog-filters">
      <a-input
        v-model:value="filters.keyword"
        :placeholder="$t('catalog.keyword')"
        allow-clear
        @press-enter="search"
      />
      <a-select
        v-model:value="filters.status"
        :options="statusOptions"
        :placeholder="$t('catalog.allStatuses')"
        allow-clear
      />
      <a-select
        v-if="kind === 'products'"
        v-model:value="filters.groupId"
        :options="filterGroups"
        :loading="groupsLoading"
        :disabled="!canReadGroups"
        :placeholder="$t('catalog.allGroups')"
        :filter-option="filterOption"
        show-search
        allow-clear
      />
      <a-button type="primary" @click="search">{{ $t('common.search') }}</a-button
      ><a-button @click="resetFilters">{{ $t('common.reset') }}</a-button>
    </div>
    <a-alert v-if="kind === 'products' && groupError" type="warning" :message="groupError"
      ><template #action
        ><a-button size="small" @click="loadGroups">{{ $t('common.reload') }}</a-button></template
      ></a-alert
    >
    <div class="catalog-table">
      <BasicTable
        :columns="columns"
        :data-source="rows"
        :loading="loading"
        :pagination="pagination"
        :scroll="{ x: kind === 'products' ? 1800 : 1000 }"
        @page-change="changePage"
        @reload="loadList"
      >
        <template #bodyCell="{ column, record }">
          <div v-if="column.key === 'actions'" class="catalog-actions">
            <a-button type="link" size="small" @click="openDetail(record)">{{
              $t('common.detail')
            }}</a-button>
            <a-button
              v-if="canUpdate"
              type="link"
              size="small"
              :disabled="saving || !!statusBusy"
              @click="openEdit(record)"
              >{{ $t('common.edit') }}</a-button
            >
            <a-button
              v-if="canUpdate"
              type="link"
              size="small"
              :loading="statusBusy === record.id"
              :disabled="saving || (!!statusBusy && statusBusy !== record.id)"
              @click="toggleStatus(record)"
              >{{ $t(record.status === 1 ? 'catalog.deactivate' : 'catalog.activate') }}</a-button
            >
          </div>
          <a-tag
            v-else-if="column.key === 'status'"
            :color="record.status === 1 ? 'green' : 'default'"
            >{{ display(record, 'status') }}</a-tag
          >
          <span v-else>{{ display(record, String(column.key)) }}</span>
        </template>
      </BasicTable>
    </div>
    <BasicModal
      v-model:open="modalOpen"
      :title="`${$t(editingId ? 'common.edit' : 'common.add')} — ${$t(`catalog.${kind}`)}`"
      :confirm-loading="saving"
      :destroy-on-close="true"
      width="760px"
      @confirm="save"
      @cancel="closeEdit"
    >
      <a-spin :spinning="detailLoading">
        <a-alert v-if="formError" type="error" show-icon :message="formError" />
        <a-alert v-if="kind === 'products'" type="info" :message="$t('catalog.priceLimit')" />
        <a-alert v-if="kind === 'products' && groupError" type="warning" :message="groupError">
          <template #action
            ><a-button size="small" :disabled="saving" @click="loadGroups">{{
              $t('common.reload')
            }}</a-button></template
          >
        </a-alert>
        <a-alert
          v-else-if="kind === 'products' && !groupsLoading && !formGroups.length"
          type="info"
          :message="$t('catalog.noActiveGroups')"
        />
        <a-form
          layout="vertical"
          :model="form"
          :disabled="saving || detailLoading || originalUnsafe || !detailReady"
          @finish="save"
        >
          <div class="catalog-form">
            <a-form-item
              v-for="field in fields"
              :key="field"
              :label="$t(`catalog.${field}`)"
              :required="['code', 'name', 'groupId', 'status'].includes(field)"
              :validate-status="fieldErrors[field] ? 'error' : undefined"
              :help="fieldErrors[field]"
            >
              <a-select
                v-if="field === 'status'"
                v-model:value="form[field]"
                :options="statusOptions"
              />
              <a-select
                v-else-if="field === 'groupId'"
                v-model:value="form[field]"
                :options="formGroups"
                :loading="groupsLoading"
                :disabled="!canReadGroups || !!groupError || groupsLoading"
                :filter-option="filterOption"
                show-search
              />
              <a-input v-else-if="field === 'unit'" :value="$t('catalog.tree')" disabled />
              <a-textarea
                v-else-if="['note', 'description', 'address'].includes(field)"
                v-model:value="form[field]"
                :rows="3"
              />
              <a-input
                v-else
                v-model:value="form[field]"
                :inputmode="
                  ['referencePurchasePrice', 'defaultSalePrice', 'lowStockThreshold'].includes(
                    field,
                  )
                    ? 'numeric'
                    : field === 'lengthMeters'
                      ? 'decimal'
                      : 'text'
                "
              />
            </a-form-item>
          </div>
        </a-form>
        <a-button v-if="editingId" :disabled="saving" @click="reloadForm">{{
          $t('catalog.reloadForm')
        }}</a-button>
      </a-spin>
      <template #footer="{ close }"
        ><a-button
          :disabled="saving"
          @click="
            () => {
              close()
              closeEdit()
            }
          "
          >{{ $t('common.cancel') }}</a-button
        ><a-button
          type="primary"
          :loading="saving"
          :disabled="
            !detailReady ||
            detailLoading ||
            groupsLoading ||
            originalUnsafe ||
            !(editingId ? canUpdate : canCreate)
          "
          @click="save"
          >{{ $t('common.save') }}</a-button
        ></template
      >
    </BasicModal>
    <BasicDrawer
      v-model:open="drawerOpen"
      :title="$t('catalog.detail')"
      width="650px"
      @cancel="closeEdit"
    >
      <a-spin :spinning="detailLoading"
        ><a-alert v-if="error" type="error" :message="error" /><a-descriptions
          v-if="detail"
          bordered
          :column="1"
          ><a-descriptions-item
            v-for="field in [...fields, 'createdAt', 'updatedAt']"
            :key="field"
            :label="$t(`catalog.${field}`)"
            >{{ display(detail, field) }}</a-descriptions-item
          ></a-descriptions
        ></a-spin
      >
      <template #footer="{ close }"
        ><a-button @click="close">{{ $t('common.cancel') }}</a-button></template
      >
    </BasicDrawer>
  </section>
</template>
<style scoped>
.catalog-page :deep(.ant-alert) {
  margin-bottom: 16px;
}
.catalog-heading {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 20px;
}
.catalog-heading h1 {
  margin: 0;
}
.catalog-filters {
  display: flex;
  gap: 12px;
  margin-bottom: 20px;
  flex-wrap: wrap;
}
.catalog-filters :deep(.ant-input-affix-wrapper) {
  max-width: 320px;
}
.catalog-filters :deep(.ant-select) {
  min-width: 180px;
}
.catalog-actions {
  display: flex;
  flex-wrap: wrap;
}
.catalog-form {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 0 16px;
}
.catalog-table {
  overflow-x: auto;
}
@media (max-width: 650px) {
  .catalog-form {
    grid-template-columns: 1fr;
  }
}
</style>
