<template>
  <LoginPage />
</template>

<script>
import { Component, Vue } from "vue-property-decorator";
import LoginPage from "@/components/LoginPage.vue";

@Component({
  components: {
    LoginPage,
  },
})
export default class Login extends Vue {}
</script>
