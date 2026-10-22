<script setup lang="ts">
import { computed, h, nextTick, onBeforeUnmount, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { theme } from 'ant-design-vue'
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
  MenuFoldOutlined,
  MenuUnfoldOutlined,
  CloseOutlined,
} from '@ant-design/icons-vue'
import BrandLogo from '@/components/layout/BrandLogo.vue'
import type { MenuItem } from '@/constants/menu'
import { MENU_ITEMS } from '@/constants/menu'
import { useAppStore } from '@/stores/app'
import { useAuthStore } from '@/stores/auth'
import { usePermission } from '@/composables/usePermission'

const appTitle = import.meta.env.VITE_APP_TITLE
const route = useRoute()
const router = useRouter()
const { t } = useI18n()
const { token } = theme.useToken()
const appStore = useAppStore()
const authStore = useAuthStore()
const { can } = usePermission()
const smallScreen = ref(false)
const menuScroll = ref<HTMLElement>()
const expandedKeys = ref<string[]>([])
const popupKeys = ref<string[]>([])
const menuOpenKeys = computed(() =>
  appStore.sidebarCollapsed ? popupKeys.value : expandedKeys.value,
)
const collapseLabel = computed(() =>
  t(appStore.sidebarCollapsed ? 'header.expandSidebar' : 'header.collapseSidebar'),
)
const sidebarStyle = computed(() => ({
  '--sidebar-selected-text': token.value['purple-2'],
  '--sidebar-focus': token.value['purple-4'],
}))

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

// Find ancestors in the permission-filtered tree, without changing route/order/RBAC.
const activeAncestors = (items: MenuItem[], path: string, parents: string[] = []): string[] => {
  for (const item of items) {
    if (item.key === path) return parents
    if (item.children) {
      const found = activeAncestors(item.children, path, [...parents, item.key])
      if (found.length) return found
    }
  }
  return []
}
const revealSelected = (): void => {
  const container = menuScroll.value
  const selected = container?.querySelector<HTMLElement>('.ant-menu-item-selected')
  if (!container || !selected || appStore.sidebarCollapsed) return
  const bounds = container.getBoundingClientRect()
  const item = selected.getBoundingClientRect()
  // Scroll only the menu; scrollIntoView could also move the document/content.
  if (item.top < bounds.top) container.scrollTop += item.top - bounds.top - 8
  else if (item.bottom > bounds.bottom) container.scrollTop += item.bottom - bounds.bottom + 8
}
let revealTimer: ReturnType<typeof setTimeout> | undefined
watch(
  [() => route.path, visibleMenus, () => appStore.sidebarCollapsed],
  async () => {
    clearTimeout(revealTimer)
    popupKeys.value = []
    const valid = new Set(
      visibleMenus.value.filter((item) => item.children?.length).map((item) => item.key),
    )
    expandedKeys.value = expandedKeys.value.filter((key) => valid.has(key))
    if (appStore.sidebarCollapsed) return
    expandedKeys.value = [
      ...new Set([...expandedKeys.value, ...activeAncestors(visibleMenus.value, route.path)]),
    ]
    await nextTick()
    revealSelected()
    // Recheck after Ant Menu's submenu/width transition completes.
    revealTimer = setTimeout(revealSelected, 320)
  },
  { immediate: true },
)
onBeforeUnmount(() => clearTimeout(revealTimer))
const changeOpenKeys = (keys: (string | number)[]): void => {
  if (appStore.sidebarCollapsed) popupKeys.value = keys.map(String)
  else expandedKeys.value = keys.map(String)
}
</script>

<template>
  <a-layout-sider
    id="app-sidebar"
    v-model:collapsed="appStore.sidebarCollapsed"
    :trigger="null"
    :width="256"
    :collapsed-width="smallScreen ? 0 : 80"
    collapsible
    breakpoint="md"
    class="app-sidebar"
    :class="{ 'app-sidebar--collapsed': appStore.sidebarCollapsed }"
    :style="sidebarStyle"
    @breakpoint="
      (broken: boolean) => {
        smallScreen = broken
        appStore.sidebarCollapsed = broken
      }
    "
  >
    <div class="sidebar-brand">
      <BrandLogo variant="inverse" :decorative="!appStore.sidebarCollapsed" />
      <span v-if="!appStore.sidebarCollapsed" class="sidebar-brand__name" :title="appTitle">{{
        appTitle
      }}</span>
      <a-button
        v-if="smallScreen"
        type="text"
        class="sidebar-close"
        :aria-label="collapseLabel"
        @click="appStore.toggleSidebar"
        ><template #icon><CloseOutlined aria-hidden="true" /></template
      ></a-button>
    </div>
    <nav ref="menuScroll" class="sidebar-menu-scroll" tabindex="0" :aria-label="appTitle">
      <a-menu
        mode="inline"
        theme="dark"
        :inline-indent="16"
        :inline-collapsed="appStore.sidebarCollapsed"
        :selected-keys="[route.path]"
        :open-keys="menuOpenKeys"
        @open-change="changeOpenKeys"
        @click="({ key }: { key: string }) => router.push(String(key))"
      >
        <template v-for="item in visibleMenus" :key="item.key">
          <a-sub-menu
            v-if="item.children?.length"
            :key="item.key"
            popup-class-name="app-sidebar-popup"
          >
            <template #icon><component :is="menuIcon(item.key)" /></template>
            <template #title
              ><span class="sidebar-label" :title="$t(item.title)">{{
                $t(item.title)
              }}</span></template
            >
            <a-menu-item v-for="child in item.children" :key="child.key" :title="$t(child.title)">
              <template #icon><component :is="menuIcon(child.key)" /></template>
              <span class="sidebar-label" :title="$t(child.title)">{{ $t(child.title) }}</span>
            </a-menu-item>
          </a-sub-menu>
          <a-menu-item v-else :key="item.key" :title="$t(item.title)">
            <template #icon><component :is="menuIcon(item.key)" /></template>
            <span class="sidebar-label" :title="$t(item.title)">{{ $t(item.title) }}</span>
          </a-menu-item>
        </template>
      </a-menu>
    </nav>
    <div class="sidebar-footer">
      <a-button
        type="text"
        :aria-label="collapseLabel"
        :aria-expanded="!appStore.sidebarCollapsed"
        aria-controls="app-sidebar"
        @click="appStore.toggleSidebar"
      >
        <template #icon
          ><MenuUnfoldOutlined
            v-if="appStore.sidebarCollapsed"
            aria-hidden="true" /><MenuFoldOutlined v-else aria-hidden="true"
        /></template>
        <span v-if="!appStore.sidebarCollapsed">{{ collapseLabel }}</span>
      </a-button>
    </div>
  </a-layout-sider>
</template>

<style scoped>
.app-sidebar {
  position: sticky;
  top: 0;
  align-self: flex-start;
  height: 100dvh;
  min-height: 0;
  background: #071c2c;
  color: #b8c6d6;
}
.app-sidebar :deep(.ant-layout-sider-children) {
  display: flex;
  flex-direction: column;
  height: 100%;
  min-height: 0;
}
.sidebar-brand {
  position: relative;
  display: flex;
  align-items: center;
  flex: 0 0 72px;
  min-width: 0;
  gap: 10px;
  padding: 14px 18px;
  border-bottom: 1px solid rgb(255 255 255 / 6%);
}
.sidebar-brand :deep(.brand-logo) {
  width: 38px;
  height: 38px;
}
.sidebar-brand__name {
  min-width: 0;
  color: #edf2f8;
  font-size: 13px;
  font-weight: 650;
  line-height: 19px;
  overflow-wrap: anywhere;
}
.sidebar-close {
  position: absolute;
  top: 2px;
  right: 2px;
  color: #b8c6d6;
}
.sidebar-menu-scroll {
  flex: 1 1 0;
  min-height: 0;
  min-width: 0;
  padding: 8px 4px;
  overflow-y: auto;
  overscroll-behavior-y: contain;
  scrollbar-gutter: stable both-edges;
  scrollbar-width: thin;
  scrollbar-color: var(--sidebar-thumb) transparent;
  --sidebar-thumb: rgb(205 218 235 / 22%);
}
.sidebar-menu-scroll:hover,
.sidebar-menu-scroll:focus-within {
  --sidebar-thumb: rgb(221 230 246 / 46%);
}
.sidebar-menu-scroll:focus-visible {
  outline: 2px solid var(--sidebar-focus);
  outline-offset: -3px;
}
.sidebar-menu-scroll::-webkit-scrollbar {
  width: 6px;
  height: 6px;
}
.sidebar-menu-scroll::-webkit-scrollbar-track {
  background: transparent;
}
.sidebar-menu-scroll::-webkit-scrollbar-thumb {
  background: var(--sidebar-thumb);
  border-radius: 999px;
}
.sidebar-menu-scroll::-webkit-scrollbar-button {
  display: none;
  width: 0;
  height: 0;
}
/* Chromium supports both APIs; use the pixel-width WebKit rule there. Firefox uses thin. */
@supports selector(::-webkit-scrollbar) {
  .sidebar-menu-scroll {
    scrollbar-width: auto;
    scrollbar-color: auto;
  }
}
.app-sidebar :deep(.ant-menu) {
  background: transparent;
  color: #b8c6d6;
  border: 0;
}
.app-sidebar :deep(.ant-menu-dark .ant-menu-sub.ant-menu-inline) {
  background: transparent;
}
.app-sidebar :deep(.ant-menu-root) {
  width: 100%;
}
.app-sidebar :deep(.ant-menu-item),
.app-sidebar :deep(.ant-menu-submenu-title) {
  display: flex;
  align-items: center;
  height: 42px;
  line-height: 42px;
  width: calc(100% - 8px);
  margin: 2px 4px;
  border-radius: 8px;
  font-size: 14px;
}
.app-sidebar :deep(.ant-menu-item-icon) {
  min-width: 16px;
  font-size: 16px;
}
.app-sidebar :deep(.ant-menu-title-content) {
  display: block;
  min-width: 0;
  flex: 1;
}
.sidebar-label {
  display: block;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.app-sidebar :deep(.ant-menu-submenu-title) {
  padding-inline-end: 32px;
}
.app-sidebar :deep(.ant-menu-submenu-arrow) {
  inset-inline-end: 14px;
}
.app-sidebar :deep(.ant-menu-dark .ant-menu-item-selected) {
  background: rgb(167 139 250 / 19%);
  color: var(--sidebar-selected-text);
}
.app-sidebar :deep(.ant-menu-dark .ant-menu-submenu-selected > .ant-menu-submenu-title) {
  color: var(--sidebar-selected-text);
}
.app-sidebar :deep(.ant-menu-dark .ant-menu-item:not(.ant-menu-item-selected):hover),
.app-sidebar :deep(.ant-menu-dark .ant-menu-submenu-title:hover) {
  background: rgb(255 255 255 / 5%);
  color: #f1efff;
}
.app-sidebar :deep(.ant-menu-item:focus-visible),
.app-sidebar :deep(.ant-menu-submenu-title:focus-visible) {
  outline: 2px solid var(--sidebar-focus);
  outline-offset: -2px;
}
.sidebar-footer {
  flex: 0 0 auto;
  padding: 8px 12px;
  border-top: 1px solid rgb(255 255 255 / 6%);
}
.sidebar-footer :deep(.ant-btn) {
  display: flex;
  align-items: center;
  gap: 10px;
  width: 100%;
  height: 36px;
  padding: 0 12px;
  color: #aebed0;
  font-size: 13px;
  text-align: left;
}
.sidebar-footer :deep(.ant-btn:hover) {
  background: rgb(255 255 255 / 5%);
  color: #efdbff;
}
.sidebar-footer :deep(.ant-btn:focus-visible) {
  outline: 2px solid var(--sidebar-focus);
  outline-offset: -2px;
}
.sidebar-footer :deep(.anticon) {
  font-size: 16px;
}
.app-sidebar--collapsed .sidebar-brand {
  justify-content: center;
  padding-inline: 0;
}
.app-sidebar--collapsed .sidebar-footer :deep(.ant-btn) {
  justify-content: center;
  padding: 0;
}
.app-sidebar--collapsed :deep(.ant-menu-inline-collapsed > .ant-menu-item),
.app-sidebar--collapsed
  :deep(.ant-menu-inline-collapsed > .ant-menu-submenu > .ant-menu-submenu-title) {
  justify-content: center;
  padding-inline: 0;
}
.app-sidebar--collapsed
  :deep(.ant-menu-inline-collapsed > .ant-menu-item > .ant-menu-title-content),
.app-sidebar--collapsed
  :deep(
    .ant-menu-inline-collapsed
      > .ant-menu-submenu
      > .ant-menu-submenu-title
      > .ant-menu-title-content
  ) {
  flex: 0;
  width: 0;
  margin: 0;
}
@media (max-width: 767px) {
  .app-sidebar {
    position: fixed !important;
    z-index: 20;
    inset: 0 auto 0 0;
  }
  .app-sidebar.ant-layout-sider-collapsed {
    display: none;
  }
}
/* Ant Menu portals collapsed submenus to body. This class belongs only to sidebar popups. */
:global(.app-sidebar-popup .ant-menu.ant-menu-dark) {
  background: #071c2c;
  color: #b8c6d6;
}
:global(.app-sidebar-popup .ant-menu.ant-menu-dark .ant-menu-item) {
  height: 42px;
  line-height: 42px;
  border-radius: 8px;
}
:global(.app-sidebar-popup .ant-menu.ant-menu-dark .ant-menu-item-selected) {
  background: rgb(167 139 250 / 19%);
  color: #efdbff;
}
:global(.app-sidebar-popup .ant-menu-item-icon) {
  font-size: 16px;
}
</style>
