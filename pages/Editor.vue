<template>
  <div id="editor-container">
    <Navbar />
    <div class="columns">
      <div class="column is-1">
        <EditorSidebar />
      </div>
      <div class="column">
        <div class="is-flex is-justify-content-center is-flex-direction-row">
          <Editor />
        </div>
      </div>
    </div>
  </div>
</template>

<script lang="ts">
import Navbar from "@/components/HomePageNavbar.vue";
import Editor from "@/components/Editor.vue";
import EditorSidebar from "@/components/EditorSidebar.vue";

export default {
  components: {
    Navbar,
    Editor,
    EditorSidebar,
  },
  head: {
    title: "Scriptio - Editor",
  },
};
</script>

<style scoped>
#editor-container {
  height: 100vh;
}

.columns {
  flex: 1;
  margin-top: 0;
}
</style>