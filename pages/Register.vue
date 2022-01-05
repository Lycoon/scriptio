<template>
  <div class="RegisterPage">
    <Navbar />
    <div class="is-flex is-justify-content-center is-flex-direction-row">
      <RegisterForm />
    </div>
    <HomePageFooter />
  </div>
</template>

<script lang="ts">
import Navbar from "@/components/HomePageNavbar.vue";

export default {
  components: {
    Navbar,
  },
  head: {
    title: "Scriptio - Register",
  },
};
</script>
