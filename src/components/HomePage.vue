<template>
  <div class="HomePage">
    <Navbar />
    <img class="home-pic home-pic-left" src="../assets/left.png" />
    <img class="home-pic home-pic-right" src="../assets/right.png" />
    <h1 id="scriptio-title">Scriptio</h1>
    <h2 id="scriptio-desc">Minimalist tool for perfectionist screenwriters</h2>
  </div>
</template>

<script>
import { Component, Vue } from "vue-property-decorator";
import Navbar from "@/components/HomePageNavbar.vue"; // @ is an alias to /src

@Component({
  components: {
    Navbar,
  },
})
export default class HomePage extends Vue {}
</script>

<style scoped>
@font-face {
  font-family: poetsen;
  src: URL("../assets/poetsen.ttf") format("truetype");
}

#scriptio-title {
  font-family: poetsen;
  text-align: center;
  font-size: 7rem;
  margin-top: 15%;
  margin-bottom: -0.6%;
}

#scriptio-desc {
  text-align: center;
  font-size: 1rem;
}

.home-pic-right {
  margin-top: 5%;
  right: 4%;
}

.home-pic-left {
  margin-top: 5%;
  left: 7%;
}

.home-pic {
  position: absolute;
  width: 30%;
  opacity: 30%;
}
</style>
