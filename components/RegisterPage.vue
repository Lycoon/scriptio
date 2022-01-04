<template>
  <div class="RegisterPage">
    <div class="columns is-vcentered">
      <div class="column is-3">
        <div class="field form">
          <h1 id="page-title">Register</h1>
          <label class="label">Email</label>
          <div class="control has-icons-left">
            <input class="input" type="email" placeholder="Email" />
            <span class="icon is-small is-left">
              <img src="https://img.icons8.com/material/24/000000/mail.png" />
            </span>
          </div>

          <label class="label">Password</label>
          <div class="control">
            <input class="input" type="password" placeholder="Password" />
          </div>

          <div class="control">
            <input
              class="input"
              type="password"
              placeholder="Repeat password"
            />
          </div>

          <div class="field is-grouped is-grouped-right">
            <button class="button is-medium is-dark is-rounded">Confirm</button>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script>
export default {};
</script>

<style scoped>
#page-title {
  font-size: 2rem;
  margin-top: 15%;
  margin-bottom: 3%;
}

.form {
  margin: 3rem;
}

.control {
  margin-bottom: 1rem;
}
</style>
