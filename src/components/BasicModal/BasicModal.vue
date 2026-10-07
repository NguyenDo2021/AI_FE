<script setup lang="ts">
const props = withDefaults(
  defineProps<{
    open: boolean
    title: string
    confirmLoading?: boolean
    destroyOnClose?: boolean
    width?: number | string
  }>(),
  { confirmLoading: false, destroyOnClose: true, width: 600 },
)
const emit = defineEmits<{
  'update:open': [open: boolean]
  confirm: []
  cancel: []
}>()

const close = (): void => {
  if (props.confirmLoading) return
  emit('update:open', false)
  emit('cancel')
}
</script>

<template>
  <a-modal
    :open="props.open"
    :title="props.title"
    :confirm-loading="props.confirmLoading"
    :closable="!props.confirmLoading"
    :mask-closable="!props.confirmLoading"
    :keyboard="!props.confirmLoading"
    :destroy-on-close="props.destroyOnClose"
    :width="props.width"
    @ok="emit('confirm')"
    @cancel="close"
  >
    <slot />
    <template #footer>
      <slot
        name="footer"
        :close="close"
        :confirm="() => emit('confirm')"
        :loading="props.confirmLoading"
      >
        <a-button :disabled="props.confirmLoading" @click="close">{{
          $t('common.cancel')
        }}</a-button>
        <a-button type="primary" :loading="props.confirmLoading" @click="emit('confirm')">
          {{ $t('common.save') }}
        </a-button>
      </slot>
    </template>
  </a-modal>
</template>
