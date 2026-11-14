
// script.js: entry point. Decides which screen to show.

import * as api from "./api.js";
import { renderLogin } from "./login.js";
import { renderShell } from "./shell.js";
import { renderPos } from "./pos.js";
import { renderInventory } from "./inventory.js";
import { renderTransactions } from "./transactions.js";
import { renderStock } from "./stock.js";
import { renderDiscounts } from "./discounts.js";
import { renderAccounts } from "./accounts.js";

const pages = {
  pos: renderPos,
  inventory: renderInventory,
  transactions: renderTransactions,
  stock: renderStock,
  discounts: renderDiscounts,
  accounts: renderAccounts,
};

function start() {
  const user = api.getSession();

  if (!user) {
    renderLogin(start);
    return;
  }

  renderShell(user, pages, start);
}

start();

