// login.js: draws the Login screen into #app.
import * as api from "./api.js";

export function renderLogin(onSuccess) {
  document.title = "Sign in | Lechon De Jay";
  document.getElementById("app").innerHTML = `
    <div class="login-page">
      <header class="login-bar">
        <img class="brand-logo" src="assets/logo.png" alt="" />
        <span>Lechon De Jay</span>
      </header>
      <main class="login-main">
        <form class="login-card" id="login-form" novalidate>
          <img class="login-logo" src="assets/logo.png" alt="Lechon De Jay logo" />
          <h1>Welcome Back <span aria-hidden="true">👋</span></h1>
          <p class="login-sub">Sign in to start your shift.</p>
          <div class="alert" id="login-error" role="alert" hidden></div>
          <div class="field">
            <label for="username">Username</label>
            <input class="input" id="username" name="username" placeholder="Username1234"
                   autocomplete="username" autocapitalize="none" required />
          </div>
          <div class="field">
            <label for="password">Password</label>
            <input class="input" id="password" name="password" type="password" placeholder="At least 8 characters"
                   autocomplete="current-password" required />
          </div>
          <button class="btn btn--primary btn--block" type="submit">Sign in</button>
        </form>
      </main>
    </div>`;

  const form = document.getElementById("login-form");
  const error = document.getElementById("login-error");
  form.username.focus();

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    error.hidden = true;

    if (!form.username.value.trim() || !form.password.value) {
      error.textContent = "Enter your username and password.";
      error.hidden = false;
      return;
    }

    try {
      const user = await api.login(form.username.value, form.password.value);
      onSuccess(user);
    } catch (err) {
      error.textContent = err.message;
      error.hidden = false;
      form.password.value = "";
      form.password.focus();
    }
  });
}