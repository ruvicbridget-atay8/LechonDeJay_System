
// script.js: entry point. Decides which screen to show.

import * as api from "./api.js";
import { renderLogin } from "./login.js";
import { renderShell } from "./shell.js";
import { renderPos } from "./pos.js";
import { renderInventory } from "./inventory.js";
import { renderTransactions } from "./transactions.js";
import { renderShifts } from "./shifts.js";
import { renderStock } from "./stock.js";
import { renderDiscounts } from "./discounts.js";
import { renderAccounts } from "./accounts.js";  
import { renderReports } from "./reports.js";


const pages = {
  pos: renderPos,
  inventory: renderInventory,
  transactions: renderTransactions,
  shifts: renderShifts,
  stock: renderStock,
  discounts: renderDiscounts,
  accounts: renderAccounts,
  reports: renderReports,
};

async function start() {
  try {
    const user = await api.getCurrentUser();
    if (user) {
      renderShell(user, pages, start);
      return;
    }

    renderLogin((authenticatedUser) =>
      renderShell(authenticatedUser, pages, start),
    );
  } catch (error) {
    console.error("Unable to verify the current session:", error);
    renderLogin(
      (authenticatedUser) => renderShell(authenticatedUser, pages, start),
      error.message || "Unable to verify your session. Please sign in.",
    );
  }
}

start();

