<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { theme } from 'ant-design-vue'
import {
  DownOutlined,
  LogoutOutlined,
  MenuFoldOutlined,
  MenuUnfoldOutlined,
  TranslationOutlined,
  UserOutlined,
} from '@ant-design/icons-vue'
import WarehouseSelector from '@/components/catalog/WarehouseSelector.vue'
import BrandLogo from '@/components/layout/BrandLogo.vue'
import { setLocale } from '@/locales'
import { useAppStore } from '@/stores/app'
import { useAuthStore } from '@/stores/auth'

const route = useRoute()
const router = useRouter()
const { t, locale } = useI18n()
const { token } = theme.useToken()
const appStore = useAppStore()
const authStore = useAuthStore()
const accountOpen = ref(false)
const accountTrigger = ref<{ $el: HTMLButtonElement }>()
const accountMenu = ref<{ $el: HTMLElement }>()

const pageTitle = computed(() =>
  route.meta.title ? t(route.meta.title) : String(route.name ?? ''),
)
const userName = computed(
  () => authStore.user?.fullName?.trim() || authStore.user?.username?.trim() || '',
)
const userInitial = computed(() => Array.from(userName.value)[0]?.toLocaleUpperCase(locale.value))
const sidebarLabel = computed(() =>
  t(appStore.sidebarCollapsed ? 'header.expandSidebar' : 'header.collapseSidebar'),
)
const headerStyle = computed(() => ({
  '--header-bg': token.value.colorBgContainer,
  '--header-border': token.value.colorBorderSecondary,
  '--header-text': token.value.colorText,
  '--header-muted': token.value.colorTextSecondary,
  '--header-accent': token.value['purple-6'],
  '--header-accent-bg': token.value['purple-1'],
  '--header-focus': token.value.colorPrimary,
}))

watch(
  [accountOpen, accountMenu],
  ([open, menu], _, onCleanup) => {
    if (!open || !menu) return
    // Ant Design initially hides the portal while calculating its position.
    let frame = 0
    const focusMenu = (): void => {
      const item = menu.$el.querySelector<HTMLElement>('[role="menuitem"]')
      item?.focus()
      if (item && item.ownerDocument.activeElement === item) return
      frame = requestAnimationFrame(focusMenu)
    }
    frame = requestAnimationFrame(focusMenu)
    onCleanup(() => cancelAnimationFrame(frame))
  },
  { flush: 'post' },
)

const closeAccount = (): void => {
  accountOpen.value = false
  accountTrigger.value?.$el.focus()
}
const logout = (): void => {
  accountOpen.value = false
  authStore.logout()
  void router.replace({ name: 'login' })
}
const changeLocale = (value: string): void => setLocale(value === 'en-US' ? 'en-US' : 'vi-VN')
</script>

<template>
  <a-layout-header class="app-header" :style="headerStyle">
    <div class="app-header__navigation">
      <a-tooltip :title="sidebarLabel">
        <a-button
          type="text"
          class="app-header__icon-button"
          :aria-label="sidebarLabel"
          :aria-expanded="!appStore.sidebarCollapsed"
          aria-controls="app-sidebar"
          @click="appStore.toggleSidebar"
        >
          <template #icon>
            <MenuUnfoldOutlined v-if="appStore.sidebarCollapsed" />
            <MenuFoldOutlined v-else />
          </template>
        </a-button>
      </a-tooltip>
      <BrandLogo class="app-header__brand" />
      <nav class="app-header__breadcrumb" :aria-label="t('header.breadcrumb')">
        <span class="app-header__home">{{ t('header.home') }}</span>
        <span class="app-header__separator" aria-hidden="true">/</span>
        <span class="app-header__page" aria-current="page" :title="pageTitle">{{ pageTitle }}</span>
      </nav>
    </div>

    <WarehouseSelector class="app-header__warehouse" />

    <div class="app-header__language">
      <TranslationOutlined class="app-header__language-icon" aria-hidden="true" />
      <a-select
        size="large"
        :value="locale"
        :aria-label="t('common.language')"
        :options="[
          { value: 'vi-VN', label: 'Tiếng Việt' },
          { value: 'en-US', label: 'English' },
        ]"
        @change="changeLocale"
      />
    </div>

    <a-dropdown v-model:open="accountOpen" :trigger="['click']" placement="bottomRight">
      <a-button
        ref="accountTrigger"
        type="text"
        class="app-header__account"
        :aria-label="t('header.accountMenu', { name: userName })"
        aria-haspopup="menu"
        :aria-expanded="accountOpen"
        aria-controls="header-account-menu"
        @keydown.down.prevent="accountOpen = true"
        @keydown.esc.stop.prevent="closeAccount"
      >
        <a-tooltip :title="userName || t('header.account')">
          <a-avatar :size="32" class="app-header__avatar">
            <span v-if="userInitial">{{ userInitial }}</span>
            <UserOutlined v-else />
          </a-avatar>
        </a-tooltip>
        <span class="app-header__user-name" :title="userName">{{ userName }}</span>
        <DownOutlined class="app-header__account-chevron" aria-hidden="true" />
      </a-button>
      <template #overlay>
        <div
          class="app-header__account-popup"
          :style="headerStyle"
          @keydown.esc.stop.prevent="closeAccount"
          @keydown.tab="accountOpen = false"
        >
          <div class="app-header__account-info">
            <span class="app-header__account-label">{{ t('header.account') }}</span>
            <strong>{{ userName }}</strong>
            <span v-if="authStore.user?.username">{{ authStore.user.username }}</span>
            <span v-if="authStore.user?.email">{{ authStore.user.email }}</span>
          </div>
          <a-menu
            id="header-account-menu"
            ref="accountMenu"
            :selectable="false"
            :aria-label="t('header.account')"
          >
            <a-menu-item key="logout" @click="logout">
              <template #icon><LogoutOutlined /></template>
              {{ t('common.logout') }}
            </a-menu-item>
          </a-menu>
        </div>
      </template>
    </a-dropdown>
  </a-layout-header>
</template>

<style scoped>
.app-header {
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(264px, 300px) 126px auto;
  align-items: center;
  gap: 12px;
  height: 64px;
  padding: 0 24px;
  color: var(--header-text);
  line-height: 20px;
  background: var(--header-bg);
  border-bottom: 1px solid var(--header-border);
}
.app-header__navigation,
.app-header__breadcrumb {
  display: flex;
  align-items: center;
  min-width: 0;
  gap: 12px;
}
.app-header__brand {
  width: 32px;
  height: 32px;
}
.app-header__icon-button {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex: 0 0 40px;
  width: 40px;
  height: 40px;
  padding: 0;
  color: var(--header-muted);
  border-radius: 8px;
}
.app-header__breadcrumb {
  gap: 10px;
  font-size: 13px;
}
.app-header__home,
.app-header__separator {
  flex-shrink: 0;
  color: var(--header-muted);
}
.app-header__page {
  overflow: hidden;
  font-weight: 500;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.app-header__language {
  position: relative;
  display: flex;
  align-items: center;
  min-width: 0;
  height: 40px;
}
.app-header__language-icon {
  position: absolute;
  z-index: 1;
  top: 50%;
  left: 10px;
  color: var(--header-muted);
  pointer-events: none;
  transform: translateY(-50%);
}
.app-header__language :deep(.ant-select) {
  width: 100%;
  height: 40px;
}
.app-header__language :deep(.ant-select-selector) {
  height: 40px !important;
  padding-left: 32px !important;
  font-size: 13px;
  border-radius: 8px;
}
.app-header__account {
  display: inline-flex;
  align-items: center;
  gap: 10px;
  min-width: 0;
  height: 40px;
  padding: 0 6px;
  line-height: 20px;
  color: var(--header-text);
  border-radius: 8px;
}
.app-header__avatar {
  flex-shrink: 0;
  color: var(--header-accent);
  font-size: 14px;
  font-weight: 600;
  background: var(--header-accent-bg);
}
.app-header__user-name {
  max-width: 160px;
  overflow: hidden;
  line-height: 20px;
  font-size: 13px;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.app-header__account > :deep(span) {
  margin-inline-start: 0;
}
.app-header__account-chevron {
  flex-shrink: 0;
  font-size: 10px;
}
.app-header__language :deep(.ant-select-selection-item),
.app-header__language :deep(.ant-select-selection-placeholder) {
  line-height: 38px;
}
.app-header__language :deep(.ant-select-selection-search-input) {
  height: 38px;
}
.app-header__icon-button :deep(.anticon),
.app-header__language-icon,
.app-header__account-chevron {
  display: inline-flex;
  align-items: center;
  justify-content: center;
}
.app-header__icon-button :deep(.anticon) {
  font-size: 16px;
}
.app-header__icon-button:focus-visible,
.app-header__account:focus-visible {
  outline: 2px solid var(--header-focus);
  outline-offset: 2px;
}
.app-header__account-popup {
  width: 280px;
  max-width: calc(100vw - 24px);
  overflow: hidden;
  color: var(--header-text);
  background: var(--header-bg);
  border: 1px solid var(--header-border);
  border-radius: 10px;
  box-shadow: 0 6px 20px rgb(0 0 0 / 8%);
}
.app-header__account-info {
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding: 16px;
  overflow-wrap: anywhere;
  font-size: 13px;
  border-bottom: 1px solid var(--header-border);
}
.app-header__account-label,
.app-header__account-info > span {
  color: var(--header-muted);
}
.app-header__account-label {
  margin-bottom: 4px;
  font-size: 12px;
}
.app-header__account-popup :deep(.ant-dropdown-menu) {
  box-shadow: none;
}
@media (max-width: 1199px) {
  .app-header {
    grid-template-columns: minmax(0, 1fr) minmax(224px, 264px) 126px auto;
    padding-inline: 20px;
  }
  .app-header__home,
  .app-header__separator {
    display: none;
  }
  .app-header__user-name {
    max-width: 110px;
  }
}
@media (max-width: 767px) {
  .app-header {
    grid-template-columns: minmax(0, 1fr) minmax(180px, 240px) 126px 40px;
    padding-inline: 16px;
  }
  .app-header__navigation {
    gap: 6px;
  }
  .app-header__user-name,
  .app-header__account-chevron {
    display: none;
  }
  .app-header__account {
    justify-content: center;
    width: 40px;
    padding: 0;
  }
}
@media (max-width: 479px) {
  .app-header__breadcrumb {
    display: none;
  }
}
@media (max-width: 639px) {
  .app-header {
    grid-template-columns: minmax(0, 1fr) 126px 40px;
    height: auto;
    min-height: 64px;
    padding: 12px;
  }
  .app-header__warehouse {
    grid-column: 1 / -1;
    grid-row: 2;
  }
}
@container workspace (max-width: 760px) {
  .app-header {
    grid-template-columns: minmax(0, 1fr) 224px 116px auto;
  }
  .app-header__navigation {
    gap: 6px;
  }
  .app-header__user-name {
    max-width: 80px;
  }
}
@container workspace (max-width: 680px) {
  .app-header {
    grid-template-columns: minmax(0, 1fr) 126px auto;
    height: auto;
    min-height: 64px;
    padding-block: 12px;
  }
  .app-header__warehouse {
    grid-column: 1 / -1;
    grid-row: 2;
  }
}
</style>
