<template>
  <div class="dashboard">
    <h1>{{ $t('dashboard.welcome') }}</h1>
    <p>{{ $t('dashboard.description') }}</p>
    <a-card class="dashboard__card">
      <a-statistic title="Vue 3" value="Enterprise" />
    </a-card>
  </div>
</template>

<style scoped>
.dashboard h1 {
  margin-bottom: 8px;
}

.dashboard p {
  color: #8c8c8c;
}

.dashboard__card {
  max-width: 280px;
  margin-top: 24px;
}
</style>
