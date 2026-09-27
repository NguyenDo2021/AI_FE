<script setup lang="ts">
import { reactive, ref, watch } from 'vue'
import type { FormInstance, Rule } from 'ant-design-vue'

export interface FormSchema {
  name: string
  label: string
  type?: 'input' | 'password' | 'email' | 'number' | 'select'
  placeholder?: string
  rules?: Rule[]
  options?: Array<{ label: string; value: string | number }>
}

const props = withDefaults(
  defineProps<{
    schema: FormSchema[]
    modelValue: Record<string, unknown>
    rules?: Record<string, Rule[]>
    loading?: boolean
    labelCol?: number
    wrapperCol?: number
  }>(),
  { rules: () => ({}), loading: false, labelCol: 6, wrapperCol: 18 },
)
const emit = defineEmits<{
  'update:modelValue': [value: Record<string, unknown>]
  submit: [value: Record<string, unknown>]
}>()

const formRef = ref<FormInstance>()
const formData = reactive<Record<string, unknown>>({ ...props.modelValue })

watch(
  () => props.modelValue,
  (value) => {
    Object.keys(formData).forEach((key) => {
      if (!(key in value)) delete formData[key]
    })
    Object.assign(formData, value)
  },
  { deep: true },
)

const updateValue = (): void => emit('update:modelValue', { ...formData })
const submit = async (): Promise<void> => {
  await formRef.value?.validate()
  emit('submit', { ...formData })
}
const resetFields = (): void => {
  formRef.value?.resetFields()
  Object.keys(formData).forEach((key) => delete formData[key])
  Object.assign(formData, props.modelValue)
  updateValue()
}

defineExpose({
  submit,
  resetFields,
  validate: () => formRef.value?.validate(),
  getValues: (): Record<string, unknown> => ({ ...formData }),
})
</script>

<template>
  <a-form
    ref="formRef"
    :model="formData"
    :rules="props.rules"
    :label-col="{ span: props.labelCol }"
    :wrapper-col="{ span: props.wrapperCol }"
    :scroll-to-first-error="true"
    @values-change="updateValue"
    @finish="submit"
  >
    <a-form-item v-for="field in props.schema" :key="field.name" :name="field.name" :label="field.label" :rules="field.rules">
      <a-select
        v-if="field.type === 'select'"
        v-model:value="formData[field.name]"
        :placeholder="field.placeholder"
        :options="field.options"
      />
      <a-input-password
        v-else-if="field.type === 'password'"
        v-model:value="formData[field.name]"
        :placeholder="field.placeholder"
      />
      <a-input-number
        v-else-if="field.type === 'number'"
        v-model:value="formData[field.name]"
        :placeholder="field.placeholder"
        class="basic-form__control"
      />
      <a-input
        v-else
        v-model:value="formData[field.name]"
        :type="field.type === 'email' ? 'email' : 'text'"
        :placeholder="field.placeholder"
      />
    </a-form-item>
    <slot :loading="props.loading" :submit="submit" :reset="resetFields" />
  </a-form>
</template>

<style scoped>
.basic-form__control {
  width: 100%;
}
</style>
