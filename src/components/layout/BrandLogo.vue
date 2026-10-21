<script setup lang="ts">
import logo from '@/assets/logo.svg'
import inverseLogo from '@/assets/logo-inverse.svg'

withDefaults(
  defineProps<{
    variant?: 'light' | 'inverse'
    decorative?: boolean
    label?: string
  }>(),
  {
    variant: 'light',
    decorative: false,
    label: import.meta.env.VITE_APP_TITLE,
  },
)
</script>

<template>
  <span
    class="brand-logo"
    :role="decorative ? undefined : 'img'"
    :aria-hidden="decorative ? true : undefined"
    :aria-label="decorative ? undefined : label"
  >
    <img :src="variant === 'inverse' ? inverseLogo : logo" alt="" aria-hidden="true" />
  </span>
</template>

<style scoped>
.brand-logo {
  display: inline-flex;
  flex: 0 0 auto;
  width: 48px;
  height: 48px;
  vertical-align: middle;
}
.brand-logo img {
  display: block;
  width: 100%;
  height: 100%;
}
</style>
