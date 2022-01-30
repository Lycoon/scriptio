<template>
  <!-- Recovery form -->
  <div id="recovery-form">
    <h1 class="segoe-bold">Recover password</h1>
    <p class="info segoe">
      If the provided email is linked to an existing account, an email will be
      sent with a link to recover your password.
    </p>

    <!-- Email -->
    <div id="email-form" class="form">
      <input v-model="email" class="input" type="email" placeholder="Email" />
    </div>

    <!-- Confirm button -->
    <div id="form-btn-flex">
      <a @click="recover()" class="form-btn">Send</a>
    </div>
  </div>
</template>

<script lang="ts">
export default {
  props: ["content"],
  methods: {
    recover: function () {
      alert("Email: " + this.email);
    },
  },
};
</script>

<style>
.info {
  overflow-wrap: anywhere;
  text-align: justify;
  color: #5c5c5c;
}

#recovery-form {
  display: flex;
  flex-direction: column;
  gap: 25px;

  max-width: 15%;
  min-width: min(30vw, 30vh);
  min-height: 25vh;
}
</style>
