<script setup lang="ts">
import { useWindowSize } from '@vueuse/core'
import { BasicModal } from '@/components'

withDefaults(
  defineProps<{
    open: boolean
    title: string
    description?: string
    width?: number
    saving?: boolean
    confirmDisabled?: boolean
  }>(),
  { description: '', width: 640, saving: false, confirmDisabled: false },
)
const emit = defineEmits<{ 'update:open': [open: boolean]; confirm: [] }>()
const { height } = useWindowSize({ type: 'visual' })
</script>

<template>
  <BasicModal
    :open="open"
    :title="title"
    :width="width"
    :confirm-loading="saving"
    class="role-dialog"
    wrap-class-name="role-dialog-wrap"
    :wrap-style="{ height: `min(100%, ${height}px)` }"
    :style="{ maxHeight: `${Math.max(0, height - 24)}px` }"
    @update:open="emit('update:open', $event)"
    @confirm="emit('confirm')"
  >
    <template #title>
      <div class="role-dialog-heading">
        <span class="role-dialog-icon"><slot name="icon" /></span>
        <div>
          <h2>{{ title }}</h2>
          <p v-if="description">{{ description }}</p>
        </div>
      </div>
    </template>
    <slot />
    <template #footer="{ close }">
      <div class="role-dialog-footer">
        <a-button :disabled="saving" @click="close">{{ $t('common.cancel') }}</a-button>
        <a-button
          type="primary"
          :loading="saving"
          :disabled="confirmDisabled"
          @click="emit('confirm')"
          >{{ $t('common.save') }}</a-button
        >
      </div>
    </template>
  </BasicModal>
</template>

<style scoped>
:global(.role-dialog-wrap) {
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 12px;
}
:global(.role-dialog-wrap .role-dialog) {
  display: flex;
  flex-direction: column;
  min-width: 0;
  min-height: 0;
  max-width: 100%;
  margin: 0;
  top: 0;
  padding: 0;
}
:global(.role-dialog-wrap .role-dialog > div:first-child),
:global(.role-dialog-wrap .role-dialog .ant-modal-content) {
  display: flex;
  flex-direction: column;
  min-width: 0;
  min-height: 0;
  max-height: inherit;
}
:global(.role-dialog-wrap .role-dialog .ant-modal-content) {
  border-radius: 12px;
}
:global(.role-dialog-wrap .role-dialog .ant-modal-header),
:global(.role-dialog-wrap .role-dialog .ant-modal-footer) {
  flex: none;
  min-width: 0;
}
:global(.role-dialog-wrap .role-dialog .ant-modal-body) {
  display: flex;
  flex-direction: column;
  min-width: 0;
  min-height: 0;
  overflow: auto;
}
:global(.role-dialog-wrap .role-dialog .ant-modal-close) {
  inset-inline-end: 8px;
  top: 8px;
  width: 44px;
  height: 44px;
}
.role-dialog-heading {
  display: flex;
  align-items: center;
  gap: 14px;
  padding: 0 30px 16px 0;
  border-bottom: 1px solid #eeeaf6;
}
.role-dialog-heading > div {
  min-width: 0;
  overflow-wrap: anywhere;
}
.role-dialog-heading h2 {
  margin: 0;
  font-size: 20px;
  color: #17143d;
}
.role-dialog-heading p {
  margin: 3px 0 0;
  font-size: 14px;
  font-weight: 400;
  color: #77708d;
}
.role-dialog-icon {
  display: grid;
  place-items: center;
  flex: 0 0 46px;
  height: 46px;
  border-radius: 12px;
  background: #eee9ff;
  color: #7357cf;
  font-size: 24px;
}
.role-dialog-footer {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  padding-top: 14px;
  border-top: 1px solid #eeeaf6;
}
.role-dialog-footer button {
  min-width: 76px;
}
@media (max-width: 767px) {
  :global(.role-dialog-wrap) {
    align-items: flex-start;
  }
  :global(.role-dialog-wrap .role-dialog .ant-modal-content) {
    padding: 16px;
  }
  .role-dialog-heading {
    gap: 10px;
  }
  .role-dialog-heading h2 {
    font-size: 18px;
  }
  .role-dialog-heading p {
    font-size: 13px;
  }
  .role-dialog-footer button {
    flex: 1;
    min-width: 0;
    height: 44px;
  }
}
</style>
