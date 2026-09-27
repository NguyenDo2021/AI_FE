<script setup lang="ts">
import { computed, h } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import {
  DashboardOutlined,
  MenuFoldOutlined,
  MenuUnfoldOutlined,
  SettingOutlined,
  TeamOutlined,
  UserOutlined,
} from '@ant-design/icons-vue'
import type { MenuItem } from '@/constants/menu'
import { MENU_ITEMS } from '@/constants/menu'
import { setLocale } from '@/locales'
import { useAppStore } from '@/stores/app'
import { useAuthStore } from '@/stores/auth'
import { usePermission } from '@/composables/usePermission'

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
        if (item.permission && !can(item.permission)) return false
        return !item.children || item.children.length > 0 || !item.permission
      })
  return filter(MENU_ITEMS)
})

const menuIcon = (key: string): ReturnType<typeof h> => {
  const icons: Record<string, ReturnType<typeof h>> = {
    '/dashboard': h(DashboardOutlined),
    '/system': h(SettingOutlined),
    '/system/user': h(TeamOutlined),
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
    >
      <div class="admin-layout__brand">{{ appStore.sidebarCollapsed ? 'FB' : 'Frontend Base' }}</div>
      <a-menu
        mode="inline"
        theme="dark"
        :selected-keys="[route.path]"
        :open-keys="appStore.sidebarCollapsed ? [] : ['/system']"
        @click="({ key }) => router.push(String(key))"
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
          <span class="admin-layout__user-name">{{ authStore.user?.fullName ?? authStore.user?.username }}</span>
          <a-select :value="$i18n.locale" size="small" :aria-label="$t('common.language')" @change="changeLocale">
            <a-select-option value="vi-VN">Tiếng Việt</a-select-option>
            <a-select-option value="en-US">English</a-select-option>
          </a-select>
          <a-button type="text" @click="logout">{{ $t('common.logout') }}</a-button>
        </div>
      </a-layout-header>
      <a-layout-content class="admin-layout__content">
        <RouterView />
      </a-layout-content>
    </a-layout>
  </a-layout>
</template>

<style scoped>
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
