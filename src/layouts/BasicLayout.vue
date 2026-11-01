<script setup lang="ts">
import AppHeader from '@/components/layout/AppHeader.vue'
import AppSidebar from '@/components/layout/AppSidebar.vue'
import { useRoute } from 'vue-router'
import { useAuthStore } from '@/stores/auth'
import { usePermission } from '@/composables/usePermission'
import { computed } from 'vue'
import { useWarehouseStore } from '@/stores/warehouse'

const route = useRoute()
const authStore = useAuthStore()
const { can } = usePermission()
const warehouses = useWarehouseStore()
const warehousePage = computed(
  () => /^\/(stock|sales|reports)(\/|$)/.test(route.path) || route.name === 'dashboard',
)
const scopeUnavailable = computed(
  () =>
    warehousePage.value &&
    (warehouses.accessBlocked || (warehouses.loaded && !warehouses.warehouses.length)),
)
</script>

<template>
  <a-layout
    class="admin-layout"
    :class="{
      'admin-layout--products':
        route.name === 'system-user' ||
        route.name === 'system-role' ||
        route.name === 'products' ||
        route.name === 'product-groups' ||
        route.name === 'warehouses' ||
        route.name === 'sales-customers' ||
        route.name === 'stock-inventory' ||
        route.name === 'reports-inventory' ||
        route.name === 'reports-sales' ||
        route.name === 'reports-low-stock' ||
        route.name === 'stock-movements',
    }"
  >
    <AppSidebar />
    <a-layout class="admin-layout__main">
      <AppHeader />
      <a-layout-content
        class="admin-layout__content"
        :class="{
          'admin-layout__content--receivables-report': route.name === 'reports-receivables-summary',
          'admin-layout__content--payments-report': route.name === 'reports-payments',
          'admin-layout__content--products':
            route.name === 'system-user' ||
            route.name === 'system-role' ||
            route.name === 'products' ||
            route.name === 'product-groups' ||
            route.name === 'warehouses' ||
            route.name === 'sales-customers' ||
            route.name === 'stock-inventory' ||
            route.name === 'reports-inventory' ||
            route.name === 'reports-sales' ||
            route.name === 'reports-low-stock' ||
            route.name === 'stock-movements',
          'admin-layout__content--overview':
            route.name === 'dashboard' &&
            (authStore.isCatalogAdmin || can('REPORT_DASHBOARD_VIEW')),
        }"
      >
        <a-alert
          v-if="warehousePage && warehouses.recoveryNotice && !warehouses.accessBlocked"
          type="warning"
          show-icon
          :message="$t('header.warehouseAccessRevoked')"
        />
        <a-alert
          v-if="scopeUnavailable"
          :type="warehouses.accessBlocked ? 'warning' : 'info'"
          show-icon
          :message="
            $t(
              warehouses.accessBlocked
                ? 'header.warehouseScopeUnverified'
                : 'header.noAssignedWarehouses',
            )
          "
          :description="
            $t(warehouses.accessBlocked ? 'header.warehouseScopeRetry' : 'catalog.noWarehouses')
          "
        >
          <template #action>
            <a-button
              :loading="warehouses.loading"
              :disabled="warehouses.loading || !authStore.user"
              @click="authStore.user && warehouses.load(authStore.user.id).catch(() => undefined)"
              >{{ $t('header.reloadData') }}</a-button
            >
          </template>
        </a-alert>
        <RouterView v-else :key="warehousePage ? warehouses.scopeRevision : undefined" />
      </a-layout-content>
    </a-layout>
  </a-layout>
</template>

<style scoped>
.admin-layout {
  min-height: 100vh;
}
.admin-layout__main {
  container: workspace / inline-size;
}

.admin-layout__content {
  margin: 24px;
  padding: 24px;
  background: #fff;
  border-radius: 8px;
}
</style>

<style scoped>
.admin-layout > :deep(.ant-layout),
.admin-layout__content {
  min-width: 0;
}
.admin-layout__content--overview {
  background: #f4f5fa;
  padding: 24px;
}
.admin-layout__content--receivables-report {
  margin: 0;
  padding: 24px;
  background: #fff;
  border-radius: 0;
}
.admin-layout__content--payments-report {
  min-width: 0;
  margin: 0;
  padding: 20px 24px;
  background: #f5f3fa;
  border-radius: 0;
}
@media (max-width: 767px) {
  .admin-layout__content--payments-report {
    padding: 16px 12px;
  }
  .admin-layout__content--receivables-report {
    padding: 16px 12px;
  }
  .admin-layout__content--overview {
    margin: 12px;
    padding: 12px;
  }
}
</style>

<style scoped>
/* Catalog lists share a bounded workspace; very short viewports may scroll naturally. */
.admin-layout--products {
  height: 100dvh;
  min-height: 0;
}
.admin-layout--products .admin-layout__main {
  height: 100%;
  min-height: 0;
}
.admin-layout--products :deep(.app-header) {
  flex-shrink: 0;
}
.admin-layout__content--products {
  display: flex;
  flex-direction: column;
  flex: 1;
  min-height: 0;
  margin: 0;
  padding: 20px 24px;
  background: #f5f3fa;
  border-radius: 0;
}
@media (max-width: 767px), (max-height: 650px) {
  .admin-layout__content--products {
    padding: 12px;
  }
}
</style>
