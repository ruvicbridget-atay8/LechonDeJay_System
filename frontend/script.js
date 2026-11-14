// script.js: entry point. Decides which screen to show.
import * as api from "./api.js";
import { renderLogin } from "./login.js";
import { renderShell } from "./shell.js";
import { renderPos } from "./pos.js";
import { renderTransactions } from "./transactions.js";


const pages = { pos: renderPos, transactions: renderTransactions };

function start() {
  const user = api.getSession();
  if (!user) {
    renderLogin(start);
    return;
  }
  renderShell(user, pages, start);
}

start();    