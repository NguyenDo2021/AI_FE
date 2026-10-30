<script setup lang="ts">
import { watch } from 'vue'
import { useMediaQuery } from '@vueuse/core'
import {
  HomeOutlined,
  SafetyCertificateOutlined,
  UserOutlined,
  InfoCircleFilled,
  CloseOutlined,
} from '@ant-design/icons-vue'
import type { User } from '@/types/user'

const props = defineProps<{
  open: boolean
  user: User | null
  title: string
  description: string
  note: string
  kind: 'warehouse' | 'role'
  busy?: boolean
}>()
const emit = defineEmits<{ 'update:open': [open: boolean] }>()
const mobile = useMediaQuery('(max-width: 599px)')
let trigger: HTMLElement | null = null
watch(
  () => props.open,
  (open) => {
    if (open)
      trigger = document.activeElement instanceof HTMLElement ? document.activeElement : null
  },
  { flush: 'sync' },
)
const close = (): void => {
  if (!props.busy) emit('update:open', false)
}
const afterOpenChange = (open: boolean): void => {
  if (!open && trigger?.isConnected) trigger.focus()
}
</script>

<template>
  <a-drawer
    :open="open"
    :width="mobile ? '100%' : 620"
    :closable="false"
    :mask-closable="!busy"
    :keyboard="!busy"
    :destroy-on-close="true"
    class="user-assignment-drawer"
    :header-style="{ padding: '22px 24px', borderBottom: '1px solid #eeeaf6' }"
    :body-style="{ padding: '20px 24px', minWidth: 0 }"
    :footer-style="{ padding: '16px 24px', borderTop: '1px solid #eeeaf6' }"
    @close="close"
    @after-open-change="afterOpenChange"
  >
    <template #extra>
      <a-button
        type="text"
        class="assignment-close"
        :aria-label="$t('user.close')"
        :disabled="busy"
        @click="close"
        ><template #icon><CloseOutlined aria-hidden="true" /></template
      ></a-button>
    </template>
    <template #title>
      <div class="assignment-heading">
        <span class="assignment-icon"
          ><HomeOutlined v-if="kind === 'warehouse'" /><SafetyCertificateOutlined v-else
        /></span>
        <div>
          <h2>{{ title }}</h2>
          <p>{{ description }}</p>
        </div>
      </div>
    </template>
    <div v-if="user" class="assignment-user">
      <span class="assignment-avatar"><UserOutlined aria-hidden="true" /></span>
      <div>
        <strong>{{ user.fullName || '—' }}</strong
        ><span>{{ user.username || '—' }}</span>
      </div>
    </div>
    <div class="assignment-content"><slot /></div>
    <div class="assignment-note">
      <InfoCircleFilled aria-hidden="true" /><span>{{ note }}</span>
    </div>
    <template #footer
      ><div class="assignment-footer"><slot name="footer" :close="close" /></div
    ></template>
  </a-drawer>
</template>

<style scoped>
.assignment-close {
  width: 32px;
  height: 32px;
  color: #847b99;
  font-size: 20px;
}
.assignment-heading,
.assignment-user {
  display: flex;
  align-items: center;
  gap: 16px;
  min-width: 0;
}
.assignment-heading > div,
.assignment-user > div {
  min-width: 0;
  overflow-wrap: anywhere;
}
.assignment-heading h2 {
  margin: 0;
  color: #17143d;
  font-size: 21px;
  line-height: 1.4;
}
.assignment-heading p {
  margin: 3px 0 0;
  color: #696480;
  font-size: 14px;
  font-weight: 400;
  line-height: 1.5;
}
.assignment-icon {
  display: grid;
  place-items: center;
  flex: 0 0 52px;
  height: 52px;
  border-radius: 12px;
  color: #7357cf;
  background: #eee9ff;
  font-size: 26px;
}
.assignment-user {
  padding: 20px;
  border-radius: 12px;
  background: #f3efff;
  margin-bottom: 22px;
}
.assignment-avatar {
  display: grid;
  place-items: center;
  flex: 0 0 56px;
  height: 56px;
  border-radius: 50%;
  background: #e4daff;
  color: #7357cf;
  font-size: 30px;
}
.assignment-user strong,
.assignment-user span:not(.assignment-avatar) {
  display: block;
}
.assignment-user strong {
  color: #17143d;
  font-size: 17px;
}
.assignment-user div > span {
  margin-top: 3px;
  color: #696480;
}
.assignment-content {
  min-width: 0;
}
.assignment-content :deep(.assignment-section-title) {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 10px;
  margin: 26px 0 14px;
  color: #17143d;
  font-size: 18px;
}
.assignment-content :deep(.assignment-count) {
  background: #eee9fc;
  border-radius: 8px;
  padding: 2px 10px;
  font-size: 14px;
  color: #503ba0;
}
.assignment-content :deep(.assignment-card) {
  display: flex;
  align-items: center;
  gap: 14px;
  min-width: 0;
  padding: 16px 14px;
  margin-bottom: 12px;
  border: 1px solid #e9e4f1;
  border-radius: 11px;
}
.assignment-content :deep(.assignment-card-icon) {
  display: grid;
  place-items: center;
  flex: 0 0 48px;
  height: 48px;
  background: #eee9ff;
  border-radius: 11px;
  color: #7357cf;
  font-size: 25px;
}
.assignment-content :deep(.assignment-card-copy) {
  display: grid;
  gap: 3px;
  flex: 1;
  min-width: 0;
  overflow-wrap: anywhere;
}
.assignment-content :deep(.assignment-card-copy strong) {
  color: #17143d;
  font-size: 16px;
}
.assignment-content :deep(.assignment-card-copy > span) {
  color: #696480;
}
.assignment-content :deep(.assignment-card-copy .ant-tag) {
  justify-self: start;
  max-width: 100%;
  white-space: normal;
}
.assignment-content :deep(.assignment-card > button) {
  flex-shrink: 0;
  height: 32px;
}
.assignment-note {
  display: flex;
  align-items: flex-start;
  gap: 12px;
  padding: 15px;
  margin-top: 24px;
  background: #f3efff;
  border-radius: 10px;
  color: #585171;
  line-height: 1.6;
  overflow-wrap: anywhere;
}
.assignment-note > .anticon {
  font-size: 24px;
  color: #7357cf;
  flex-shrink: 0;
  margin-top: 2px;
}
.assignment-footer {
  display: flex;
  justify-content: flex-end;
  gap: 12px;
}
.assignment-footer :deep(button) {
  height: 32px;
  min-width: 80px;
}
@media (max-width: 599px) {
  .assignment-close {
    width: 44px;
    height: 44px;
  }
  .assignment-content :deep(.assignment-card > button) {
    height: 44px;
  }
  .assignment-heading {
    gap: 10px;
  }
  .assignment-heading h2 {
    font-size: 18px;
  }
  .assignment-icon {
    flex-basis: 44px;
    height: 44px;
  }
  .assignment-user {
    padding: 16px;
    gap: 12px;
  }
  .assignment-footer :deep(button) {
    flex: 1;
    height: 44px;
    min-width: 0;
  }
  .assignment-content :deep(.assignment-card) {
    flex-wrap: wrap;
    gap: 12px;
    padding: 14px 12px;
  }
  .assignment-content :deep(.assignment-card-copy) {
    flex-basis: calc(100% - 64px);
  }
  .assignment-content :deep(.assignment-card > button) {
    margin-inline-start: 60px;
  }
}
</style>
