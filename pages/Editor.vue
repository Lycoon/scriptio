<template>
  <div class="editor">
    <Navbar />
    <Editor />
    <HomePageFooter />
  </div>
</template>

<script lang="ts">
import Navbar from "@/components/HomePageNavbar.vue";
import Editor from "@/components/Editor.vue";

export default {
  components: {
    Navbar,
    Editor,
  },
  head: {
    title: "Scriptio - Editor",
  },
};
</script>
