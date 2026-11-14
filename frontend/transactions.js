// transactions.js: transaction list shared by Cashiers and Admins.
import * as api from "./api.js";

const peso = (amount) =>
  "₱ " + Number(amount).toLocaleString("en-PH", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const esc = (value) =>
  String(value ?? "").replace(/[&<>"']/g, (char) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  }[char]));

export async function renderTransactions(container, user) {
  container.innerHTML = `
    <h1 class="page-title">${user.role === "Admin" ? "Transactions &amp; Approvals" : "My Transactions"}</h1>
    <section class="transaction-card" aria-label="Transaction list">
      <div class="transaction-table-wrap">
        <table class="transaction-table">
          <thead>
            <tr>
              <th scope="col">Transaction #</th>
              <th scope="col">Date &amp; Time</th>
              <th scope="col">Cashier</th>
              <th scope="col">Items</th>
              <th scope="col">Payment</th>
              <th scope="col">Total</th>
              <th scope="col">Status</th>
            </tr>
          </thead>
          <tbody id="transaction-rows"></tbody>
        </table>
      </div>
      <p class="transaction-empty" id="transaction-empty" hidden>No transactions yet.</p>
      <p class="alert transaction-error" id="transaction-error" hidden></p>
    </section>`;

  const rows = container.querySelector("#transaction-rows");
  const empty = container.querySelector("#transaction-empty");
  const error = container.querySelector("#transaction-error");

  try {
    const transactions = await api.getTransactions(user);
    empty.hidden = transactions.length > 0;
    rows.innerHTML = transactions.map((transaction) => `
      <tr>
        <td>#${esc(transaction.transactionId)}</td>
        <td>${esc(new Date(transaction.dateTime).toLocaleString("en-PH"))}</td>
        <td>${esc(transaction.staff)}</td>
        <td>${esc(transaction.itemName)}</td>
        <td>${esc(transaction.paymentMethod)}</td>
        <td>${peso(transaction.total)}</td>
        <td><span class="transaction-status">${esc(transaction.status)}</span></td>
      </tr>`).join("");
  } catch (err) {
    error.textContent = err.message || "Could not load transactions.";
    error.hidden = false;
  }
}
