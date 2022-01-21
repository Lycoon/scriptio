<template>
  <div id="navbar-btn">
    <button onclick="window.location='login';" class="btn">
      {{ content }}
    </button>
  </div>
</template>

<script lang="ts">
export default {
  props: ["content"],
};
</script>

<style scoped>
.btn {
  font-size: 0.8rem;
  color: white;
  background-color: #47474700;

  padding-inline: 15px;
  padding-block: 5px;

  /* Border */
  border: solid;
  border-color: #dbdbdb;
  border-radius: 15px;
  border-width: 0.2em;
}

.btn:hover {
  transition: background-color 0.2s;
  background-color: #686868;
}

.btn:active {
  transition: transform 0.25s;
  transform: scale(0.95);
}
</style>