<script setup lang="ts">
const props = withDefaults(
  defineProps<{
    open: boolean
    title: string
    confirmLoading?: boolean
    destroyOnClose?: boolean
    width?: number | string
  }>(),
  { confirmLoading: false, destroyOnClose: true, width: 520 },
)
const emit = defineEmits<{
  'update:open': [open: boolean]
  confirm: []
  cancel: []
}>()

const close = (): void => {
  emit('update:open', false)
  emit('cancel')
}
</script>

<template>
  <a-drawer
    :open="props.open"
    :title="props.title"
    :width="props.width"
    :destroy-on-close="props.destroyOnClose"
    :footer-style="{ textAlign: 'right' }"
    @close="close"
  >
    <slot />
    <template #footer>
      <slot name="footer" :close="close" :confirm="() => emit('confirm')" :loading="props.confirmLoading">
        <a-button @click="close">{{ $t('common.cancel') }}</a-button>
        <a-button type="primary" :loading="props.confirmLoading" @click="emit('confirm')">
          {{ $t('common.save') }}
        </a-button>
      </slot>
    </template>
  </a-drawer>
</template>
