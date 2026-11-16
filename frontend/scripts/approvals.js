// approvals.js: Admin approval queue for void and refund requests.
import * as api from "./api.js";
import { escapeHTML, renderTable, openModal } from "./components.js";

const peso = (n) =>
  "₱ " +
  Number(n || 0).toLocaleString("en-PH", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });

const when = (value) =>
  value
    ? new Date(value).toLocaleString("en-PH", {
        year: "numeric",
        month: "short",
        day: "numeric",
        hour: "numeric",
        minute: "2-digit",
      })
    : "—";

function showRequestDetails(t, user, onChange) {
  const items = Array.isArray(t.items) ? t.items : [];
  const price = (item) => Number(item.price ?? item.unitPrice ?? 0);
  const received = Number(t.amountReceived || t.amountTendered || 0);

  const rows = items.length
    ? items
        .map(
          (item) => `
        <tr>
          <td>${escapeHTML(item.name || "Unnamed item")}<small>${escapeHTML(item.sku || "")}</small></td>
          <td>${escapeHTML(item.qty ?? 0)}</td>
          <td>${peso(price(item))}</td>
          <td>${peso(item.lineTotal ?? price(item) * Number(item.qty || 0))}</td>
        </tr>`,
        )
        .join("")
    : `<tr><td colspan="4">No item details available.</td></tr>`;

  const content = `
    <div class="transaction-status-section transaction-status-top">
      <span class="transaction-status-completed">Completed Order</span>
    </div>

    <div class="transaction-receipt">
      <div class="transaction-receipt-header">
        <h2>Lechon De Jay</h2>
        <p>Transaction Receipt</p>
      </div>

      <div class="transaction-receipt-info">
        <div><strong>Order No.</strong><span>${escapeHTML(t.orderNumber ?? "—")}</span></div>
        <div><strong>Transaction No.</strong><span>${escapeHTML(t.transactionId ?? "—")}</span></div>
        <div><strong>Order Type</strong><span>${escapeHTML(t.orderType || "—")}</span></div>
        <div><strong>Staff</strong><span>${escapeHTML(t.staff || "—")}</span></div>
        <div><strong>Date &amp; Time</strong><span>${escapeHTML(when(t.dateTime))}</span></div>
        <div><strong>Payment Method</strong><span>${escapeHTML(t.paymentMethod || "—")}</span></div>
      </div>

      <h3 class="transaction-items-heading">Order Items</h3>
      <div class="table-responsive">
        <table class="data-table transaction-items-table">
          <thead><tr><th>Product</th><th>Qty</th><th>Price</th><th>Amount</th></tr></thead>
          <tbody>${rows}</tbody>
        </table>
      </div>

      <div class="transaction-receipt-totals">
        <div><span>Subtotal</span><strong>${peso(t.subtotal)}</strong></div>
        <div><span>Discount</span><strong>${peso(t.discountAmount ?? t.discount)}</strong></div>
        <div class="transaction-total-due"><span>Total Due</span><strong>${peso(t.total)}</strong></div>
        <div><span>Amount Received</span><strong>${peso(received)}</strong></div>
        <div><span>Change</span><strong>${peso(t.change)}</strong></div>
      </div>

      <section class="transaction-request-record">
        <h3>Void / Refund Request</h3>
        <p><strong>Request Type:</strong> ${escapeHTML(t.requestType || "—")}</p>
        <p><strong>Reason:</strong></p>
        <div class="transaction-reason-display">${escapeHTML(t.requestReason || "—")}</div>
      </section>

      <p class="transaction-request-error" id="approval-error" role="alert" hidden></p>
      <div class="approval-actions">
        <button type="button" class="btn btn--soft" id="approval-cancel">Cancel</button>
        <button type="button" class="btn btn--primary" id="approval-approve">Approve Request</button>
      </div>
    </div>`;

  const modal = openModal({
    title: "Approval Request",
    content,
    size: "large",
  });

  const approveBtn = document.getElementById("approval-approve");
  const errorEl = document.getElementById("approval-error");

  document
    .getElementById("approval-cancel")
    .addEventListener("click", () => modal?.close?.());

  approveBtn.addEventListener("click", async () => {
    errorEl.hidden = true;
    approveBtn.disabled = true;
    approveBtn.textContent = "Approving...";

    try {
      await api.approveTransactionRequest(t.transactionId, user.name);
      modal?.close?.();
      onChange();
    } catch (err) {
      errorEl.textContent = err.message || "Unable to approve the request.";
      errorEl.hidden = false;
      approveBtn.disabled = false;
      approveBtn.textContent = "Approve Request";
    }
  });
}

export async function renderApprovals(container, user, onChange) {
  const requests = await api.getPendingRequests();

  renderTable(container, {
    columns: [
      { key: "transactionId", label: "Transaction #" },
      { key: "orderNumber", label: "Order #" },
      {
        key: "staff",
        label: "Cashier",
        render: (t) => escapeHTML(t.staff || "—"),
      },
      {
        key: "dateTime",
        label: "Date & Time",
        render: (t) => escapeHTML(when(t.dateTime)),
      },
      {
        key: "itemName",
        label: "Items",
        render: (t) => escapeHTML(t.itemName || "—"),
      },
      { key: "total", label: "Total", render: (t) => peso(t.total) },
      {
        key: "status",
        label: "Status",
        render: () =>
          `<span class="status-chip status-warning">Void / Refund Request</span>`,
      },
    ],
    data: requests,
    searchKeys: ["transactionId", "orderNumber", "staff", "itemName"],
    pageSize: 5,
    emptyMessage: "No pending void or refund requests.",
    onRowClick: (t) => showRequestDetails(t, user, onChange),
  });
}
