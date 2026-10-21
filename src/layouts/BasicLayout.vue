<script setup lang="ts">
import AppHeader from '@/components/layout/AppHeader.vue'
import BrandLogo from '@/components/layout/BrandLogo.vue'
import { computed, h, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import {
  AccountBookOutlined,
  AppstoreOutlined,
  BarChartOutlined,
  BuildOutlined,
  CreditCardOutlined,
  DashboardOutlined,
  DatabaseOutlined,
  HistoryOutlined,
  InboxOutlined,
  LockOutlined,
  ScanOutlined,
  SettingOutlined,
  ShoppingCartOutlined,
  TeamOutlined,
  UserOutlined,
} from '@ant-design/icons-vue'
import type { MenuItem } from '@/constants/menu'
import { MENU_ITEMS } from '@/constants/menu'
import { useAppStore } from '@/stores/app'
import { useAuthStore } from '@/stores/auth'
import { usePermission } from '@/composables/usePermission'

const appTitle = import.meta.env.VITE_APP_TITLE
const smallScreen = ref(false)
const route = useRoute()
const router = useRouter()
const appStore = useAppStore()
const authStore = useAuthStore()
const { can } = usePermission()

const visibleMenus = computed(() => {
  const filter = (items: MenuItem[]): MenuItem[] =>
    items
      .map((item) => ({
        ...item,
        children: item.children ? filter(item.children) : undefined,
      }))
      .filter((item) => {
        if (
          item.permission === 'DASHBOARD_VIEW' &&
          (authStore.isCatalogAdmin || can('REPORT_DASHBOARD_VIEW'))
        )
          return false
        if (
          item.permission &&
          !(
            item.catalogAccess &&
            (authStore.isCatalogAdmin || (item.createPermission && can(item.createPermission)))
          ) &&
          !can(item.permission)
        )
          return false
        return !item.children || item.children.length > 0
      })
  return filter(MENU_ITEMS)
})

const menuIcon = (key: string): ReturnType<typeof h> => {
  const icons: Record<string, ReturnType<typeof h>> = {
    '/dashboard': h(DashboardOutlined),
    '/reports': h(BarChartOutlined),
    '/reports/inventory': h(DatabaseOutlined),
    '/reports/sales': h(BarChartOutlined),
    '/reports/payments': h(CreditCardOutlined),
    '/reports/receivables-summary': h(AccountBookOutlined),
    '/reports/low-stock': h(HistoryOutlined),
    '/sales/receivables': h(AccountBookOutlined),
    '/sales/payments': h(CreditCardOutlined),
    '/sales/customers': h(TeamOutlined),
    '/sales/orders': h(ShoppingCartOutlined),
    '/stock/receipts': h(InboxOutlined),
    '/stock/stocktakes': h(ScanOutlined),
    '/stock/inventory': h(DatabaseOutlined),
    '/stock/movements': h(HistoryOutlined),
    '/catalog/warehouses': h(BuildOutlined),
    '/catalog/product-groups': h(AppstoreOutlined),
    '/catalog/products': h(AppstoreOutlined),
    '/system': h(SettingOutlined),
    '/system/user': h(TeamOutlined),
    '/system/permission': h(LockOutlined),
    '/system/role': h(UserOutlined),
  }
  return icons[key] ?? h(SettingOutlined)
}
</script>

<template>
  <a-layout class="admin-layout">
    <a-layout-sider
      id="app-sidebar"
      v-model:collapsed="appStore.sidebarCollapsed"
      :trigger="null"
      collapsible
      class="admin-layout__sider"
      breakpoint="md"
      :collapsed-width="smallScreen ? 0 : 80"
      @breakpoint="
        (broken: boolean) => {
          smallScreen = broken
          appStore.sidebarCollapsed = broken
        }
      "
    >
      <div class="admin-layout__brand">
        <a-button
          v-if="smallScreen"
          type="text"
          class="mobile-close"
          aria-label="Đóng menu"
          @click="appStore.toggleSidebar"
          >×</a-button
        >
        <BrandLogo variant="inverse" :decorative="!appStore.sidebarCollapsed" />
        <span
          v-if="!appStore.sidebarCollapsed"
          class="admin-layout__brand-name"
          :title="appTitle"
          >{{ appTitle }}</span
        >
      </div>
      <a-menu
        mode="inline"
        theme="dark"
        :selected-keys="[route.path]"
        :open-keys="appStore.sidebarCollapsed ? [] : ['/system', '/reports']"
        @click="({ key }: { key: string }) => router.push(String(key))"
      >
        <template v-for="item in visibleMenus" :key="item.key">
          <a-sub-menu v-if="item.children?.length" :key="item.key">
            <template #icon><component :is="menuIcon(item.key)" /></template>
            <template #title>{{ $t(item.title) }}</template>
            <a-menu-item v-for="child in item.children" :key="child.key">
              <template #icon><component :is="menuIcon(child.key)" /></template>
              {{ $t(child.title) }}
            </a-menu-item>
          </a-sub-menu>
          <a-menu-item v-else :key="item.key">
            <template #icon><component :is="menuIcon(item.key)" /></template>
            {{ $t(item.title) }}
          </a-menu-item>
        </template>
      </a-menu>
    </a-layout-sider>
    <a-layout class="admin-layout__main">
      <AppHeader />
      <a-layout-content
        class="admin-layout__content"
        :class="{
          'admin-layout__content--overview':
            route.name === 'dashboard' &&
            (authStore.isCatalogAdmin || can('REPORT_DASHBOARD_VIEW')),
        }"
      >
        <RouterView />
      </a-layout-content>
    </a-layout>
  </a-layout>
</template>

<style scoped>
.mobile-close {
  color: white;
  margin-left: -12px;
}
.admin-layout {
  min-height: 100vh;
}

.admin-layout__sider {
  min-height: 100vh;
}
.admin-layout__main {
  container: workspace / inline-size;
}

.admin-layout__brand {
  position: relative;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  min-height: 64px;
  padding: 10px 12px;
  color: #fff;
}
.admin-layout__brand :deep(.brand-logo) {
  width: 40px;
  height: 40px;
}
.admin-layout__brand-name {
  min-width: 0;
  overflow-wrap: anywhere;
  font-size: 13px;
  font-weight: 600;
  line-height: 1.4;
}
.admin-layout__brand .mobile-close {
  position: absolute;
  top: 0;
  right: 0;
  z-index: 1;
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
@media (max-width: 767px) {
  .admin-layout__sider {
    position: fixed !important;
    z-index: 20;
    height: 100vh;
  }
  .admin-layout__sider.ant-layout-sider-collapsed {
    display: none;
  }
  .admin-layout__content--overview {
    margin: 12px;
    padding: 12px;
  }
}
</style>
