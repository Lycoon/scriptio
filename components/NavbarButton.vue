<template>
  <div id="navbar-btn">
    <a :href="redirect" class="btn">
      {{ content }}
    </a>
  </div>
</template>

<script lang="ts">
export default {
  props: ["content", "redirect"],
};
</script>

<style scoped>
a {
  text-decoration: none;
}

.btn {
  font-size: 0.8rem;
  color: white;
  background-color: #47474700;

  padding-inline: 15px;
  padding-block: 5px;

  /* Border */
  border-style: solid;
  border-color: #a7a7a7;
  border-radius: 15px;
  border-width: 2px;
}

.btn:hover {
  transition: background-color 0.2s;
  background-color: #686868;
}

.btn:active {
  transition: transform 0.25s;
  transform: scale(0.85);
}
</style>