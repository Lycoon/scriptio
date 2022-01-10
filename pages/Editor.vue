<template>
  <div class="editor">
    <Navbar />
    <div class="is-flex is-justify-content-center is-flex-direction-row">
      <Editor />
    </div>
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
