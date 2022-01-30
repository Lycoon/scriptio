<template>
  <div class="main-container">
    <HomePageNavbar />
    <HomePage />
    <HomePageFooter />
  </div>
</template>

<script lang="ts">
export default {
  head: {
    title: "Scriptio",
  },
};
</script>

<style>
.main-container {
  display: flex;
  flex-direction: column;
  min-height: 100vh;
}
</style>
