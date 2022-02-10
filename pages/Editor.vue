<template>
  <div class="main-container">
    <HomePageNavbar class="navbar" />
    <EditorPage />
  </div>
</template>

<script lang="ts">
export default {
  head: {
    title: "Scriptio - Editor",
  },
};
</script>

<style scoped>
.navbar {
  position: absolute;
}
</style>