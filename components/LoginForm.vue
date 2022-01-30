<template>
  <!-- Log in form -->
  <div id="login-form">
    <h1 class="segoe-bold">Log in</h1>

    <!-- Email -->
    <div id="email-form" class="form">
      <input v-model="email" class="input" type="email" placeholder="Email" />
    </div>

    <!-- Password -->
    <div id="password-form" class="form">
      <input
        v-model="password"
        class="input"
        type="password"
        placeholder="Password"
      />
      <a href="/recovery">Forgot password?</a>
    </div>

    <!-- Confirm button -->
    <div id="form-btn-flex">
      <a @click="login()" class="form-btn">Log in</a>
    </div>
  </div>
</template>

<script lang="ts">
export default {
  props: ["content"],
  methods: {
    login: function () {
      alert("Email: " + this.email + "\nPassword: " + this.password);
    },
  },
};
</script>

<style>
#login-form {
  display: flex;
  flex-direction: column;
  gap: 25px;

  min-width: min(18vw, 30vh);
  min-height: 25vh;
}

a {
  color: #9c9c9c;
  font-size: min(1.8vw, 1.2vh);
}
</style>
