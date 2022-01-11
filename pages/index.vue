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
  min-height: 100%;
  display: flex;
  flex-direction: column;
  justify-content: space-between;
}
</style>
