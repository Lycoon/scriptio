<template>
  <div id="app">
    <link
      rel="stylesheet"
      href="https://fonts.googleapis.com/css?family=Poppins"
    />
    <router-view />
  </div>
</template>

<style>
#app {
  font-family: Poppins, sans-serif;
  -webkit-font-smoothing: antialiased;
  -moz-osx-font-smoothing: grayscale;
  color: #2c3e50;
}

::-webkit-scrollbar {
  display: none;
}

@import "https://cdn.jsdelivr.net/npm/bulma@0.9.3/css/bulma.min.css";
</style>
