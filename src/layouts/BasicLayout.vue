<script setup lang="ts">
import AppHeader from '@/components/layout/AppHeader.vue'
import AppSidebar from '@/components/layout/AppSidebar.vue'
import { useRoute } from 'vue-router'
import { useAuthStore } from '@/stores/auth'
import { usePermission } from '@/composables/usePermission'

const route = useRoute()
const authStore = useAuthStore()
const { can } = usePermission()
</script>

<template>
  <a-layout
    class="admin-layout"
    :class="{
      'admin-layout--products':
        route.name === 'products' || route.name === 'product-groups' || route.name === 'warehouses',
    }"
  >
    <AppSidebar />
    <a-layout class="admin-layout__main">
      <AppHeader />
      <a-layout-content
        class="admin-layout__content"
        :class="{
          'admin-layout__content--products':
            route.name === 'products' ||
            route.name === 'product-groups' ||
            route.name === 'warehouses',
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
@media (max-width: 767px) {
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
