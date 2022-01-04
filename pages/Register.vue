<template>
  <div class="RegisterPage">
    <Navbar />
    <RegisterPage />
  </div>
</template>

<script>
import RegisterPage from "@/components/RegisterPage.vue";
import Navbar from "@/components/HomePageNavbar.vue";

export default {
  components: {
    RegisterPage,
    Navbar,
  },
};
</script>
