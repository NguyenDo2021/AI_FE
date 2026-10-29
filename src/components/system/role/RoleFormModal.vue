<script setup lang="ts">
import { computed, nextTick, reactive, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { message, type FormInstance } from 'ant-design-vue'
import type { Rule } from 'ant-design-vue/es/form'
import { EditOutlined, SafetyCertificateOutlined } from '@ant-design/icons-vue'
import { createRole, updateRole } from '@/api/role/role.api'
import { validationRules } from '@/utils/validate'
import type { NormalizedApiError } from '@/utils/request'
import type { Role, UpdateRoleRequest } from '@/types/role'
import RoleDialog from './RoleDialog.vue'

const props = defineProps<{ open: boolean; role: Role | null }>()
const emit = defineEmits<{ 'update:open': [open: boolean]; saved: [] }>()
const { t } = useI18n()
const formRef = ref<FormInstance>()
const form = reactive<UpdateRoleRequest>({ name: '', code: '', description: '', status: 1 })
const saving = ref(false)
const validating = ref(false)
const error = ref('')
const title = computed(() => t(props.role ? 'role.edit' : 'role.add'))
const requiredTextRule = (maxLength: number): Rule => ({
  validator: (_rule, value) => {
    if (typeof value !== 'string' || !value.trim())
      return Promise.reject(new Error(t('role.required')))
    if (value.trim().length > maxLength)
      return Promise.reject(new Error(t('role.maxLength', { count: maxLength })))
    return Promise.resolve()
  },
  trigger: 'blur',
})
const rules = computed(() => ({
  name: [requiredTextRule(100)],
  code: [
    requiredTextRule(50),
    { pattern: /^\s*[A-Za-z][A-Za-z0-9_]*\s*$/, message: t('role.invalidCode'), trigger: 'blur' },
  ],
  description: [validationRules.max(500, t('role.descriptionMaxLength'))],
  status: [validationRules.required(t('role.required'))],
}))
watch([() => props.open, () => props.role], async () => {
  if (!props.open) return
  Object.assign(
    form,
    props.role
      ? {
          name: props.role.name,
          code: props.role.code,
          description: props.role.description ?? '',
          status: props.role.status,
        }
      : { name: '', code: '', description: '', status: 1 },
  )
  error.value = ''
  await nextTick()
  formRef.value?.clearValidate()
})
const save = async (): Promise<void> => {
  if (saving.value || validating.value || !formRef.value) return
  const id = props.role?.id
  validating.value = true
  try {
    await formRef.value.validate()
  } catch {
    return
  } finally {
    validating.value = false
  }
  if (!props.open || props.role?.id !== id) return
  saving.value = true
  error.value = ''
  const payload: UpdateRoleRequest = {
    name: String(form.name ?? '').trim(),
    code: String(form.code ?? '').trim(),
    description: typeof form.description === 'string' ? form.description.trim() : '',
    status: typeof form.status === 'number' ? form.status : 1,
  }
  try {
    if (id) await updateRole(id, payload)
    else await createRole(payload)
    message.success(t('role.saveSuccess'))
    emit('update:open', false)
    emit('saved')
  } catch (cause) {
    const apiError = cause as NormalizedApiError
    error.value =
      apiError.status === 409
        ? t('role.codeExists')
        : apiError.status === 403
          ? t('role.actionForbidden')
          : apiError.message || t('errors.unknown')
  } finally {
    saving.value = false
  }
}
</script>

<template>
  <RoleDialog
    :open="open"
    :title="title"
    :description="$t(role ? 'role.editDescription' : 'role.createDescription')"
    :saving="saving"
    @update:open="emit('update:open', $event)"
    @confirm="save"
  >
    <template #icon
      ><EditOutlined v-if="role" aria-hidden="true" /><SafetyCertificateOutlined
        v-else
        aria-hidden="true"
    /></template>
    <a-alert v-if="error" :message="error" type="error" show-icon class="role-form-error" />
    <a-form
      ref="formRef"
      :model="form"
      :rules="rules"
      layout="vertical"
      :disabled="saving"
      :scroll-to-first-error="true"
      class="role-form"
      @finish="save"
    >
      <a-form-item name="name" :label="$t('role.name')" required
        ><a-input v-model:value="form.name" :placeholder="$t('role.namePlaceholder')"
      /></a-form-item>
      <a-form-item name="code" :label="$t('role.code')" required
        ><a-input v-model:value="form.code" :placeholder="$t('role.codePlaceholder')"
      /></a-form-item>
      <a-form-item name="description" :label="$t('role.description')" class="role-form-wide"
        ><a-textarea
          v-model:value="form.description"
          :rows="4"
          show-count
          :placeholder="$t('role.descriptionPlaceholder')"
      /></a-form-item>
      <a-form-item name="status" :label="$t('role.status')"
        ><a-select
          v-model:value="form.status"
          :options="[
            { label: $t('common.active'), value: 1 },
            { label: $t('common.inactive'), value: 0 },
          ]"
      /></a-form-item>
      <button type="submit" hidden tabindex="-1" aria-hidden="true" />
    </a-form>
  </RoleDialog>
</template>

<style scoped>
.role-form {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 0 16px;
  padding: 14px 2px 0;
  min-width: 0;
}
.role-form :deep(.ant-form-item),
.role-form :deep(.ant-form-item-control),
.role-form :deep(.ant-form-item-control-input),
.role-form :deep(.ant-form-item-control-input-content) {
  min-width: 0;
  max-width: 100%;
}
.role-form :deep(.ant-form-item) {
  margin-bottom: 20px;
}
.role-form :deep(.ant-select) {
  width: 100%;
}
.role-form :deep(textarea) {
  resize: vertical;
}
.role-form-wide {
  grid-column: 1 / -1;
}
.role-form-error {
  margin-top: 12px;
}
@media (max-width: 599px) {
  .role-form {
    grid-template-columns: minmax(0, 1fr);
  }
}
</style>
