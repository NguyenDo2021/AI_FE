import { createApp } from 'vue'
import { createPinia } from 'pinia'
import Antd from 'ant-design-vue'
import 'ant-design-vue/dist/reset.css'
import App from './App.vue'
import router from '@/router'
import { i18n } from '@/locales'
import { useAuthStore } from '@/stores/auth'
import { installPermissionDirective } from '@/directives/permission'
import { configureRequestAuth } from '@/utils/request'
import '@/styles/index.css'

const app = createApp(App)
const pinia = createPinia()
app.use(pinia)

const auth = useAuthStore(pinia)
configureRequestAuth({
  refresh: auth.refreshToken,
  onSessionExpired: () => {
    auth.logout()
    if (router.currentRoute.value.name !== 'login') void router.replace({ name: 'login' })
  },
})

app.use(router)
app.use(i18n)
app.use(Antd)
installPermissionDirective(app)

app.config.errorHandler = (error) => {
  console.error('Unhandled application error:', error)
}

void router.isReady().then(() => app.mount('#app'))
