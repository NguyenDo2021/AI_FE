import { createApp } from 'vue'
import { createPinia } from 'pinia'
import 'ant-design-vue/dist/reset.css'
import App from './App.vue'
import router from '@/router'
import { i18n } from '@/locales'
import { useAuthStore } from '@/stores/auth'
import { installPermissionDirective } from '@/directives/permission'
import { configureRequestAuth } from '@/utils/request'
import { installWarehouseAccess } from '@/utils/warehouseAccess'
import { useWarehouseStore } from '@/stores/warehouse'
import '@/styles/index.css'

const app = createApp(App)
const pinia = createPinia()
app.use(pinia)

const auth = useAuthStore(pinia)
const warehouses = useWarehouseStore(pinia)
installWarehouseAccess(warehouses, () => auth.user?.id)
configureRequestAuth({
  refresh: auth.refreshToken,
  onAccessDenied: () => {
    void auth.refreshAdmin()
  },
  onSessionExpired: () => {
    auth.logout()
    if (router.currentRoute.value.name !== 'login') void router.replace({ name: 'login' })
  },
})

app.use(router)
app.use(i18n)
installPermissionDirective(app)

app.config.errorHandler = (error) => {
  console.error('Unhandled application error:', error)
}

void router.isReady().then(() => app.mount('#app'))
