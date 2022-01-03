<template>
  <div class="RegisterPage">
    <Navbar />
    <RegisterPage />
  </div>
</template>

<script>
import { Component, Vue } from "vue-property-decorator";
import RegisterPage from "@/components/RegisterPage.vue";
import Navbar from "@/components/HomePageNavbar.vue";

@Component({
  components: {
    RegisterPage,
    Navbar,
  },
})
export default class Register extends Vue {}
</script>
