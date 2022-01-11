<template>
  <div id="home">
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
#home {
  height: 100vh;
  width: 100vw;
}
</style>