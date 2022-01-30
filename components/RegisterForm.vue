<template>
  <!-- Registration form -->
  <div id="register-form">
    <h1 class="segoe-bold">Register</h1>

    <!-- Email -->
    <div id="email-form" class="form">
      <input class="input" type="email" placeholder="Email" />
    </div>

    <!-- Password -->
    <div id="password-form" class="form">
      <input class="input" type="password" placeholder="Password" />
      <input class="input" type="password" placeholder="Repeat password" />
    </div>

    <!-- Confirm button -->
    <div id="form-btn-flex">
      <a @click="register()" class="form-btn">Register</a>
    </div>
  </div>
</template>

<script lang="ts">
export default {
  props: ["content"],
  methods: {
    register: function () {
      alert("Email: " + this.email + "\nPassword: " + this.password);
    },
  },
};
</script>

<style>
a {
  text-decoration: none;
}

.input:focus::placeholder {
  color: transparent;
}

#register-form {
  display: flex;
  flex-direction: column;
  gap: 30px;

  min-width: min(18vw, 30vh);
  min-height: 25vh;
}

#form-btn-flex {
  display: flex;
  flex-direction: row;
  justify-content: flex-end;
}

.input {
  font-size: 1.15rem;
  font-family: "Segoe UI";
  border-radius: 7px;
  border-width: 2px;
  border-color: rgb(212, 212, 212);
  border-style: solid;
  padding: 8px;
}

.input::placeholder {
  font-size: 1rem;
}

.form {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.form-btn {
  font-size: 1rem;
  font-family: segoe-bold;
  color: #ffffff;
  background-color: #474747;
  width: 35%;
  cursor: default;

  /* Position */
  text-align: center;
  padding: 10px;
  padding-bottom: 12px;

  /* Border */
  border-radius: 10px;
  border-width: 2px;
}

.form-btn:hover {
  transition: background-color 0.2s;
  background-color: #686868;
}

.form-btn:active {
  transition: transform 0.25s;
  transform: scale(0.98);
}
</style>