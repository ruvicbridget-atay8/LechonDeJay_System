// script.js: entry point. Decides which screen to show.
import * as api from "./api.js";
import { renderLogin } from "./login.js";
import { renderShell } from "./shell.js";

// Each screen adds itself here, for example:  pos: renderPos
// A page is a function (container, user) that draws into the container.
const pages = {};

function start() {
  const user = api.getSession();
  if (!user) {
    renderLogin(start);
    return;
  }
  renderShell(user, pages, start);
}

start();    