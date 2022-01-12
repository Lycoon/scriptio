<template>
  <div id="homepage">
    <img class="home-pic home-pic-left" src="@/assets/left.png" />
    <img class="home-pic home-pic-right" src="@/assets/right.png" />
    <h1 id="scriptio-title">Scriptio</h1>
    <h2 id="scriptio-desc">Minimalist tool for perfectionist screenwriters</h2>
  </div>
</template>

<script>
import Navbar from "@/components/HomePageNavbar.vue";

export default {
  components: {
    Navbar,
  },
};
</script>

<style scoped>
@font-face {
  font-family: poetsen;
  src: URL("/assets/poetsen.ttf") format("truetype");
}
@font-face {
  font-family: roboto-thin;
  src: URL("/assets/roboto-thin.ttf") format("truetype");
}

#homepage {
  flex: 1;
  display: flex;
  flex-direction: column;
  justify-content: center;
  align-items: center;
}

#scriptio-title {
  font-family: poetsen;
  font-size: min(9vw, 9vh);
  margin-bottom: 0.5rem;
}

#scriptio-desc {
  font-family: roboto-thin;
  text-align: center;
  font-size: min(1.6vw, 1.6vh);
}

.home-pic-right {
  z-index: -1;
  bottom: 15%;
  right: 0;
}

.home-pic-left {
  z-index: -1;
  top: -2%;
  left: 2%;
}

.home-pic {
  position: absolute;
  width: 35%;
  opacity: 20%;
}
</style>
