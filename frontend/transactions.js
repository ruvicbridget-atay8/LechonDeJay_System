
// transactions.js: transaction list shared by Cashiers and Admins.

import * as api from "./api.js";
import {
  renderTable,
  statusChip,
  openModal,
  escapeHTML,
} from "./components.js";

const formatCurrency = (amount) =>
  `₱ ${Number(amount || 0).toLocaleString("en-PH", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;

const formatDate = (dateTime) => {
  if (!dateTime) return "—";

  const date = new Date(dateTime);

  if (Number.isNaN(date.getTime())) return "—";

  return date.toLocaleString("en-PH", {
    dateStyle: "medium",
    timeStyle: "short",
  });
};

// Show the details of a selected transaction.
function showTransactionDetails(transaction) {
  const items = Array.isArray(transaction.items)
    ? transaction.items
    : [];

  const itemsHTML = items.length
    ? items.map((item) => `
        <tr>
          <td>${escapeHTML(item.name || "Unnamed item")}</td>
          <td>${escapeHTML(item.qty ?? 0)}</td>
          <td>${escapeHTML(item.sku || "—")}</td>
        </tr>
      `).join("")
    : `<tr><td colspan="3">No item details available.</td></tr>`;

  const content = `
    <div class="transaction-details">
      <p>
        <strong>Transaction No.:</strong>
        ${escapeHTML(transaction.transactionId ?? "—")}
      </p>

      <p>
        <strong>Order No.:</strong>
        ${escapeHTML(transaction.orderNumber ?? "—")}
      </p>

      <p>
        <strong>Date & Time:</strong>
        ${escapeHTML(formatDate(transaction.dateTime))}
      </p>

      <p>
        <strong>Cashier:</strong>
        ${escapeHTML(transaction.staff || "—")}
      </p>

      <p>
        <strong>Order Type:</strong>
        ${escapeHTML(transaction.orderType || "—")}
      </p>

      <p>
        <strong>Payment Method:</strong>
        ${escapeHTML(transaction.paymentMethod || "—")}
      </p>

      <h3>Items</h3>

      <div class="table-responsive">
        <table class="data-table">
          <thead>
            <tr>
              <th scope="col">Product</th>
              <th scope="col">Quantity</th>
              <th scope="col">SKU</th>
            </tr>
          </thead>
          <tbody>
            ${itemsHTML}
          </tbody>
        </table>
      </div>

      <div class="transaction-total">
        <p>
          <strong>Subtotal:</strong>
          ${formatCurrency(transaction.subtotal)}
        </p>

        <p>
          <strong>Discount:</strong>
          ${formatCurrency(transaction.discount)}
        </p>

        <p>
          <strong>Total:</strong>
          ${formatCurrency(transaction.total)}
        </p>

        <p>
          <strong>Status:</strong>
          ${statusChip(transaction.status)}
        </p>
      </div>
    </div>
  `;

  openModal({
    title: "Transaction Details",
    content,
    size: "large",
  });
}

// Render transactions for Cashiers and Admins.
export async function renderTransactions(container, user) {
  container.innerHTML = `
    <h1 class="page-title">Transactions</h1>
    <p class="muted">Loading transaction records...</p>
  `;

  try {
    const transactions = await api.getTransactions(user);

    container.innerHTML = `
      <div class="page-header">
        <div>
          <h1 class="page-title">
            ${user.role === "Admin"
              ? "Transactions & Approvals"
              : "My Transactions"}
          </h1>

          <p class="muted">
            View and review saved sales transactions.
          </p>
        </div>
      </div>

      <div id="transactions-table"></div>
    `;

    const tableContainer = container.querySelector(
      "#transactions-table"
    );

    renderTable(tableContainer, {
      columns: [
        {
          key: "transactionId",
          label: "Transaction #",
        },
        {
          key: "dateTime",
          label: "Date & Time",
          render: (transaction) =>
            escapeHTML(formatDate(transaction.dateTime)),
        },
        {
          key: "staff",
          label: "Cashier",
          render: (transaction) =>
            escapeHTML(transaction.staff || "—"),
        },
        {
          key: "itemName",
          label: "Items",
          render: (transaction) =>
            escapeHTML(transaction.itemName || "—"),
        },
        {
          key: "paymentMethod",
          label: "Payment",
          render: (transaction) =>
            escapeHTML(transaction.paymentMethod || "—"),
        },
        {
          key: "total",
          label: "Total",
          render: (transaction) =>
            formatCurrency(transaction.total),
        },
        {
          key: "status",
          label: "Status",
          render: (transaction) =>
            statusChip(transaction.status),
        },
      ],

      data: transactions,

      searchKeys: [
        "transactionId",
        "orderNumber",
        "staff",
        "itemName",
        "paymentMethod",
        "status",
      ],

      filters: [
        {
          label: "Completed",
          value: "completed",
          predicate: (transaction) =>
            String(transaction.status).toLowerCase() === "completed",
        },
        {
          label: "Voided",
          value: "voided",
          predicate: (transaction) =>
            String(transaction.status).toLowerCase() === "voided",
        },
        {
          label: "Refunded",
          value: "refunded",
          predicate: (transaction) =>
            String(transaction.status).toLowerCase() === "refunded",
        },
      ],

      pageSize: 8,

      emptyMessage: "No transactions have been recorded yet.",

      onRowClick: (transaction) => {
        showTransactionDetails(transaction);
      },
    });
  } catch (error) {
    console.error("Transactions loading error:", error);

    container.innerHTML = `
      <h1 class="page-title">Transactions</h1>
      <p class="muted">
        Unable to load transactions. Please try again.
      </p>
    `;
  }
}
