<template>
  <div id="editor">
    <client-only>
      <editor-content :editor="editor" />
    </client-only>
  </div>
</template>

<style>
@import "~/assets/css/scriptio.css";

#editor > div {
  width: 100%;
  height: 100%;
}

#editor {
  aspect-ratio: 0.707; /* A4 format */
  height: min(80vh, 60vw);
  overflow: scroll;

  box-shadow: 0px 0px 8px 0px rgba(192, 198, 198, 0.75);
}
</style>

<script lang="ts">
import { Editor, EditorContent } from "@tiptap/vue-3";
import { Node } from "@tiptap/core";
import StarterKit from "@tiptap/starter-kit";

const SceneHeading = Node.create({
  name: "sceneHeading",
});

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
      extensions: [StarterKit, SceneHeading],
    });

    //this.$store.state.setEditor(this.editor);
  },

  beforeDestroy() {
    this.editor.destroy();
  },
};
</script>