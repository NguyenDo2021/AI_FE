<script setup lang="ts">
import { computed, reactive, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { message } from 'ant-design-vue'
import {
  ArrowRightOutlined,
  CheckCircleOutlined,
  EyeInvisibleOutlined,
  EyeOutlined,
  CodeSandboxOutlined,
  LoadingOutlined,
  LockOutlined,
  UserOutlined,
} from '@ant-design/icons-vue'
import { useI18n } from 'vue-i18n'
import BrandLogo from '@/components/layout/BrandLogo.vue'
import type { LoginParams } from '@/types/auth'
import { useAuthStore } from '@/stores/auth'
import { getLandingPath } from '@/utils/landing'
import { validationRules } from '@/utils/validate'

const appTitle = import.meta.env.VITE_APP_TITLE
const router = useRouter()
const route = useRoute()
const authStore = useAuthStore()
const { t } = useI18n()
const loading = ref(false)
const passwordVisible = ref(false)
const loginError = ref(false)
const form = reactive<LoginParams>({ username: '', password: '' })
const rules = computed(() => ({
  username: [validationRules.required(t('auth.usernameRequired'))],
  password: [validationRules.required(t('auth.passwordRequired'))],
}))
const submit = async (): Promise<void> => {
  if (loading.value) return
  loading.value = true
  loginError.value = false
  try {
    await authStore.login(form)
    message.success(t('common.success'))
    const redirect =
      typeof route.query.redirect === 'string'
        ? route.query.redirect
        : getLandingPath(authStore.user?.permissions ?? [], authStore.isCatalogAdmin)
    await router.replace(redirect)
  } catch {
    loginError.value = true
    message.error(t('auth.loginFailed'))
  } finally {
    loading.value = false
  }
}
</script>

<template>
  <div class="login-page">
    <div class="login-shell">
      <aside class="login-brand" :aria-label="appTitle">
        <div class="login-brand__identity">
          <BrandLogo variant="inverse" decorative />
          <span class="login-brand__name">{{ appTitle }}</span>
        </div>

        <div class="login-brand__content">
          <p class="login-brand__eyebrow">{{ t('auth.brandEyebrow') }}</p>
          <h2 class="login-brand__headline">
            <span>{{ t('auth.inventoryHeadline') }}</span>
            <span class="login-brand__mint">{{ t('auth.inventoryEmphasis') }}</span>
            <span>{{ t('auth.salesHeadline') }}</span>
            <span class="login-brand__lavender">{{ t('auth.salesEmphasis') }}</span>
          </h2>
          <p class="login-brand__description">{{ t('auth.brandDescription') }}</p>

          <div class="warehouse-scene" aria-hidden="true">
            <div class="warehouse-scene__toolbar">
              <span class="warehouse-scene__dots"><i></i><i></i><i></i></span>
              <span>{{ t('auth.illustrationTitle') }}</span>
            </div>
            <div class="warehouse-scene__shelf">
              <div v-for="box in 4" :key="box" class="warehouse-scene__box">
                <CodeSandboxOutlined />
              </div>
            </div>
            <div class="warehouse-scene__labels">
              <span v-for="label in ['goodsLabel', 'ordersLabel', 'receivablesLabel']" :key="label">
                <CheckCircleOutlined /> {{ t(`auth.${label}`) }}
              </span>
            </div>
          </div>
        </div>

        <p class="login-brand__footer">{{ t('auth.brandFooter') }}</p>
      </aside>

      <section class="login-workspace" aria-labelledby="login-title">
        <div class="login-mobile-brand">
          <BrandLogo decorative />
          <span>{{ appTitle }}</span>
        </div>
        <div class="login-form">
          <p class="login-form__eyebrow">{{ t('auth.workspaceEyebrow') }}</p>
          <h1 id="login-title">{{ t('auth.welcome') }}</h1>
          <p class="login-form__description">{{ t('auth.welcomeDescription') }}</p>

          <a-form
            name="login"
            :model="form"
            :rules="rules"
            layout="vertical"
            :aria-busy="loading"
            @finish="submit"
          >
            <a-form-item name="username" :label="t('auth.username')">
              <a-input
                id="login_username"
                v-model:value="form.username"
                name="username"
                autocomplete="username"
                autocapitalize="none"
                :spellcheck="false"
                :readonly="loading"
                size="large"
              >
                <template #prefix><UserOutlined aria-hidden="true" /></template>
              </a-input>
            </a-form-item>
            <a-form-item name="password" :label="t('auth.password')">
              <a-input
                id="login_password"
                v-model:value="form.password"
                :type="passwordVisible ? 'text' : 'password'"
                name="password"
                autocomplete="current-password"
                :readonly="loading"
                size="large"
              >
                <template #prefix><LockOutlined aria-hidden="true" /></template>
                <template #suffix>
                  <button
                    type="button"
                    class="login-form__visibility"
                    :aria-label="t(passwordVisible ? 'auth.hidePassword' : 'auth.showPassword')"
                    :aria-pressed="passwordVisible"
                    aria-controls="login_password"
                    @click="passwordVisible = !passwordVisible"
                  >
                    <EyeInvisibleOutlined v-if="passwordVisible" aria-hidden="true" />
                    <EyeOutlined v-else aria-hidden="true" />
                  </button>
                </template>
              </a-input>
            </a-form-item>
            <a-button
              class="login-form__submit"
              type="primary"
              html-type="submit"
              size="large"
              block
              :disabled="loading"
              :aria-busy="loading"
            >
              <span>{{ t('auth.login') }}</span>
              <span class="login-form__submit-icon" aria-hidden="true">
                <LoadingOutlined v-if="loading" spin />
                <ArrowRightOutlined v-else />
              </span>
            </a-button>
            <div class="login-form__feedback" aria-live="polite" aria-atomic="true">
              <span v-if="loginError" class="login-form__error">{{ t('auth.loginFailed') }}</span>
              <span v-else-if="loading">{{ t('auth.signingIn') }}</span>
            </div>
          </a-form>

          <p class="login-form__support">
            <span>{{ t('auth.noAccount') }}</span>
            {{ t('auth.contactAdmin') }}
          </p>
        </div>
      </section>
    </div>
  </div>
</template>

<style scoped>
.login-page {
  min-height: 100vh;
  min-height: 100dvh;
  padding: clamp(12px, 2vw, 28px);
  background: #f7f6fb;
}
.login-shell {
  display: grid;
  grid-template-columns: minmax(0, 54fr) minmax(0, 46fr);
  width: min(100%, 1440px);
  min-height: calc(100vh - clamp(12px, 2vw, 28px) * 2);
  min-height: calc(100dvh - clamp(12px, 2vw, 28px) * 2);
  margin-inline: auto;
  background: #fff;
  border-radius: 24px;
}
.login-brand {
  display: flex;
  flex-direction: column;
  gap: 36px;
  min-width: 0;
  padding: clamp(32px, 4vw, 64px);
  color: #fff;
  background:
    radial-gradient(ellipse at 10% 0%, #9673cc38, transparent 56%),
    linear-gradient(145deg, #241d40 0%, #43326d 56%, #60458f 100%);
  border-radius: 24px 0 0 24px;
}
.login-brand__identity,
.login-mobile-brand {
  display: flex;
  align-items: center;
  gap: 14px;
  min-width: 0;
}
.login-brand__identity :deep(.brand-logo) {
  width: 60px;
  height: 60px;
}
.login-brand__name,
.login-mobile-brand > span {
  max-width: 14ch;
  overflow-wrap: anywhere;
  font-size: 17px;
  font-weight: 700;
  line-height: 1.45;
  letter-spacing: 0.09em;
  text-transform: uppercase;
}
.login-brand__content {
  width: 100%;
  max-width: 460px;
  margin-block: auto;
}
.login-brand__eyebrow,
.login-form__eyebrow {
  margin: 0 0 22px;
  font-size: 11px;
  font-weight: 650;
  line-height: 1.6;
  letter-spacing: 0.17em;
  text-transform: uppercase;
}
.login-brand__eyebrow {
  padding-left: 12px;
  color: #d4c6e9;
  border-left: 2px solid #c4f2df;
}
.login-brand__headline {
  margin: 0;
  color: #fff;
  font-size: clamp(42px, 3.4vw, 48px);
  font-weight: 700;
  line-height: 1.13;
  letter-spacing: -0.035em;
}
.login-brand__headline > span {
  display: block;
}
.login-brand__mint {
  color: #c4f2df;
}
.login-brand__lavender {
  color: #e3d5ff;
}
.login-brand__description {
  max-width: 360px;
  margin: 24px 0 28px;
  color: #e3daee;
  font-size: 14px;
  line-height: 1.75;
}
.warehouse-scene {
  padding: 20px;
  background: #ffffff0d;
  border: 1px solid #ffffff26;
  border-radius: 16px;
  transform: rotate(-2deg);
}
.warehouse-scene__toolbar {
  display: flex;
  align-items: center;
  gap: 14px;
  color: #e3daee;
  font-size: 11px;
}
.warehouse-scene__dots {
  display: flex;
  gap: 5px;
}
.warehouse-scene__dots i {
  width: 6px;
  height: 6px;
  background: #c5b6de80;
  border-radius: 50%;
}
.warehouse-scene__shelf {
  display: flex;
  align-items: flex-end;
  gap: 8px;
  height: 106px;
  padding: 16px 10px 8px;
  border-bottom: 4px solid #b39ad8;
}
.warehouse-scene__box {
  position: relative;
  display: grid;
  flex: 1;
  height: 56px;
  color: #60458f;
  background: #d6c4ef;
  border: 1px solid #e6d7fa;
  border-radius: 4px;
  box-shadow: inset -6px 0 #00000008;
  place-items: center;
}
.warehouse-scene__box :deep(.anticon) {
  font-size: 20px;
}
.warehouse-scene__box::before {
  position: absolute;
  top: 0;
  width: 12px;
  height: 12px;
  content: '';
  background: #ffffff30;
}
.warehouse-scene__box:nth-child(2) {
  height: 74px;
  background: #b39ad8;
}
.warehouse-scene__box:nth-child(3) {
  flex: 0.7;
  height: 42px;
  background: #efe5ff;
}
.warehouse-scene__box:nth-child(4) {
  height: 60px;
}
.warehouse-scene__labels {
  display: flex;
  justify-content: space-between;
  gap: 8px;
  margin-top: 14px;
  color: #e3daee;
  font-size: 11px;
}
.warehouse-scene__labels > span {
  display: inline-flex;
  align-items: center;
  gap: 6px;
}
.warehouse-scene__labels :deep(.anticon) {
  color: #c4f2df;
  font-size: 14px;
}
.login-brand__footer {
  margin: 0;
  color: #d4c6e9;
  font-size: 12px;
  line-height: 1.7;
}
.login-workspace {
  display: flex;
  align-items: center;
  justify-content: center;
  min-width: 0;
  padding: 48px clamp(28px, 4vw, 64px);
}
.login-mobile-brand {
  display: none;
}
.login-form {
  width: 100%;
  max-width: 400px;
}
.login-form__eyebrow {
  margin-bottom: 12px;
  color: #7357cf;
}
.login-form h1 {
  margin: 0 0 10px;
  color: #241d40;
  font-size: clamp(26px, 2.1vw, 32px);
  font-weight: 650;
  line-height: 1.3;
  letter-spacing: -0.035em;
}
.login-form__description {
  margin: 0 0 32px;
  color: #777086;
  font-size: 14px;
  line-height: 1.7;
}
.login-form :deep(.ant-form) {
  font-family: inherit;
}
.login-form :deep(.ant-form-item) {
  margin-bottom: 22px;
}
.login-form :deep(.ant-form-item-label > label) {
  height: auto;
  color: #302943;
  font-size: 13px;
  font-weight: 500;
}
.login-form :deep(.ant-form-item-required::before) {
  display: none !important;
}
.login-form :deep(.ant-input-affix-wrapper) {
  min-height: 48px;
  padding: 5px 12px;
  color: #241d40;
  font-family: inherit;
  font-size: 16px;
  background: #fff;
  border-color: #dfdaeb;
  border-radius: 8px;
}
.login-form :deep(.ant-input-prefix) {
  margin-right: 10px;
  color: #8b819e;
}
.login-form :deep(.ant-input) {
  min-width: 0;
  color: #241d40;
  font-family: inherit;
  font-size: 16px;
}
.login-form :deep(.ant-input-affix-wrapper:hover),
.login-form :deep(.ant-input-affix-wrapper-focused) {
  border-color: #7357cf;
}
.login-form :deep(.ant-input-affix-wrapper-focused) {
  box-shadow: 0 0 0 3px #7357cf14;
}
.login-form :deep(.ant-input-affix-wrapper-status-error) {
  border-color: #b42335;
}
.login-form :deep(.ant-input-affix-wrapper-status-error.ant-input-affix-wrapper-focused) {
  box-shadow: 0 0 0 3px #b4233514;
}
.login-form :deep(.ant-form-item-explain-error) {
  color: #b42335;
}
.login-form :deep(input:autofill) {
  -webkit-text-fill-color: #241d40;
  caret-color: #241d40;
  box-shadow: 0 0 0 100px #f5f1ff inset;
}
.login-form__visibility {
  display: inline-grid;
  width: 34px;
  height: 34px;
  padding: 0;
  color: #817591;
  cursor: pointer;
  background: transparent;
  border: 0;
  border-radius: 5px;
  place-items: center;
}
.login-form__visibility:hover {
  color: #7357cf;
  background: #f5f1ff;
}
.login-form__visibility:focus-visible,
.login-form__submit:focus-visible {
  outline: 2px solid #7357cf;
  outline-offset: 3px;
}
.login-form__submit {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 12px;
  height: 48px;
  font-size: 14px;
  color: #fff;
  font-family: inherit;
  font-weight: 600;
  background: #7357cf;
  border-color: #7357cf;
  border-radius: 8px;
  box-shadow: none;
}
.login-form__submit:hover:not(:disabled) {
  background: #6244be;
  border-color: #6244be;
}
.login-form__submit:active:not(:disabled) {
  background: #5333aa;
  border-color: #5333aa;
}
.login-form__submit:disabled {
  color: #fff;
  background: #7357cf;
  border-color: #7357cf;
  opacity: 0.75;
}
.login-form__submit-icon {
  display: inline-flex;
  width: 16px;
}
.login-form__feedback {
  min-height: 52px;
  padding-top: 10px;
  color: #777086;
  font-size: 12px;
  line-height: 20px;
}
.login-form__error {
  color: #b42335;
}
.login-form__support {
  margin: 4px 0 0;
  padding-top: 24px;
  color: #50475f;
  font-size: 12px;
  line-height: 1.8;
  text-align: center;
  border-top: 1px solid #e9e4f1;
}
.login-form__support > span {
  display: block;
  margin-bottom: 2px;
  color: #777086;
}
@media (min-width: 768px) and (max-width: 1023px) {
  .login-brand {
    gap: 32px;
    padding: 32px 26px;
  }
  .login-brand__headline {
    font-size: clamp(38px, 4.5vw, 44px);
  }
  .login-brand__eyebrow {
    font-size: 10px;
    letter-spacing: 0.12em;
  }
  .login-workspace {
    padding-inline: 26px;
  }
  .warehouse-scene {
    padding: 16px 12px;
  }
}
@media (max-width: 767px) {
  .login-page {
    padding: 0;
    background: #fff;
  }
  .login-shell {
    display: block;
    min-height: 100vh;
    min-height: 100dvh;
    border-radius: 0;
  }
  .login-brand {
    display: none;
  }
  .login-workspace {
    flex-direction: column;
    gap: 48px;
    min-height: 100vh;
    min-height: 100dvh;
    padding: 32px 24px;
  }
  .login-mobile-brand {
    display: flex;
    width: 100%;
    max-width: 400px;
    gap: 10px;
    color: #43326d;
  }
  .login-mobile-brand > span {
    font-size: 13px;
  }
  .login-form {
    margin-block: auto;
  }
  .login-form h1 {
    font-size: clamp(25px, 5.5vw, 30px);
  }
}
@media (max-width: 374px) {
  .login-workspace {
    gap: 32px;
    padding-inline: 20px;
  }
}
</style>
