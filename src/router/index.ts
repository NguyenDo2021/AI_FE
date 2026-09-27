import { createRouter, createWebHistory, type RouteRecordRaw } from 'vue-router'
import BasicLayout from '@/layouts/BasicLayout.vue'
import BlankLayout from '@/layouts/BlankLayout.vue'
import { PERMISSIONS } from '@/constants/permissions'
import { installRouterGuards } from './guards'
import { i18n } from '@/locales'

declare module 'vue-router' {
  interface RouteMeta {
    title?: string
    requiresAuth?: boolean
    permissions?: string[]
  }
}

const routes: RouteRecordRaw[] = [
  {
    path: '/',
    component: BasicLayout,
    redirect: '/dashboard',
    children: [
      {
        path: 'dashboard',
        name: 'dashboard',
        component: () => import('@/views/dashboard/index.vue'),
        meta: { title: 'common.dashboard', requiresAuth: true, permissions: [PERMISSIONS.DASHBOARD_VIEW] },
      },
      {
        path: 'system/user',
        name: 'system-user',
        component: () => import('@/views/system/user/index.vue'),
        meta: { title: 'common.user', requiresAuth: true, permissions: [PERMISSIONS.USER_VIEW] },
      },
      {
        path: 'system/role',
        name: 'system-role',
        component: () => import('@/views/system/role/index.vue'),
        meta: { title: 'common.role', requiresAuth: true, permissions: [PERMISSIONS.ROLE_VIEW] },
      },
    ],
  },
  {
    path: '/',
    component: BlankLayout,
    children: [
      {
        path: 'login',
        name: 'login',
        component: () => import('@/views/login/index.vue'),
        meta: { title: 'auth.login' },
      },
      {
        path: '403',
        name: 'forbidden',
        component: () => import('@/views/error/403.vue'),
        meta: { title: 'common.forbidden' },
      },
      {
        path: '404',
        name: 'not-found',
        component: () => import('@/views/error/404.vue'),
        meta: { title: 'common.pageNotFound' },
      },
    ],
  },
  { path: '/:pathMatch(.*)*', redirect: '/404' },
]

const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes,
  scrollBehavior: () => ({ top: 0 }),
})

router.afterEach((to) => {
  const title = to.meta.title ? i18n.global.t(to.meta.title) : 'Frontend Base'
  document.title = `${title} | ${import.meta.env.VITE_APP_TITLE}`
})

installRouterGuards(router)

export default router
