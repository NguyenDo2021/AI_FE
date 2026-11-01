import { computed, onBeforeUnmount, reactive, ref, shallowRef, watch } from 'vue'
import { useSalesScope } from '@/composables/useSalesScope'
import { getDashboard, getDashboardTrends, getAllWarehouseSales } from '@/api/reports/dashboard.api'
import { reportError, reportQuery, reportRange } from '@/utils/reports'
import type {
  DashboardReport,
  DashboardTrends,
  ReportFilters,
  SalesSummary,
  WarehouseFields,
} from '@/types/reports'
import type { NormalizedApiError } from '@/utils/request'

type Panel<T> = { data: T | undefined; loading: boolean; error: string }
const panel = <T>() => shallowRef<Panel<T>>({ data: undefined, loading: false, error: '' })
export const useBusinessDashboard = () => {
  const { auth, warehouses, can, scopeKey, refreshScope } = useSalesScope()
  const filters = reactive<ReportFilters>({
    ...reportRange('month'),
    warehouseId: undefined,
    page: 1,
    pageSize: 100,
  })
  const summary = panel<DashboardReport>(),
    trends = panel<DashboardTrends>(),
    sales = panel<(SalesSummary & WarehouseFields)[]>()
  const filterError = ref(''),
    accessError = ref('')
  const snapshot = ref<ReportFilters>()
  const authorized = computed(() => !!auth.user && can('REPORT_DASHBOARD_VIEW'))
  const options = computed(() => [
    { value: '', label: 'Tất cả kho' },
    ...warehouses.warehouses.map((item) => ({
      value: item.id,
      label: `${item.code} — ${item.name}${item.status === 0 ? ' (Ngừng hoạt động)' : ''}`,
    })),
  ])
  const busy = computed(() => summary.value.loading || trends.value.loading || sales.value.loading)
  let generation = 0,
    recovering = false,
    disposed = false,
    queued = false
  const controllers = new Map<string, AbortController>()
  const clear = (): void => {
    ++generation
    controllers.forEach((controller) => controller.abort())
    controllers.clear()
    summary.value = { data: undefined, loading: false, error: '' }
    trends.value = { data: undefined, loading: false, error: '' }
    sales.value = { data: undefined, loading: false, error: '' }
    snapshot.value = undefined
  }
  const recoverAccess = async (cause: unknown): Promise<void> => {
    if (recovering) return
    recovering = true
    clear()
    accessError.value = reportError(cause)
    const error = cause as NormalizedApiError
    try {
      if (error.code === 'WAREHOUSE_ACCESS_DENIED' || error.code === 'WAREHOUSE_NOT_FOUND') {
        filters.warehouseId = undefined
        await refreshScope(cause)
      } else {
        await auth.getUserInfo().catch(() => undefined)
      }
    } finally {
      recovering = false
    }
  }
  const run = async <T>(
    name: string,
    target: { value: Panel<T> },
    fetcher: (filters: ReportFilters, signal?: AbortSignal) => Promise<T>,
  ): Promise<void> => {
    if (!snapshot.value || !authorized.value || recovering || accessError.value) return
    controllers.get(name)?.abort()
    const controller = new AbortController(),
      current = generation,
      applied = { ...snapshot.value }
    controllers.set(name, controller)
    target.value = { data: undefined, loading: true, error: '' }
    try {
      const result = await fetcher(applied, controller.signal)
      if (disposed || current !== generation || controller.signal.aborted) return
      target.value = { data: result, loading: false, error: '' }
    } catch (cause) {
      if (disposed || current !== generation || controller.signal.aborted) return
      const error = cause as NormalizedApiError
      if (error.status === 403 || error.code === 'WAREHOUSE_NOT_FOUND') {
        await recoverAccess(cause)
        return
      }
      target.value = { data: undefined, loading: false, error: reportError(cause) }
    } finally {
      if (controllers.get(name) === controller) controllers.delete(name)
    }
  }
  const load = async (): Promise<void> => {
    clear()
    filterError.value = ''
    if (recovering || disposed || accessError.value) return
    if (!authorized.value) {
      accessError.value = 'Bạn chưa có quyền xem tổng quan kinh doanh.'
      return
    }
    if (!warehouses.loaded || warehouses.ownerId !== auth.user?.id) return
    if (
      filters.warehouseId &&
      !warehouses.warehouses.some((item) => item.id === filters.warehouseId)
    ) {
      accessError.value = 'Kho đã chọn không còn trong phạm vi truy cập. Hãy làm mới phạm vi kho.'
      return
    }
    const applied = { ...filters, warehouseId: filters.warehouseId || undefined }
    try {
      reportQuery('dashboard', applied)
    } catch (cause) {
      filterError.value = reportError(cause)
      return
    }
    snapshot.value = applied
    const tasks = [run('summary', summary, getDashboard)]
    if (can('REPORT_SALES_VIEW') || can('REPORT_PAYMENT_VIEW'))
      tasks.push(run('trends', trends, getDashboardTrends))
    if (can('REPORT_SALES_VIEW')) tasks.push(run('sales', sales, getAllWarehouseSales))
    await Promise.allSettled(tasks)
  }
  const schedule = (): void => {
    clear()
    if (recovering || disposed) return
    if (!queued) {
      queued = true
      queueMicrotask(() => {
        queued = false
        if (!disposed) void load()
      })
    }
  }
  const refresh = async (): Promise<void> => {
    if (recovering) return
    accessError.value = ''
    await load()
  }
  const reloadScope = async (): Promise<void> => {
    if (recovering) return
    recovering = true
    clear()
    try {
      await refreshScope()
      if (
        filters.warehouseId &&
        !warehouses.warehouses.some((item) => item.id === filters.warehouseId)
      )
        filters.warehouseId = undefined
    } finally {
      recovering = false
    }
    await refresh()
  }
  const preset = (value: 'today' | 'week' | 'month' | 'previous'): void => {
    Object.assign(filters, reportRange(value))
  }
  watch(() => [filters.warehouseId, filters.from, filters.to], schedule, { flush: 'sync' })
  watch(
    scopeKey,
    () => {
      if (!recovering) accessError.value = ''
      schedule()
    },
    { immediate: true, flush: 'sync' },
  )
  onBeforeUnmount(() => {
    disposed = true
    clear()
  })
  return {
    filters,
    snapshot,
    summary,
    trends,
    sales,
    options,
    busy,
    filterError,
    accessError,
    authorized,
    warehouses,
    can,
    preset,
    refresh,
    reloadScope,
    retrySummary: () => run('summary', summary, getDashboard),
    retryTrends: () => run('trends', trends, getDashboardTrends),
    retrySales: () => run('sales', sales, getAllWarehouseSales),
  }
}
