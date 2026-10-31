<script setup lang="ts">
import { FileTextOutlined, ExclamationCircleOutlined } from '@ant-design/icons-vue'
import { BasicModal } from '@/components'

withDefaults(
  defineProps<{
    open: boolean
    title: string
    width?: number
    saving?: boolean
    danger?: boolean
    instant?: boolean
  }>(),
  { width: 850, saving: false, danger: false, instant: false },
)
const emit = defineEmits<{ 'update:open': [value: boolean] }>()
</script>

<template>
  <a-config-provider
    :theme="{ token: { colorPrimary: '#7357cf', colorLink: '#7357cf', borderRadius: 8 } }"
  >
    <BasicModal
      :open="open"
      :title="title"
      :width="width"
      :confirm-loading="saving"
      :destroy-on-close="false"
      :transition-name="instant ? '' : undefined"
      :mask-transition-name="instant ? '' : undefined"
      wrap-class-name="return-refund-dialog"
      @update:open="emit('update:open', false)"
    >
      <template #title>
        <div class="dialog-heading">
          <span class="dialog-icon" :class="{ 'dialog-icon-danger': danger }">
            <ExclamationCircleOutlined v-if="danger" aria-hidden="true" />
            <FileTextOutlined v-else aria-hidden="true" />
          </span>
          <span>{{ title }}</span>
        </div>
      </template>
      <div class="rr-dialog-body"><slot /></div>
      <template #footer
        ><div class="dialog-footer"><slot name="footer" /></div
      ></template>
    </BasicModal>
  </a-config-provider>
</template>

<style scoped>
.dialog-heading {
  display: flex;
  align-items: center;
  gap: 12px;
  color: #302640;
}
.dialog-icon {
  display: grid;
  place-items: center;
  flex: 0 0 36px;
  height: 36px;
  border-radius: 10px;
  background: #f2ecfc;
  color: #7950d7;
  font-size: 20px;
}
.dialog-icon-danger {
  background: #fff0f2;
  color: #d6394c;
}
.dialog-footer {
  display: flex;
  justify-content: flex-end;
  flex-wrap: wrap;
  gap: 8px;
}
.dialog-footer :deep(.ant-btn) {
  max-width: 100%;
  height: auto;
  min-height: 34px;
  white-space: normal;
  margin-inline-start: 0;
}
.rr-dialog-body,
.rr-dialog-body :deep(.rr-stack) {
  display: flex;
  flex-direction: column;
  gap: 14px;
  min-width: 0;
}
.rr-dialog-body :deep(.ant-spin-container) {
  display: flex;
  flex-direction: column;
  gap: 14px;
  min-width: 0;
}
.rr-dialog-body :deep(.ant-alert-message),
.rr-dialog-body :deep(.ant-alert-description),
.rr-dialog-body :deep(.rr-field-error) {
  overflow-wrap: anywhere;
}
.rr-dialog-body :deep(.rr-form) {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 0 16px;
}
.rr-dialog-body :deep(.rr-wide) {
  grid-column: 1 / -1;
  min-width: 0;
}
.rr-dialog-body :deep(.ant-form-item) {
  min-width: 0;
  margin-bottom: 14px;
}
.rr-dialog-body :deep(.ant-picker),
.rr-dialog-body :deep(.ant-select) {
  width: 100%;
  min-width: 0;
}
.rr-dialog-body :deep(.rr-info) {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 0 24px;
  margin: 0;
}
.rr-dialog-body :deep(.rr-info > div) {
  display: grid;
  grid-template-columns: 120px minmax(0, 1fr);
  gap: 12px;
  min-width: 0;
  padding: 10px 0;
  border-bottom: 1px solid #f0edf5;
}
.rr-dialog-body :deep(.rr-info dt) {
  color: #797184;
  font-size: 13px;
}
.rr-dialog-body :deep(.rr-info dd) {
  margin: 0;
  min-width: 0;
  white-space: pre-wrap;
  overflow-wrap: anywhere;
}
.rr-dialog-body :deep(.rr-identifiers) {
  border: 1px solid #e9e0fc;
  border-radius: 10px;
  overflow: hidden;
}
.rr-dialog-body :deep(.rr-identifiers > summary) {
  padding: 10px 14px;
  cursor: pointer;
  color: #61469c;
  background: #f5f0ff;
  font-weight: 500;
}
.rr-dialog-body :deep(.rr-identifiers .rr-info) {
  padding: 4px 14px 12px;
}
.rr-dialog-body :deep(.rr-section-title) {
  margin: 2px 0 0;
  color: #61469c;
  font-size: 15px;
  font-weight: 600;
}
.rr-dialog-body :deep(.rr-help) {
  margin: 0;
  color: #797184;
  font-size: 13px;
  line-height: 1.6;
}
.rr-dialog-body :deep(.rr-line-toolbar) {
  display: flex;
  align-items: center;
  justify-content: space-between;
  flex-wrap: wrap;
  gap: 10px;
}
.rr-dialog-body :deep(.rr-table) {
  min-width: 0;
}
.rr-dialog-body :deep(.rr-table .ant-table) {
  font-size: 14px;
}
.rr-dialog-body :deep(.rr-table .ant-table-thead > tr > th) {
  background: #f8f6fc;
  color: #625b70;
  padding: 10px 12px;
}
.rr-dialog-body :deep(.rr-table .ant-table-tbody > tr > td) {
  padding: 10px 12px;
}
.rr-dialog-body :deep(.rr-table .basic-table__toolbar) {
  display: none;
}
.rr-dialog-body :deep(.rr-text) {
  display: block;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.rr-dialog-body :deep(.rr-money) {
  color: #7357cf;
  font-weight: 600;
  font-variant-numeric: tabular-nums;
  white-space: nowrap;
}
.rr-dialog-body :deep(.rr-quantity) {
  text-align: right;
  font-variant-numeric: tabular-nums;
}
.rr-dialog-body :deep(.rr-field-error) {
  display: block;
  color: #d6394c;
}
:global(.return-refund-dialog .ant-modal) {
  top: 16px;
  max-width: calc(100vw - 24px);
  padding-bottom: 16px;
}
:global(.return-refund-dialog .ant-modal-content) {
  display: flex;
  flex-direction: column;
  max-height: calc(100dvh - 32px);
  padding: 0;
  overflow: hidden;
  border-radius: 12px;
}
:global(.return-refund-dialog .ant-modal-header) {
  flex-shrink: 0;
  padding: 16px 56px 16px 20px;
  margin: 0;
  border-bottom: 1px solid #ece7f3;
}
:global(.return-refund-dialog .ant-modal-body) {
  min-height: 0;
  overflow: auto;
  overscroll-behavior: contain;
  padding: 18px 20px;
}
:global(.return-refund-dialog .ant-modal-footer) {
  flex-shrink: 0;
  margin: 0;
  padding: 12px 20px;
  border-top: 1px solid #ece7f3;
  background: #faf9fc;
}
@media (max-width: 650px) {
  .rr-dialog-body :deep(.rr-form),
  .rr-dialog-body :deep(.rr-info) {
    grid-template-columns: minmax(0, 1fr);
  }
  .dialog-footer {
    justify-content: flex-start;
  }
  :global(.return-refund-dialog .ant-modal-body) {
    padding: 14px;
  }
  :global(.return-refund-dialog .ant-modal-header),
  :global(.return-refund-dialog .ant-modal-footer) {
    padding-inline-start: 14px;
  }
}
@media (max-height: 650px) {
  :global(.return-refund-dialog .ant-modal) {
    top: 8px;
    padding-bottom: 8px;
  }
  :global(.return-refund-dialog .ant-modal-content) {
    max-height: calc(100dvh - 16px);
  }
  :global(.return-refund-dialog .ant-modal-header) {
    padding-block: 10px;
  }
}
</style>
