<template>
  <div id="home-container">
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

<style scoped>
#home-container {
  display: flex;
  flex-direction: column;
  min-height: 100vh;
}
</style>
