<template>
  <div class="home">
    <HomePage />
  </div>
</template>

<script lang="ts">
import { Component, Vue } from "vue-property-decorator";
import HomePage from "@/components/HomePage.vue"; // @ is an alias to /src

@Component({
  components: {
    HomePage,
  },
})
export default class Home extends Vue {}
</script>
