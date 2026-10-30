<script setup lang="ts">
import { computed } from 'vue'
import { useMediaQuery } from '@vueuse/core'
import { useI18n } from 'vue-i18n'
import { CloseOutlined } from '@ant-design/icons-vue'
import type { Role } from '@/types/role'
import { formatDateTime } from '@/utils'
import RoleIdentity from './RoleIdentity.vue'

const props = defineProps<{ open: boolean; role: Role | null; returnFocus?: HTMLElement | null }>()
const emit = defineEmits<{ 'update:open': [open: boolean] }>()
const { t } = useI18n()
const mobile = useMediaQuery('(max-width: 767px)')
const fields = computed(() =>
  props.role
    ? [
        { key: 'name', label: t('role.name'), value: props.role.name || '—' },
        { key: 'code', label: t('role.code'), value: props.role.code || '—' },
        { key: 'description', label: t('role.description'), value: props.role.description || '—' },
        {
          key: 'status',
          label: t('role.status'),
          value:
            props.role.status == null
              ? '—'
              : t(props.role.status === 1 ? 'common.active' : 'common.inactive'),
        },
        {
          key: 'createdAt',
          label: t('role.createdAt'),
          value: formatDateTime(props.role.createdAt) || '—',
        },
        {
          key: 'updatedAt',
          label: t('role.updatedAt'),
          value: formatDateTime(props.role.updatedAt) || '—',
        },
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
    :root-style="{ height: 'min(100%, 100dvh)', minHeight: 0 }"
    :content-wrapper-style="{ maxWidth: '100%', minWidth: 0 }"
    :drawer-style="{ minWidth: 0, minHeight: 0 }"
    :header-style="{ padding: mobile ? '12px 16px' : '16px 24px', flexShrink: 0, minWidth: 0 }"
    :body-style="{ padding: mobile ? '16px' : '24px', minWidth: 0, minHeight: 0, overflow: 'auto' }"
    :footer-style="{ padding: mobile ? '12px 16px' : '12px 24px', flexShrink: 0 }"
    @close="close"
    @after-open-change="afterOpenChange"
  >
    <template #title
      ><div class="role-detail-heading">
        <h2>{{ $t('role.detail') }}</h2>
        <a-button type="text" :aria-label="$t('role.close')" @click="close"
          ><template #icon><CloseOutlined aria-hidden="true" /></template
        ></a-button></div
    ></template>
    <div v-if="role" class="role-detail">
      <RoleIdentity :role="role" show-status />
      <dl class="role-detail-fields">
        <div v-for="field in fields" :key="field.key" class="role-detail-field">
          <dt>{{ field.label }}</dt>
          <dd>
            <a-tag
              v-if="field.key === 'status' && role.status != null"
              :color="role.status === 1 ? 'success' : 'default'"
              >{{ field.value }}</a-tag
            ><template v-else>{{ field.value }}</template>
          </dd>
        </div>
      </dl>
    </div>
    <template #footer
      ><div class="role-detail-footer">
        <a-button @click="close">{{ $t('role.close') }}</a-button>
      </div></template
    >
  </a-drawer>
</template>

<style scoped>
.role-detail-heading {
  display: flex;
  align-items: center;
  justify-content: space-between;
  min-width: 0;
  gap: 12px;
}
.role-detail-heading h2 {
  min-width: 0;
  margin: 0;
  font-size: 18px;
  overflow-wrap: anywhere;
}
.role-detail-heading button {
  flex: 0 0 40px;
  height: 40px;
}
.role-detail {
  min-width: 0;
  overflow-wrap: anywhere;
}
.role-detail-fields {
  margin: 16px 0 0;
}
.role-detail-field {
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(0, 2fr);
  gap: 12px;
  padding: 14px 0;
  border-bottom: 1px solid #eeeaf6;
}
.role-detail-field dt {
  font-weight: 600;
}
.role-detail-field dd {
  min-width: 0;
  margin: 0;
  white-space: pre-wrap;
  overflow-wrap: anywhere;
}
.role-detail-field :deep(.ant-tag) {
  max-width: 100%;
  margin: 0;
  white-space: normal;
}
.role-detail-footer {
  text-align: right;
}
.role-detail-footer button {
  min-width: 80px;
}
@media (max-width: 767px) {
  .role-detail-field {
    grid-template-columns: minmax(0, 1fr);
    gap: 6px;
  }
  .role-detail-field dt {
    font-size: 13px;
  }
  .role-detail-heading button {
    flex-basis: 44px;
    height: 44px;
  }
  .role-detail-footer button {
    width: 100%;
    height: 44px;
  }
}
</style>
