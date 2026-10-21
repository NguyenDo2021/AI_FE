<script setup lang="ts">
import WarehouseSelector from '@/components/catalog/WarehouseSelector.vue'
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
  MenuFoldOutlined,
  MenuUnfoldOutlined,
  ScanOutlined,
  SettingOutlined,
  ShoppingCartOutlined,
  TeamOutlined,
  UserOutlined,
} from '@ant-design/icons-vue'
import type { MenuItem } from '@/constants/menu'
import { MENU_ITEMS } from '@/constants/menu'
import { setLocale } from '@/locales'
import { useAppStore } from '@/stores/app'
import { useAuthStore } from '@/stores/auth'
import { usePermission } from '@/composables/usePermission'

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
    '/reports/dashboard': h(BarChartOutlined),
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

const logout = (): void => {
  authStore.logout()
  void router.replace({ name: 'login' })
}

const changeLocale = (locale: string): void => setLocale(locale === 'en-US' ? 'en-US' : 'vi-VN')
</script>

<template>
  <a-layout class="admin-layout">
    <a-layout-sider
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
        {{ appStore.sidebarCollapsed ? 'BH' : 'Hệ thống bán hàng' }}
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
    <a-layout>
      <a-layout-header class="admin-layout__header">
        <a-button type="text" @click="appStore.toggleSidebar">
          <MenuUnfoldOutlined v-if="appStore.sidebarCollapsed" />
          <MenuFoldOutlined v-else />
        </a-button>
        <div class="admin-layout__user">
          <WarehouseSelector />
          <span class="admin-layout__user-name">{{
            authStore.user?.fullName ?? authStore.user?.username
          }}</span>
          <a-select
            :value="$i18n.locale"
            size="small"
            :aria-label="$t('common.language')"
            @change="changeLocale"
          >
            <a-select-option value="vi-VN">Tiếng Việt</a-select-option>
            <a-select-option value="en-US">English</a-select-option>
          </a-select>
          <a-button type="text" @click="logout">{{ $t('common.logout') }}</a-button>
        </div>
      </a-layout-header>
      <a-layout-content
        class="admin-layout__content"
        :class="{ 'admin-layout__content--overview': route.name === 'reports-dashboard' }"
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

.admin-layout__brand {
  height: 64px;
  padding: 0 20px;
  overflow: hidden;
  color: #fff;
  font-size: 18px;
  font-weight: 600;
  line-height: 64px;
  white-space: nowrap;
}

.admin-layout__header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 24px;
  background: #fff;
  box-shadow: 0 1px 4px rgb(0 21 41 / 8%);
}

.admin-layout__user {
  display: flex;
  align-items: center;
  gap: 16px;
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
  .admin-layout__header {
    padding: 8px 12px;
    height: auto;
    min-height: 64px;
    line-height: normal;
  }
  .admin-layout__user {
    gap: 6px;
    min-width: 0;
    flex-wrap: wrap;
    justify-content: flex-end;
  }
  .admin-layout__user-name {
    display: none;
  }
  .admin-layout__user :deep(.ant-select) {
    max-width: 110px;
    min-width: 0 !important;
  }
  .admin-layout__content--overview {
    margin: 12px;
    padding: 12px;
  }
}
</style>
