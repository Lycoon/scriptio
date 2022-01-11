<template>
  <div id="sidebar" class="sidebar-shadow tabs">
    <EditorTab />
    <EditorTab />
    <EditorTab />
    <EditorTab />
    <EditorTab />
    <EditorTab />
  </div>
</template>

<script>
import EditorTab from "@/components/EditorTab.vue";

export default {
  components: {
    EditorTab,
  },
};
</script>

<style scoped>
#sidebar {
  width: 100%;
  height: 100%;
  background: #f6f6f6;
  padding: 20px;
}

.sidebar-shadow {
  position: relative;
  box-shadow: 5px -5px 9px -3px rgba(0, 0, 0, 0.14);
}

.tabs {
  display: flex;
  flex-direction: column;
  justify-content: flex-start;
  align-items: center;
  gap: 15px;
}
</style>
