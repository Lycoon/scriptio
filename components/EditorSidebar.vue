<template>
  <div id="sidebar" class="sidebar-shadow tabs">
    <EditorTab @click="setSceneHeading" content="SCENE HEADING" />
    <EditorTab @click="setAction" content="Action" />
    <EditorTab @click="setCharacter" content="CHARACTER" />
    <EditorTab @click="setDialogue" content="Dialogue" />
    <EditorTab @click="setParenthetical" content="(Parenthetical)" />
    <EditorTab @click="setTransition" content="TRANSITION:" />
    <EditorTab @click="setActStart" content="ACT START" />
    <EditorTab @click="setActEnd" content="ACT END" />
    <EditorTab @click="setNote" content="[[Note]]" />
  </div>
</template>

<script lang="ts">
export default {
  methods: {
    setSceneHeading() {
      console.log("setSceneHeading");
      //console.log(this.$store.state.editor);
    },

    setAction() {
      console.log("setAction");
    },

    setCharacter() {
      console.log("setCharacter");
    },

    setDialogue() {
      console.log("setDialogue");
    },

    setParenthetical() {
      console.log("setParenthetical");
    },

    setTransition() {
      console.log("setTransition");
    },

    setActStart() {
      console.log("setActStart");
    },

    setActEnd() {
      console.log("setActEnd");
    },

    setNote() {
      console.log("setNote");
    },
  },
};
</script>

<style scoped>
#sidebar {
  padding-top: 20px;
  background: #f0f0f0;
  min-width: max(10vw, 22vh);
}

.sidebar-shadow {
  box-shadow: -6px 0px 4px -2px rgba(0, 0, 0, 0.15);
}

.tabs {
  display: flex;
  flex-direction: column;
  justify-content: flex-start;
}
</style>
