<template>
  <nav id="navbar">
    <a id="logo" href="http://localhost:3000">
      <img src="https://i.imgur.com/uIOrnUi.png" width="100" height="28" />
    </a>
    <div id="navbar-buttons">
      <NavbarButton content="Log in" redirect="login"></NavbarButton>
      <NavbarButton content="Create account" redirect="register"></NavbarButton>
    </div>
  </nav>
</template>

<script lang="ts">
import NavbarButton from "@/components/NavbarButton.vue";

export default {
  components: {
    NavbarButton,
  },
};
</script>

<style scoped>
#logo:hover {
  transition: opacity 0.3s;
  opacity: 80%;
}

#navbar {
  background-color: #474747;
  width: 100vw;
  height: 4.5vh;
  min-height: 55px;

  display: flex;
  flex-direction: row;
  justify-content: space-between;
  align-items: center;
  padding-left: 10px;
}

#navbar-buttons {
  width: 210px;
  margin-bottom: 4px;
  margin-right: 5px;
  display: flex;
  flex-direction: row;
  justify-content: space-evenly;
  align-items: center;
}
</style>
