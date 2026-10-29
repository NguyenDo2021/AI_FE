<script setup lang="ts">
import { computed, nextTick, reactive, ref, watch } from 'vue'
import { useMediaQuery, useWindowSize } from '@vueuse/core'
import { useI18n } from 'vue-i18n'
import { message, type FormInstance } from 'ant-design-vue'
import { UserAddOutlined, EditOutlined, SaveOutlined } from '@ant-design/icons-vue'
import { BasicModal } from '@/components'
import { createUser, updateUser } from '@/api/user/user.api'
import { validationRules } from '@/utils/validate'
import type { User, UserPayload } from '@/types/user'

const props = defineProps<{ open: boolean; user: User | null }>()
const emit = defineEmits<{ 'update:open': [open: boolean]; saved: [] }>()
const { t } = useI18n()
const mobile = useMediaQuery('(max-width: 599px)')
const { height: visibleHeight } = useWindowSize({ type: 'visual' })
const formRef = ref<FormInstance>()
const form = reactive<UserPayload>({
  username: '',
  fullName: '',
  email: '',
  phone: undefined,
  status: 1,
})
const saving = ref(false)
const validating = ref(false)
const error = ref('')
const title = computed(() => t(props.user ? 'user.edit' : 'user.add'))
const selectContainer = (): HTMLElement => document.documentElement
const rules = computed(() => ({
  username: [validationRules.required(t('user.required'))],
  fullName: [validationRules.required(t('user.required'))],
  email: [
    validationRules.required(t('user.required')),
    validationRules.email(t('user.invalidEmail')),
  ],
}))
watch([() => props.open, () => props.user], async () => {
  if (!props.open) return
  Object.assign(
    form,
    props.user
      ? {
          username: props.user.username,
          fullName: props.user.fullName,
          email: props.user.email,
          phone: props.user.phone,
          status: props.user.status,
        }
      : { username: '', fullName: '', email: '', phone: undefined, status: 1 },
  )
  error.value = ''
  await nextTick()
  formRef.value?.clearValidate()
})
const save = async (): Promise<void> => {
  if (saving.value || validating.value) return
  validating.value = true
  try {
    await formRef.value?.validate()
  } catch {
    return
  } finally {
    validating.value = false
  }
  saving.value = true
  error.value = ''
  const id = props.user?.id
  // Same five fields and conversion as the existing user form; no trimming or phone normalization.
  const payload: UserPayload = {
    username: String(form.username ?? ''),
    fullName: String(form.fullName ?? ''),
    email: String(form.email ?? ''),
    phone: typeof form.phone === 'string' ? form.phone : undefined,
    status: typeof form.status === 'number' ? form.status : 1,
  }
  try {
    if (id) await updateUser(id, payload)
    else await createUser(payload)
    message.success(t('user.saveSuccess'))
    emit('update:open', false)
    emit('saved')
  } catch (cause) {
    error.value = cause instanceof Error ? cause.message : t('errors.unknown')
  } finally {
    saving.value = false
  }
}
</script>

<template>
  <BasicModal
    :open="open"
    :title="title"
    :width="640"
    :confirm-loading="saving"
    :centered="!mobile"
    class="user-form-modal"
    :wrap-class-name="mobile ? 'user-form-mobile-wrap' : undefined"
    :wrap-style="
      mobile
        ? {
            display: 'flex',
            alignItems: 'flex-start',
            justifyContent: 'center',
            padding: '12px',
            height: `min(100%, ${visibleHeight}px)`,
          }
        : undefined
    "
    :style="mobile ? { top: 0, paddingBottom: 0, maxWidth: '100%', margin: 0 } : undefined"
    @update:open="emit('update:open', $event)"
    @confirm="save"
  >
    <template #title>
      <div class="form-heading">
        <span class="form-icon"><EditOutlined v-if="user" /><UserAddOutlined v-else /></span>
        <div>
          <h2>{{ title }}</h2>
          <p>{{ $t(user ? 'user.editDescription' : 'user.createDescription') }}</p>
        </div>
      </div>
    </template>
    <div class="user-form-body">
      <a-alert v-if="error" :message="error" type="error" show-icon class="form-error" />
      <a-form
        ref="formRef"
        :model="form"
        :rules="rules"
        layout="vertical"
        :disabled="saving"
        :scroll-to-first-error="true"
        class="user-form"
        @finish="save"
      >
        <a-form-item name="username" :label="$t('user.username')"
          ><a-input v-model:value="form.username" :placeholder="$t('user.usernamePlaceholder')"
        /></a-form-item>
        <a-form-item name="fullName" :label="$t('user.fullName')"
          ><a-input v-model:value="form.fullName" :placeholder="$t('user.fullNamePlaceholder')"
        /></a-form-item>
        <a-form-item name="email" :label="$t('user.email')" class="form-wide"
          ><a-input
            v-model:value="form.email"
            type="email"
            :placeholder="$t('user.emailPlaceholder')"
        /></a-form-item>
        <a-form-item name="phone" :label="$t('user.phone')"
          ><a-input v-model:value="form.phone" placeholder="+84901234567"
        /></a-form-item>
        <a-form-item name="status" :label="$t('user.status')">
          <a-select v-model:value="form.status" :get-popup-container="selectContainer">
            <a-select-option :value="1"
              ><span class="status-label"><i />{{ $t('common.active') }}</span></a-select-option
            >
            <a-select-option :value="0"
              ><span class="status-label"
                ><i class="inactive" />{{ $t('common.inactive') }}</span
              ></a-select-option
            >
          </a-select>
        </a-form-item>
        <button type="submit" class="form-submit" tabindex="-1" aria-hidden="true" />
      </a-form>
    </div>
    <template #footer="{ close }"
      ><div class="form-footer">
        <span>{{ $t('user.requiredNote') }}</span>
        <div>
          <a-button :disabled="saving" @click="close">{{ $t('common.cancel') }}</a-button
          ><a-button type="primary" :loading="saving" @click="save"
            ><template #icon><SaveOutlined aria-hidden="true" /></template
            >{{ $t('common.save') }}</a-button
          >
        </div>
      </div></template
    >
  </BasicModal>
</template>

<style scoped>
.form-heading {
  display: flex;
  align-items: center;
  gap: 14px;
  padding: 0 26px 18px 0;
  border-bottom: 1px solid #eeeaf6;
}
.form-heading > div {
  min-width: 0;
  overflow-wrap: anywhere;
}
.form-heading h2 {
  margin: 0;
  font-size: 20px;
  color: #17143d;
}
.form-heading p {
  margin: 3px 0 0;
  color: #77708d;
  font-size: 14px;
  font-weight: 400;
}
.form-icon {
  display: grid;
  place-items: center;
  flex: 0 0 48px;
  height: 48px;
  border-radius: 10px;
  background: #eee9ff;
  color: #7357cf;
  font-size: 24px;
}
.user-form-body {
  min-width: 0;
  max-height: calc(100dvh - 245px);
  overflow: auto;
  padding: 14px 2px 2px;
}
.user-form {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 0 16px;
}
.user-form :deep(.ant-form-item) {
  min-width: 0;
  margin-bottom: 22px;
}
.user-form :deep(.ant-form-item-control),
.user-form :deep(.ant-form-item-control-input),
.user-form :deep(.ant-form-item-control-input-content) {
  min-width: 0;
  max-width: 100%;
}
.user-form :deep(.ant-input),
.user-form :deep(.ant-select) {
  width: 100%;
  height: 36px;
}
.user-form :deep(.ant-select) {
  display: block;
}
.user-form :deep(.ant-select-selector) {
  height: 100%;
  align-items: center;
}
.user-form :deep(.ant-select-selection-item) {
  display: flex;
  align-items: center;
  line-height: normal;
}
.form-wide {
  grid-column: 1 / -1;
}
.form-error {
  margin-bottom: 16px;
}
.status-label {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  line-height: 20px;
}
.status-label i {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: #168242;
  box-shadow: 0 0 0 5px #e9faed;
  margin-inline: 5px;
}
.status-label i.inactive {
  background: #827b91;
  box-shadow: 0 0 0 5px #f0edf5;
}
.form-footer {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 16px;
  padding-top: 16px;
  border-top: 1px solid #eeeaf6;
}
.form-footer > span {
  color: #847b99;
  font-size: 13px;
}
.form-footer > div {
  display: flex;
  min-width: 0;
  gap: 12px;
}
.form-footer button {
  height: 32px;
  min-width: 72px;
}
.form-submit {
  display: none;
}
@media (max-width: 599px) {
  /* Ant teleports this root without Vue's scope attribute; namespace every
     portal selector to this module's form modal. */
  :global(.user-form-mobile-wrap .user-form-modal) {
    display: flex;
    flex-direction: column;
    min-width: 0;
    min-height: 0;
    max-height: 100%;
  }
  :global(.user-form-mobile-wrap .user-form-modal > div:first-child),
  :global(.user-form-mobile-wrap .user-form-modal .ant-modal-content) {
    display: flex;
    flex-direction: column;
    flex: 1 1 auto;
    min-width: 0;
    min-height: 0;
  }
  :global(.user-form-mobile-wrap .user-form-modal .ant-modal-content) {
    padding: 16px;
  }
  :global(.user-form-mobile-wrap .user-form-modal .ant-modal-header),
  :global(.user-form-mobile-wrap .user-form-modal .ant-modal-footer) {
    flex: none;
    min-width: 0;
  }
  :global(.user-form-mobile-wrap .user-form-modal .ant-modal-body) {
    min-width: 0;
    min-height: 0;
    overflow: auto;
  }
  :global(.user-form-mobile-wrap .user-form-modal .ant-modal-close) {
    top: 8px;
    inset-inline-end: 8px;
    width: 44px;
    height: 44px;
  }
  .form-heading {
    gap: 10px;
    padding-inline-end: 32px;
  }
  .form-heading h2 {
    font-size: 18px;
  }
  .form-heading p {
    font-size: 13px;
  }
  .user-form {
    grid-template-columns: minmax(0, 1fr);
  }
  .user-form-body {
    max-height: none;
    overflow: visible;
  }
  .form-footer {
    align-items: stretch;
    flex-direction: column;
    gap: 14px;
  }
  .form-footer > div > button {
    flex: 1;
    height: 44px;
    min-width: 0;
  }
}
</style>
