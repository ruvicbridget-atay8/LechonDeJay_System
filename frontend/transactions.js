
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

const getPayment = (t) =>
  t.paymentMethod || t.payment || t.paymentType || "—";

const getReceived = (t) =>
  Number(t.amountReceived ?? t.cashReceived ?? t.amountPaid ?? t.received ?? 0);

const getChange = (t) =>
  Number(
    t.change ??
    t.changeAmount ??
    Math.max(0, getReceived(t) - Number(t.total || 0))
  );

const getItemPrice = (item) =>
  Number(item.price ?? item.unitPrice ?? item.sellingPrice ?? 0);

const getItemTotal = (item) =>
  Number(
    item.lineTotal ??
    item.subtotal ??
    item.total ??
    getItemPrice(item) * Number(item.qty || 0)
  );

function showTransactionDetails(transaction, user, container) {
  const items = Array.isArray(transaction.items) ? transaction.items : [];

  const status = String(transaction.status || "Completed").toLowerCase();
  const reversed = ["voided", "refunded"].includes(status);
  const requestStatus = String(transaction.requestStatus || "").toLowerCase();

  const reason =
    transaction.voidRefundReason ||
    transaction.requestReason ||
    "";

  const itemsHTML = items.length
    ? items.map((item) => `
        <tr>
          <td>
            ${escapeHTML(item.name || "Unnamed item")}
            <small>${escapeHTML(item.sku || "")}</small>
          </td>
          <td>${escapeHTML(item.qty ?? 0)}</td>
          <td>${formatCurrency(getItemPrice(item))}</td>
          <td>${formatCurrency(getItemTotal(item))}</td>
        </tr>
      `).join("")
    : `<tr><td colspan="4">No item details available.</td></tr>`;

  const statusLabel = reversed
    ? status === "voided" ? "Voided" : "Refunded"
    : "Completed Order";

  const requestContent = reversed
    ? `
      <section class="transaction-request-record">
        <h3>Reversal Record</h3>
        <p><strong>Request Type:</strong>
          ${escapeHTML(transaction.requestType || (status === "voided" ? "Void" : "Refund"))}
        </p>
        <p><strong>Recorded Reason:</strong></p>
        <div class="transaction-reason-display">
          ${escapeHTML(reason || "No reason recorded.")}
        </div>
        <p class="muted">This transaction is read-only.</p>
      </section>
    `
    : requestStatus === "pending"
    ? `
      <section class="transaction-request-record">
        <h3>Void / Refund Request</h3>
        <p><strong>Request Type:</strong> ${escapeHTML(transaction.requestType || "—")}</p>
        <p><strong>Reason:</strong></p>
        <div class="transaction-reason-display">
          ${escapeHTML(transaction.requestReason || "—")}
        </div>
        <p class="transaction-pending-message">Request Pending Approval</p>
      </section>
    `
    : `
      <form id="void-refund-form" class="transaction-request-form">
        <h3>Request Void / Refund</h3>
        <p class="muted">
          Select a request type and explain why this transaction needs to be reversed.
        </p>

        <div class="form-group">
          <label for="transaction-request-type">Request Type *</label>
          <select id="transaction-request-type" name="requestType" required>
            <option value="">Select request type</option>
            <option value="Void">Void</option>
            <option value="Refund">Refund</option>
          </select>
        </div>

        <div class="form-group">
          <label for="transaction-request-reason">Reason *</label>
          <textarea
            id="transaction-request-reason"
            name="reason"
            rows="3"
            maxlength="500"
            placeholder="Explain the reason for this request..."
            required
          ></textarea>
        </div>

        <p id="transaction-request-error" class="transaction-request-error" role="alert" hidden></p>

        <button type="submit" class="transaction-request-submit">
          Request Void / Refund
        </button>
      </form>
    `;

  const content = `
    <div class="transaction-receipt">
      <div class="transaction-receipt-header">
        <h2>Lechon De Jay</h2>
        <p>Transaction Receipt</p>
      </div>

      <div class="transaction-receipt-info">
        <div><strong>Order No.</strong><span>${escapeHTML(transaction.orderNumber ?? "—")}</span></div>
        <div><strong>Transaction No.</strong><span>${escapeHTML(transaction.transactionId ?? "—")}</span></div>
        <div><strong>Order Type</strong><span>${escapeHTML(transaction.orderType || "—")}</span></div>
        <div><strong>Staff</strong><span>${escapeHTML(transaction.staff || "—")}</span></div>
        <div><strong>Date & Time</strong><span>${escapeHTML(formatDate(transaction.dateTime))}</span></div>
        <div><strong>Payment Method</strong><span>${escapeHTML(getPayment(transaction))}</span></div>
      </div>

      <h3 class="transaction-items-heading">Order Items</h3>

      <div class="table-responsive">
        <table class="data-table transaction-items-table">
          <thead>
            <tr>
              <th scope="col">Product</th>
              <th scope="col">Qty</th>
              <th scope="col">Price</th>
              <th scope="col">Amount</th>
            </tr>
          </thead>
          <tbody>${itemsHTML}</tbody>
        </table>
      </div>

      <div class="transaction-receipt-totals">
        <div><span>Subtotal</span><strong>${formatCurrency(transaction.subtotal)}</strong></div>
        <div><span>Discount</span><strong>${formatCurrency(transaction.discount)}</strong></div>
        <div class="transaction-total-due"><span>Total Due</span><strong>${formatCurrency(transaction.total)}</strong></div>
        <div><span>Amount Received</span><strong>${formatCurrency(getReceived(transaction))}</strong></div>
        <div><span>Change</span><strong>${formatCurrency(getChange(transaction))}</strong></div>
      </div>

      <div class="transaction-status-section">
        <span class="${reversed ? "transaction-status-reversed" : "transaction-status-completed"}">
          ${escapeHTML(statusLabel)}
        </span>
      </div>

      ${requestContent}
    </div>
  `;

  const modal = openModal({
    title: "Transaction Details",
    content,
    size: "large",
  });

  if (reversed || requestStatus === "pending") return;

  const form = modal?.element?.querySelector("#void-refund-form");
  if (!form) return;

  form.addEventListener("submit", async (event) => {
    event.preventDefault();

    const requestType = form.elements.requestType.value;
    const reasonText = form.elements.reason.value.trim();
    const errorElement = form.querySelector("#transaction-request-error");
    const submitButton = form.querySelector(".transaction-request-submit");

    errorElement.hidden = true;

    if (!requestType || !reasonText) {
      errorElement.textContent = "Please select a request type and provide a reason.";
      errorElement.hidden = false;
      return;
    }

    submitButton.disabled = true;
    submitButton.textContent = "Submitting...";

    try {
      await api.requestTransactionAction({
        transactionId: transaction.transactionId,
        requestType,
        reason: reasonText,
        staff: user.name,
      });

      alert("Your Void / Refund request has been submitted successfully.");

      if (modal?.close) modal.close();
      await renderTransactions(container, user);
    } catch (error) {
      errorElement.textContent = error.message || "Unable to submit the request.";
      errorElement.hidden = false;
      submitButton.disabled = false;
      submitButton.textContent = "Request Void / Refund";
    }
  });
}

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
            ${user.role === "Admin" ? "Transactions & Approvals" : "My Transactions"}
          </h1>
          <p class="muted">View receipts and review saved sales transactions.</p>
        </div>
      </div>
      <div id="transactions-table"></div>
    `;

    const tableContainer = container.querySelector("#transactions-table");

    renderTable(tableContainer, {
      columns: [
        { key: "transactionId", label: "Transaction #" },
        { key: "orderNumber", label: "Order #" },
        {
          key: "dateTime",
          label: "Date & Time",
          render: (t) => escapeHTML(formatDate(t.dateTime)),
        },
        {
          key: "staff",
          label: "Cashier",
          render: (t) => escapeHTML(t.staff || "—"),
        },
        {
          key: "itemName",
          label: "Items",
          render: (t) =>
            escapeHTML(
              t.itemName ||
              t.items?.map((item) => item.name).join(", ") ||
              "—"
            ),
        },
        {
          key: "paymentMethod",
          label: "Payment",
          render: (t) => escapeHTML(getPayment(t)),
        },
        {
          key: "total",
          label: "Total",
          render: (t) => formatCurrency(t.total),
        },
        {
          key: "status",
          label: "Status",
          render: (t) => statusChip(t.status || "Completed"),
        },
        {
          key: "requestStatus",
          label: "Request",
          render: (t) => t.requestStatus ? statusChip(t.requestStatus) : "—",
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
        "requestType",
        "requestStatus",
      ],

      filters: [
        {
          label: "Completed",
          value: "completed",
          predicate: (t) => String(t.status).toLowerCase() === "completed",
        },
        {
          label: "Voided",
          value: "voided",
          predicate: (t) => String(t.status).toLowerCase() === "voided",
        },
        {
          label: "Refunded",
          value: "refunded",
          predicate: (t) => String(t.status).toLowerCase() === "refunded",
        },
        {
          label: "Pending Requests",
          value: "pending",
          predicate: (t) => String(t.requestStatus).toLowerCase() === "pending",
        },
      ],

      pageSize: 8,
      emptyMessage: "No transactions have been recorded yet.",

      onRowClick: (transaction) => {
        showTransactionDetails(transaction, user, container);
      },
    });
  } catch (error) {
    console.error("Transactions loading error:", error);

    container.innerHTML = `
      <h1 class="page-title">Transactions</h1>
      <p class="muted">Unable to load transactions. Please try again.</p>
    `;
  }
}
