<template>
  <div class="LoginPage">
    <Navbar />
    <LoginPage />
  </div>
</template>

<script>
import LoginPage from "@/components/LoginPage.vue";
import Navbar from "@/components/HomePageNavbar.vue";

export default {
  components: {
    LoginPage,
    Navbar,
  },
};
</script>
