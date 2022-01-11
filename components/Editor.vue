<template>
  <div id="editor">
    <h1 id="editor-title">Editor</h1>
    <client-only>
      <editor-content :editor="editor" />
    </client-only>
  </div>
</template>

<script>
import { Editor, EditorContent } from "@tiptap/vue-3";
import StarterKit from "@tiptap/starter-kit";
export default {
  components: {
    EditorContent,
  },
  data() {
    return {
      editor: null,
    };
  },
  mounted() {
    this.editor = new Editor({
      content: "<p>I’m running Tiptap with Vue.js. 🎉</p>",
      extensions: [StarterKit],
    });
  },
  beforeDestroy() {
    this.editor.destroy();
  },
};
</script>

<style scoped>
#editor {
  min-width: 35vw;
  height: 100%;
  max-height: 100%;
}

#editor-title {
  font-size: 2rem;
  margin-top: 5%;
  margin-bottom: 2%;
}
</style>