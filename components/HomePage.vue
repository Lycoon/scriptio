<template>
  <div id="homepage">
    <img class="home-pic home-pic-left" src="@/assets/left-shadowed.png" />
    <img class="home-pic home-pic-right" src="@/assets/right-shadowed.png" />
    <div id="homepage-text">
      <h1 id="scriptio-title" class="title">Scriptio</h1>
      <h2 id="scriptio-desc" class="title">
        Minimalist tool for perfectionist screenwriters
      </h2>
    </div>
  </div>
</template>

<script lang="ts">
import "animate.css";
</script>

<style>
@font-face {
  font-family: poetsen;
  src: URL("/assets/fonts/Poetsen.ttf") format("truetype");
}
@font-face {
  font-family: roboto-thin;
  src: URL("/assets/fonts/Roboto Thin.ttf") format("truetype");
}
@font-face {
  font-family: segoe-bold;
  src: URL("/assets/fonts/Segoe UI Bold.ttf") format("truetype");
}
@font-face {
  font-family: segoe-light;
  src: URL("/assets/fonts/Segoe UI Light.ttf") format("truetype");
}
@font-face {
  font-family: courier-prime;
  src: URL("/assets/fonts/Courier Prime.ttf") format("truetype");
}

.segoe-bold {
  font-family: segoe-bold;
}

.segoe-light {
  font-family: segoe-light;
}

.segoe {
  font-family: "Segoe UI";
}

#homepage {
  flex: 1;
  display: flex;
  flex-direction: column;
  justify-content: center;
  align-items: center;
  overflow: hidden;
}

#homepage-text {
  z-index: -1;
  margin-bottom: 3.5%;
}

#scriptio-title {
  font-family: poetsen;
  font-size: min(11vw, 11vh);
  margin-bottom: 0.7rem;
}

#scriptio-desc {
  font-family: roboto-thin;
  text-align: center;
  font-size: min(1.6vw, 1.6vh);
}

.title {
  animation: fadeIn;
  animation-duration: 1s;
}

.home-pic-right {
  bottom: 15%;
  right: 0;
}

.home-pic-left {
  top: -2%;
  left: 2%;
}

.home-pic {
  position: absolute;
  z-index: -1;
  width: 35%;

  animation: fadeIn;
  animation-duration: 5s;
}
</style>
