<template>
  <main class="blank-page" aria-label="Motion new tab page">
    <MainHeader />
    <MainWorkspace />
    <TabPanel />
  </main>
</template>

<script setup>
import MainHeader from './components/MainHeader.vue';
import MainWorkspace from './components/MainWorkspace.vue';
import TabPanel from './components/TabPanel.vue';
</script>