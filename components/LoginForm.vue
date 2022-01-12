<template>
  <!-- Log in form -->
  <div class="is-flex is-flex-direction-column flex">
    <h1 id="home-form-title">Log in</h1>

    <!-- Email -->
    <label class="label">Email</label>
    <div class="control has-icons-left">
      <input class="input" type="email" placeholder="Email" />
      <span class="icon is-small is-left">
        <img src="https://img.icons8.com/material/24/000000/mail.png" />
      </span>
    </div>

    <!-- Password -->
    <label class="label">Password</label>
    <div class="control">
      <input class="input" type="password" placeholder="Password" />
    </div>

    <!-- Confirm button -->
    <div class="field is-grouped is-grouped-right">
      <button class="button is-medium is-dark is-rounded">Confirm</button>
    </div>
  </div>
</template>

<style>
#home-form-title {
  font-size: 2rem;
  margin-top: 15%;
  margin-bottom: 7%;
}

.control {
  margin-bottom: 1rem;
}

.flex {
  min-width: 15vw;
}
</style>
