// script.js: entry point. Decides which screen to show.
import * as api from "./api.js";
import { renderLogin } from "./login.js";

function start() {
  const user = api.getSession();
  if (!user) {
    renderLogin(start); // after a successful login, run start() again
    return;
  }

  // Temporary: the shell (sidebar + top bar) replaces this in Step 1c.
  document.getElementById("app").innerHTML = `
    <div style="padding:2rem">
      <h1>Logged in as ${user.name} (${user.role})</h1>
      <button class="btn" id="logout">Log out</button>
    </div>`;
  document.getElementById("logout").addEventListener("click", () => {
    api.logout();
    start();
  });
}

start();