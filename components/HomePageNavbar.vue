<template>
  <nav id="navbar">
    <a class="logo" href="http://localhost:8000">
      <img src="https://i.imgur.com/uIOrnUi.png" width="100" height="28" />
    </a>
    <button>Log in</button>
    <button>Create account</button>
  </nav>
</template>

<style scoped>
#navbar {
  background-color: #555555;
  width: 100vw;
  min-height: 4.5vh;

  display: flex;
  flex-direction: row;
  justify-content: flex-start;
  align-items: center;
  gap: 15px;
  padding-left: 10px;
}
</style>
