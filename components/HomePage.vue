<template>
  <div>
    <div class="homepage">
      <Navbar />
      <img class="home-pic home-pic-left" src="@/assets/left.png" />
      <img class="home-pic home-pic-right" src="@/assets/right.png" />
      <h1 id="scriptio-title">Scriptio</h1>
      <h2 id="scriptio-desc">
        Minimalist tool for perfectionist screenwriters
      </h2>
    </div>
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

#scriptio-title {
  font-family: poetsen;
  text-align: center;
  font-size: 5.5vw;
  margin-top: 30vh;
  margin-bottom: -0.7rem;
}

#scriptio-desc {
  text-align: center;
  font-size: 0.85vw;
}

.home-pic-right {
  bottom: 15%;
  right: 0;
}

.home-pic-left {
  top: -3%;
  left: 2%;
}

.home-pic {
  position: absolute;
  width: 35%;
  opacity: 20%;
}
</style>
