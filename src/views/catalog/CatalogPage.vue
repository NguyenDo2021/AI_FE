<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, reactive, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { Modal, message, type TableColumnsType } from 'ant-design-vue'
import { BasicTable, BasicModal, BasicDrawer } from '@/components'
import CatalogListTable from '@/components/catalog/CatalogListTable.vue'
import { onBeforeRouteLeave, onBeforeRouteUpdate } from 'vue-router'
import {
  PlusOutlined,
  FilterOutlined,
  SearchOutlined,
  ReloadOutlined,
  EyeOutlined,
  EditOutlined,
  MoreOutlined,
} from '@ant-design/icons-vue'
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
const isFittedCatalog = computed(() => props.kind === 'products' || props.kind === 'product-groups')
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
const detailError = ref('')
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
const pageSizeReady = ref(!isFittedCatalog.value)
const filtersOpen = ref(false)
const total = ref(0)
const filters = reactive({
  keyword: '',
  status: undefined as Status | undefined,
  groupId: undefined as string | undefined,
})
const appliedFilters = reactive({ ...filters })
let listVersion = 0
let detailVersion = 0
let groupVersion = 0
let viewVersion = 0
const formSections = computed(() =>
  props.kind === 'products'
    ? [
        {
          title: t('catalog.generalInfo'),
          fields: ['code', 'name', 'groupId', 'status', 'description'],
        },
        {
          title: t('catalog.specifications'),
          fields: ['material', 'color', 'dimensions', 'lengthMeters', 'unit'],
        },
        {
          title: t('catalog.pricingStock'),
          fields: ['referencePurchasePrice', 'defaultSalePrice', 'lowStockThreshold'],
        },
      ]
    : [{ title: '', fields: fields.value }],
)
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
  const queryFilters = isFittedCatalog.value ? appliedFilters : filters
  if (!pageSizeReady.value) return
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
      keyword: queryFilters.keyword.trim() || undefined,
      status: queryFilters.status,
      ...(kind === 'products' && queryFilters.groupId ? { groupId: queryFilters.groupId } : {}),
    })
    if (version !== listVersion) return
    rows.value = result.items
    total.value = result.total
    if (
      result.items.length === 0 &&
      (result.total > 0 || kind === 'product-groups') &&
      page.value > Math.max(1, Math.ceil(result.total / pageSize.value))
    ) {
      page.value = Math.max(1, Math.ceil(result.total / pageSize.value))
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
  Object.assign(appliedFilters, filters)
  page.value = 1
  void loadList()
}
let resettingFilters = false
const resetFilters = (): void => {
  resettingFilters = true
  filters.keyword = ''
  filters.status = undefined
  filters.groupId = undefined
  resettingFilters = false
  search()
}
const changePage = (next: number, size: number): void => {
  page.value = size !== pageSize.value ? 1 : next
  pageSize.value = size
  void loadList()
}
const changeCapacity = (size: number): void => {
  const next = Math.max(1, Math.min(100, Math.floor(size)))
  if (pageSizeReady.value && next === pageSize.value) return
  pageSizeReady.value = true
  pageSize.value = next
  page.value = 1
  // Clear the previous, possibly larger page while the new server page is loading.
  rows.value = []
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
  setGroupBaseline()
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
    setGroupBaseline()
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
  formError.value = ''
  fieldErrors.value = {}
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
  if (props.kind === 'product-groups' && !canView.value) return
  const version = ++detailVersion
  detail.value = undefined
  drawerOpen.value = true
  detailLoading.value = true
  error.value = ''
  detailError.value = ''
  try {
    const result = await getCatalogDetail(props.kind, item.id)
    if (version === detailVersion) detail.value = result
  } catch (cause) {
    if (version === detailVersion) {
      if (isFittedCatalog.value) detailError.value = catalogError(cause, t)
      else error.value = catalogError(cause, t)
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
        if (kind === 'product-groups' && (version !== viewVersion || !canUpdate.value)) return
        if (unsafePrices(current)) throw new Error(t('catalog.unsafeResponse'))
        const values = toCatalogForm(current)
        values.status = current.status === 1 ? 0 : 1
        await updateCatalog(kind, item.id, catalogPayload(kind, values))
        if (version !== viewVersion) return
        message.success(t('catalog.saved'))
        await Promise.all([loadList(), refreshScope()])
      } catch (cause) {
        if (version === viewVersion) {
          if (kind === 'products' || kind === 'product-groups') rows.value = []
          error.value = catalogError(cause, t)
          await recover(cause)
        }
      } finally {
        if (version === viewVersion) statusBusy.value = undefined
      }
    },
  })
}
const groupBaseline = ref('')
const setGroupBaseline = (): void => {
  if (props.kind === 'product-groups')
    groupBaseline.value = JSON.stringify(catalogPayload('product-groups', form.value))
}
const groupDirty = computed(
  () =>
    props.kind === 'product-groups' &&
    modalOpen.value &&
    detailReady.value &&
    JSON.stringify(catalogPayload('product-groups', form.value)) !== groupBaseline.value,
)
let discardPending: Promise<boolean> | undefined
const confirmGroupDiscard = (): Promise<boolean> => {
  if (!groupDirty.value) return Promise.resolve(true)
  if (!discardPending)
    discardPending = new Promise<boolean>((resolve) => {
      Modal.confirm({
        title: t('catalog.unsavedChanges'),
        content: t('catalog.discardChanges'),
        okText: t('catalog.discardAction'),
        cancelText: t('common.cancel'),
        onOk: () => resolve(true),
        onCancel: () => resolve(false),
      })
    }).finally(() => {
      discardPending = undefined
    })
  return discardPending
}
const updateEditorOpen = async (open: boolean): Promise<void> => {
  if (open) {
    modalOpen.value = true
    return
  }
  if (saving.value) return
  if (props.kind === 'product-groups' && !(await confirmGroupDiscard())) return
  modalOpen.value = false
  if (props.kind === 'product-groups') closeEdit()
}
const guardGroupNavigation = async (): Promise<boolean> => {
  if (props.kind !== 'product-groups' || !modalOpen.value) return true
  if (saving.value) return false
  return confirmGroupDiscard()
}
onBeforeRouteLeave(guardGroupNavigation)
onBeforeRouteUpdate(guardGroupNavigation)
const beforeGroupUnload = (event: BeforeUnloadEvent): void => {
  if (props.kind === 'product-groups' && modalOpen.value && (groupDirty.value || saving.value)) {
    event.preventDefault()
    event.returnValue = ''
  }
}
onMounted(() => window.addEventListener('beforeunload', beforeGroupUnload))
watch(
  () => props.kind,
  () => {
    pageSizeReady.value = !isFittedCatalog.value
    if (!isFittedCatalog.value) pageSize.value = 10
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
watch(
  [() => filters.status, () => filters.groupId],
  () => {
    if (!resettingFilters) search()
  },
  { flush: 'sync' },
)
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
  window.removeEventListener('beforeunload', beforeGroupUnload)
  ++viewVersion
  ++listVersion
  ++detailVersion
  ++groupVersion
})
</script>
<template>
  <a-config-provider
    :theme="isFittedCatalog ? { token: { colorPrimary: '#7357cf', borderRadius: 8 } } : undefined"
  >
    <section
      class="catalog-page"
      :class="{
        'products-page': isFittedCatalog,
        'product-groups-page': kind === 'product-groups',
      }"
    >
      <a-alert
        v-if="!auth.adminVerified"
        type="warning"
        show-icon
        :message="$t('catalog.adminUnverified')"
      />
      <a-alert v-if="error && !isFittedCatalog" type="error" show-icon :message="error"
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
        <div>
          <h1>{{ $t(`catalog.${kind}`) }}</h1>
          <p v-if="isFittedCatalog" class="products-description">
            {{
              $t(
                kind === 'product-groups'
                  ? 'catalog.groupsDescription'
                  : 'catalog.productsDescription',
              )
            }}
          </p>
        </div>
        <a-button
          v-if="canCreate"
          type="primary"
          :disabled="saving || !!statusBusy"
          @click="openCreate"
          ><template v-if="isFittedCatalog" #icon><PlusOutlined aria-hidden="true" /></template
          >{{
            $t(
              kind === 'product-groups'
                ? 'catalog.addGroup'
                : kind === 'products'
                  ? 'catalog.addProduct'
                  : 'common.add',
            )
          }}</a-button
        >
      </div>
      <a-button
        v-if="isFittedCatalog"
        class="products-filter-toggle"
        :aria-expanded="filtersOpen"
        aria-controls="product-filters"
        @click="filtersOpen = !filtersOpen"
        ><template #icon><FilterOutlined aria-hidden="true" /></template
        >{{ $t('catalog.filters') }}</a-button
      >
      <div
        id="product-filters"
        class="catalog-filters"
        :class="{ 'catalog-filters--open': filtersOpen }"
      >
        <a-input
          v-model:value="filters.keyword"
          :placeholder="$t(kind === 'product-groups' ? 'catalog.groupKeyword' : 'catalog.keyword')"
          :aria-label="$t(kind === 'product-groups' ? 'catalog.groupKeyword' : 'catalog.keyword')"
          allow-clear
          @press-enter="search"
        />
        <a-select
          v-if="kind === 'products'"
          v-model:value="filters.groupId"
          :options="filterGroups"
          :loading="groupsLoading"
          :disabled="!canReadGroups"
          :placeholder="$t('catalog.allGroups')"
          :aria-label="$t('catalog.groupId')"
          :filter-option="filterOption"
          show-search
          allow-clear
        />
        <a-select
          v-model:value="filters.status"
          :options="statusOptions"
          :placeholder="$t('catalog.allStatuses')"
          :aria-label="$t('catalog.status')"
          allow-clear
        />
        <a-button type="primary" @click="search"
          ><template v-if="isFittedCatalog" #icon><SearchOutlined aria-hidden="true" /></template
          >{{ $t('common.search') }}</a-button
        ><a-button @click="resetFilters"
          ><template v-if="isFittedCatalog" #icon><ReloadOutlined aria-hidden="true" /></template
          >{{ $t('common.reset') }}</a-button
        >
      </div>
      <a-alert v-if="kind === 'products' && groupError" type="warning" :message="groupError"
        ><template #action
          ><a-button size="small" @click="loadGroups">{{ $t('common.reload') }}</a-button></template
        ></a-alert
      >
      <CatalogListTable
        v-if="isFittedCatalog"
        :key="kind"
        :kind="kind === 'product-groups' ? 'product-groups' : 'products'"
        :rows="rows"
        :error="error"
        :loading="loading"
        :total="total"
        :page="page"
        :page-size="pageSize"
        :group-label="groupLabel"
        :price="price"
        @capacity="changeCapacity"
        @page-change="changePage"
        @reload="loadList"
      >
        <template #actions="{ item, compact }">
          <div class="product-actions">
            <a-tooltip v-if="!compact && canView" :title="$t('common.detail')"
              ><a-button type="text" :aria-label="$t('common.detail')" @click="openDetail(item)"
                ><template #icon><EyeOutlined aria-hidden="true" /></template></a-button
            ></a-tooltip>
            <a-tooltip v-if="!compact && canUpdate" :title="$t('common.edit')"
              ><a-button
                type="text"
                :aria-label="$t('common.edit')"
                :disabled="saving || !!statusBusy"
                @click="openEdit(item)"
                ><template #icon><EditOutlined aria-hidden="true" /></template></a-button
            ></a-tooltip>
            <a-dropdown v-if="canUpdate || (compact && canView)" :trigger="['click']">
              <a-button
                type="text"
                :aria-label="$t('common.actions')"
                :loading="statusBusy === item.id"
                ><template #icon><MoreOutlined aria-hidden="true" /></template
              ></a-button>
              <template #overlay
                ><a-menu>
                  <a-menu-item v-if="compact && canView" key="detail" @click="openDetail(item)">{{
                    $t('common.detail')
                  }}</a-menu-item>
                  <a-menu-item
                    v-if="compact && canUpdate"
                    key="edit"
                    :disabled="saving || !!statusBusy"
                    @click="openEdit(item)"
                    >{{ $t('common.edit') }}</a-menu-item
                  >
                  <a-menu-item
                    v-if="canUpdate"
                    key="status"
                    :disabled="saving || !!statusBusy"
                    @click="toggleStatus(item)"
                    >{{
                      $t(item.status === 1 ? 'catalog.deactivate' : 'catalog.activate')
                    }}</a-menu-item
                  >
                </a-menu></template
              >
            </a-dropdown>
          </div>
        </template>
      </CatalogListTable>
      <div v-else class="catalog-table">
        <BasicTable
          :columns="columns"
          :data-source="rows"
          :loading="loading"
          :pagination="pagination"
          :scroll="{ x: 1000 }"
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
      <component
        :is="isFittedCatalog ? BasicDrawer : BasicModal"
        :open="modalOpen"
        :title="`${$t(editingId ? 'common.edit' : 'common.add')} — ${$t(`catalog.${kind}`)}`"
        :confirm-loading="saving"
        :destroy-on-close="true"
        width="min(760px, 100vw)"
        @update:open="updateEditorOpen"
        @confirm="save"
        @cancel="kind !== 'product-groups' && closeEdit()"
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
            <section
              v-for="section in formSections"
              :key="section.title"
              class="catalog-form-section"
            >
              <h3 v-if="section.title">{{ section.title }}</h3>
              <div class="catalog-form">
                <a-form-item
                  v-for="field in section.fields"
                  :key="field"
                  :class="{
                    'catalog-form-item--wide': isFittedCatalog && field === 'description',
                  }"
                  :label="$t(`catalog.${field}`)"
                  :html-for="kind === 'product-groups' ? `group-${field}` : undefined"
                  :required="['code', 'name', 'groupId', 'status'].includes(field)"
                  :validate-status="fieldErrors[field] ? 'error' : undefined"
                  :help="fieldErrors[field]"
                >
                  <a-select
                    v-if="field === 'status'"
                    :id="kind === 'product-groups' ? `group-${field}` : undefined"
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
                    :id="kind === 'product-groups' ? `group-${field}` : undefined"
                    v-model:value="form[field]"
                    :rows="kind === 'product-groups' ? 5 : 3"
                    :show-count="kind === 'product-groups'"
                    :maxlength="kind === 'product-groups' ? 2000 : undefined"
                  />
                  <a-input
                    v-else
                    :id="kind === 'product-groups' ? `group-${field}` : undefined"
                    v-model:value="form[field]"
                    :maxlength="
                      kind === 'product-groups'
                        ? field === 'code'
                          ? 80
                          : field === 'name'
                            ? 160
                            : undefined
                        : undefined
                    "
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
            </section>
          </a-form>
          <a-button v-if="editingId" :disabled="saving" @click="reloadForm">{{
            $t('catalog.reloadForm')
          }}</a-button>
        </a-spin>
        <template #footer="{ close }"
          ><a-button :disabled="saving" @click="close">{{ $t('common.cancel') }}</a-button
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
      </component>
      <BasicDrawer
        v-model:open="drawerOpen"
        :title="$t('catalog.detail')"
        :class="{ 'group-detail': kind === 'product-groups' }"
        width="min(650px, 100vw)"
        @cancel="closeEdit"
      >
        <a-spin :spinning="detailLoading"
          ><a-alert
            v-if="isFittedCatalog ? detailError : error"
            type="error"
            :message="isFittedCatalog ? detailError : error"
          /><a-descriptions v-if="detail" bordered :column="1"
            ><a-descriptions-item
              v-for="field in [
                ...fields,
                ...['createdAt', 'updatedAt'].filter(
                  (key) =>
                    kind !== 'product-groups' ||
                    (detail as unknown as Record<string, unknown>)[key],
                ),
              ]"
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
  </a-config-provider>
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

<style scoped>
.products-page {
  display: flex;
  flex: 1;
  flex-direction: column;
  min-height: 0;
  min-width: 0;
  gap: 12px;
}
.products-page > :deep(.ant-alert) {
  flex-shrink: 0;
  margin: 0;
}
.products-page .catalog-heading {
  flex-shrink: 0;
  gap: 12px;
  margin: 0;
}
.products-page h1 {
  color: #302640;
  font-size: 24px;
  line-height: 32px;
  font-weight: 650;
}
.products-description {
  margin: 4px 0 0;
  color: #797184;
  font-size: 14px;
  line-height: 20px;
}
.products-page .catalog-filters {
  display: grid;
  grid-template-columns: minmax(160px, 1fr) minmax(150px, 0.7fr) minmax(145px, 0.6fr) auto auto;
  align-items: center;
  flex-shrink: 0;
  gap: 10px;
  margin: 0;
  padding: 14px 16px;
  border: 1px solid #e9e4f1;
  border-radius: 12px;
  background: white;
}
.products-page .catalog-filters :deep(.ant-input-affix-wrapper) {
  max-width: none;
}
.products-page .catalog-filters :deep(.ant-select) {
  min-width: 0;
}
.products-filter-toggle {
  display: none;
}
.product-actions {
  display: flex;
  align-items: center;
  justify-content: center;
  white-space: nowrap;
}
.product-actions :deep(.ant-btn) {
  width: 28px;
  min-width: 28px;
  padding: 0;
}
.catalog-form-section h3 {
  margin: 20px 0 16px;
  padding-bottom: 10px;
  border-bottom: 1px solid #ece7f3;
  color: #5a4578;
  font-size: 15px;
}
@container workspace (max-width: 900px) {
  .products-page .catalog-filters {
    grid-template-columns: minmax(140px, 1fr) minmax(120px, 1fr) minmax(120px, 1fr) auto auto;
    padding: 10px;
    gap: 8px;
  }
}
@container workspace (max-width: 740px) {
  .products-filter-toggle {
    display: inline-flex;
    align-self: flex-start;
  }
  .products-page .catalog-filters {
    display: none;
  }
  .products-page .catalog-filters--open {
    display: grid;
    grid-template-columns: 1fr 1fr;
  }
  .products-page .catalog-filters--open > :first-child {
    grid-column: 1 / -1;
  }
  .products-description {
    max-width: 380px;
  }
}
@media (max-width: 480px) {
  .products-page {
    gap: 10px;
  }
  .products-page h1 {
    font-size: 22px;
  }
  .products-description {
    display: none;
  }
}
@media (max-height: 650px) {
  .products-page {
    gap: 8px;
  }
  .products-description {
    display: none;
  }
  .products-page .catalog-filters {
    padding-block: 8px;
  }
}
</style>

<style scoped>
.catalog-form-item--wide {
  grid-column: 1 / -1;
}
</style>

<style scoped>
.products-page.product-groups-page .catalog-filters {
  grid-template-columns: minmax(200px, 1fr) minmax(180px, 0.5fr) auto auto;
}
.group-detail :deep(.ant-descriptions-item-content) {
  white-space: pre-wrap;
  overflow-wrap: anywhere;
  word-break: break-word;
}
@container workspace (max-width: 740px) {
  .products-page.product-groups-page .catalog-filters--open {
    grid-template-columns: 1fr 1fr;
  }
}
</style>

<style scoped>
@media (max-width: 600px) {
  .product-groups-page .catalog-heading {
    flex-wrap: wrap;
    align-items: flex-start;
    gap: 8px;
  }
  .product-groups-page .catalog-heading > div {
    flex-basis: 100%;
  }
}
</style>
