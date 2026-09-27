<script setup lang="ts">
import { reactive, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { message } from 'ant-design-vue'
import { useI18n } from 'vue-i18n'
import type { LoginParams } from '@/types/auth'
import { useAuthStore } from '@/stores/auth'
import { validationRules } from '@/utils/validate'
import logo from '@/assets/logo.svg'

const router = useRouter()
const route = useRoute()
const authStore = useAuthStore()
const { t } = useI18n()
const loading = ref(false)
const form = reactive<LoginParams>({ username: '', password: '' })
const rules = {
  username: [validationRules.required(t('auth.usernameRequired'))],
  password: [validationRules.required(t('auth.passwordRequired'))],
}

const submit = async (): Promise<void> => {
  if (loading.value) return
  loading.value = true
  try {
    await authStore.login(form)
    message.success(t('common.success'))
    const redirect = typeof route.query.redirect === 'string' ? route.query.redirect : '/dashboard'
    await router.replace(redirect)
  } catch {
    message.error(t('auth.loginFailed'))
  } finally {
    loading.value = false
  }
}
</script>

<template>
  <div class="login-page">
    <a-card class="login-card" :bordered="false">
      <div class="login-card__heading">
        <img class="login-card__logo" :src="logo" alt="Frontend Base" />
        <h1>{{ $t('auth.login') }}</h1>
        <p>{{ $t('auth.loginHint') }}</p>
      </div>
      <a-form :model="form" :rules="rules" layout="vertical" @finish="submit">
        <a-form-item name="username" :label="$t('auth.username')">
          <a-input v-model:value="form.username" autocomplete="username" size="large" />
        </a-form-item>
        <a-form-item name="password" :label="$t('auth.password')">
          <a-input-password v-model:value="form.password" autocomplete="current-password" size="large" />
        </a-form-item>
        <a-button type="primary" html-type="submit" size="large" block :loading="loading">
          {{ $t('auth.login') }}
        </a-button>
      </a-form>
    </a-card>
  </div>
</template>

<style scoped>
.login-page {
  display: grid;
  min-height: 100vh;
  padding: 24px;
  place-items: center;
  background: linear-gradient(135deg, #f0f5ff, #e6f4ff);
}

.login-card {
  width: min(100%, 420px);
  padding: 20px;
  box-shadow: 0 12px 40px rgb(0 21 41 / 8%);
}

.login-card__heading {
  margin-bottom: 28px;
  text-align: center;
}

.login-card__logo {
  display: grid;
  width: 48px;
  height: 48px;
  margin: 0 auto 16px;
  color: #fff;
  font-size: 18px;
  font-weight: 700;
  background: #1677ff;
  border-radius: 12px;
  place-items: center;
}

.login-card__heading h1 {
  margin: 0 0 8px;
  font-size: 24px;
}

.login-card__heading p {
  margin: 0;
  color: #8c8c8c;
}
</style>
