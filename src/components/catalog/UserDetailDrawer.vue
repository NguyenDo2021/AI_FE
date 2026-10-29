<script setup lang="ts">
import { computed } from 'vue'
import { useMediaQuery } from '@vueuse/core'
import { useI18n } from 'vue-i18n'
import { CloseOutlined } from '@ant-design/icons-vue'
import type { User } from '@/types/user'

const props = defineProps<{ open: boolean; user: User | null; returnFocus?: HTMLElement | null }>()
const emit = defineEmits<{ 'update:open': [open: boolean] }>()
const { t } = useI18n()
const mobile = useMediaQuery('(max-width: 767px)')
const viewportHeight =
  typeof CSS !== 'undefined' && CSS.supports('height', '100dvh') ? '100dvh' : '100vh'
const fields = computed(() =>
  props.user
    ? [
        { label: t('user.username'), value: props.user.username || '—' },
        { label: t('user.fullName'), value: props.user.fullName || '—' },
        { label: t('user.email'), value: props.user.email || '—' },
        { label: t('user.phone'), value: props.user.phone || '—' },
      ]
    : [],
)
const close = (): void => emit('update:open', false)
const afterOpenChange = (open: boolean): void => {
  if (!open && props.returnFocus?.isConnected) props.returnFocus.focus({ preventScroll: true })
}
</script>

<template>
  <a-drawer
    :open="open"
    :width="mobile ? '100%' : 520"
    :closable="false"
    :destroy-on-close="false"
    :root-style="{ height: `min(100%, ${viewportHeight})`, minHeight: 0 }"
    :content-wrapper-style="{ maxWidth: '100%', minWidth: 0 }"
    :drawer-style="{ minWidth: 0, minHeight: 0 }"
    :header-style="{ padding: mobile ? '12px 16px' : '16px 24px', flexShrink: 0, minWidth: 0 }"
    :body-style="{ padding: mobile ? '16px' : '24px', minWidth: 0, minHeight: 0, overflow: 'auto' }"
    :footer-style="{
      padding: mobile ? '12px 16px' : '10px 24px',
      flexShrink: 0,
      textAlign: 'right',
    }"
    @close="close"
    @after-open-change="afterOpenChange"
  >
    <template #title>
      <div class="detail-heading">
        <a-button type="text" class="detail-close" :aria-label="$t('user.close')" @click="close"
          ><template #icon><CloseOutlined aria-hidden="true" /></template
        ></a-button>
        <h2>{{ $t('user.detail') }}</h2>
      </div>
    </template>
    <div v-if="user" class="user-detail" :class="{ 'user-detail--mobile': mobile }">
      <dl v-if="mobile" class="detail-fields">
        <div v-for="field in fields" :key="field.label" class="detail-field">
          <dt>{{ field.label }}</dt>
          <dd>{{ field.value }}</dd>
        </div>
        <div class="detail-field">
          <dt>{{ $t('user.status') }}</dt>
          <dd>
            <a-tag :color="user.status === 1 ? 'success' : 'default'">{{
              $t(user.status === 1 ? 'common.active' : 'common.inactive')
            }}</a-tag>
          </dd>
        </div>
      </dl>
      <a-descriptions v-else bordered :column="1">
        <a-descriptions-item v-for="field in fields" :key="field.label" :label="field.label">{{
          field.value
        }}</a-descriptions-item>
        <a-descriptions-item :label="$t('user.status')"
          ><a-tag :color="user.status === 1 ? 'success' : 'default'">{{
            $t(user.status === 1 ? 'common.active' : 'common.inactive')
          }}</a-tag></a-descriptions-item
        >
      </a-descriptions>
    </div>
    <template #footer
      ><div class="detail-footer">
        <a-button @click="close">{{ $t('user.close') }}</a-button>
      </div></template
    >
  </a-drawer>
</template>

<style scoped>
.detail-heading {
  display: flex;
  align-items: center;
  gap: 12px;
  min-width: 0;
}
.detail-heading h2 {
  flex: 1;
  min-width: 0;
  margin: 0;
  font-size: 16px;
  line-height: 1.5;
  overflow-wrap: anywhere;
}
.detail-close {
  flex: 0 0 32px;
  width: 32px;
  height: 32px;
  padding: 0;
  color: #847b99;
}
.detail-close:focus-visible {
  outline: 2px solid #7357cf;
  outline-offset: 2px;
}
.user-detail {
  min-width: 0;
  overflow-wrap: anywhere;
}
.user-detail :deep(.ant-descriptions-view) {
  min-width: 0;
}
.user-detail :deep(table) {
  width: 100%;
}
.user-detail :deep(.ant-descriptions-item-content) {
  overflow-wrap: anywhere;
}
.user-detail :deep(.ant-tag) {
  max-width: 100%;
  margin: 0;
  white-space: normal;
}
.detail-fields {
  display: grid;
  grid-template-columns: minmax(0, 1fr);
  gap: 0;
  margin: 0;
  min-width: 0;
  border: 1px solid #eeeaf6;
  border-radius: 8px;
}
.detail-field {
  min-width: 0;
  padding: 14px 16px;
  border-bottom: 1px solid #eeeaf6;
}
.detail-field:last-child {
  border-bottom: 0;
}
.detail-field dt {
  margin-bottom: 6px;
  color: #77708d;
  font-size: 13px;
}
.detail-field dd {
  min-width: 0;
  margin: 0;
  white-space: pre-wrap;
  overflow-wrap: anywhere;
}
.detail-footer {
  min-width: 0;
}
.detail-footer button {
  height: 32px;
  min-width: 80px;
}
@media (max-width: 767px) {
  .detail-close {
    flex-basis: 44px;
    width: 44px;
    height: 44px;
  }
  .detail-footer button {
    width: 100%;
    min-width: 0;
    height: 44px;
  }
}
</style>
