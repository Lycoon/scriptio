<template>
  <div id="editor-and-sidebar">
    <div id="editor-container">
      <EditorComponent />
    </div>
    <EditorSidebar class="sidebar" />
  </div>
</template>

<style scoped>
#editor-and-sidebar {
  display: flex;
  flex-direction: row;
  justify-content: space-between;
  padding-top: max(4.5vh, 55px);
  height: 100%;
}

#editor-container {
  display: flex;
  flex-direction: row;
  justify-content: center;
  align-items: center;
  width: 100%;
}
</style>