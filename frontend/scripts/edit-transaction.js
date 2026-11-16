// edit-transaction.js: Admin pop-up to correct a completed transaction.
import * as api from "./api.js";
import { escapeHTML, openModal } from "./components.js";

const round2 = (n) => Math.round(Number(n) * 100) / 100;

const peso = (n) =>
  "₱ " +
  Number(n || 0).toLocaleString("en-PH", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });

export async function showEditTransaction(transaction, user, onDone) {
  const types = (await api.getDiscountTypes()).filter(
    (d) => d.active || d.name === transaction.discountType,
  );

  // "Original" labels: the first saved version of this transaction.
  const original = transaction.original || {
    orderType: transaction.orderType,
    discountType: transaction.discountType || "Regular",
    items: transaction.items.map((l) => ({ sku: l.sku, qty: l.qty })),
  };

  const isCash =
    String(transaction.paymentMethod || "").toLowerCase() === "cash";

  const lines = transaction.items.map((l) => ({
    ...l,
    price: Number(l.price ?? l.unitPrice ?? 0),
    qty: Number(l.qty),
  }));

  const state = {
    orderType: transaction.orderType || "Dine In",
    discountType: transaction.discountType || "Regular",
    discountId: transaction.discountId || "",
    discountName: transaction.discountName || "",
    received: String(
      transaction.amountReceived || transaction.amountTendered || "",
    ),
  };

  const typeByName = (name) => types.find((d) => d.name === name);

  const rate = () =>
    state.discountType === transaction.discountType &&
    transaction.discountRate != null
      ? Number(transaction.discountRate)
      : Number(typeByName(state.discountType)?.value || 0);

  function totals() {
    const subtotal = round2(lines.reduce((sum, l) => sum + l.price * l.qty, 0));
    const discount = round2((subtotal * rate()) / 100);
    const total = round2(subtotal - discount);
    const received = isCash ? Number(state.received) || 0 : total;
    const change = isCash ? Math.max(0, round2(received - total)) : 0;
    return { subtotal, discount, total, received, change };
  }

  const orderOptions = ["Dine In", "Take-out"]
    .map(
      (v) =>
        `<option value="${v}" ${v === state.orderType ? "selected" : ""}>${v}</option>`,
    )
    .join("");

  const discountOptions = types
    .map(
      (d) =>
        `<option value="${escapeHTML(d.name)}" ${d.name === state.discountType ? "selected" : ""}>${escapeHTML(d.name)}</option>`,
    )
    .join("");

  const content = `
    <div class="transaction-status-section transaction-status-top">
      <span class="transaction-status-completed">Completed Order</span>
    </div>

    <div class="transaction-receipt">
      <div class="transaction-receipt-header">
        <h2>Lechon De Jay</h2>
        <p>Edit Transaction #${escapeHTML(transaction.transactionId)}</p>
      </div>

      <div class="edit-field">
        <label for="edit-order-type">Order Type</label>
        <div class="edit-field-row">
          <select id="edit-order-type" class="input">${orderOptions}</select>
          <small class="edit-original">Original: ${escapeHTML(original.orderType || "—")}</small>
        </div>
      </div>

      <h3 class="transaction-items-heading">Order Items</h3>
      <div id="edit-lines"></div>

      <div class="edit-field">
        <label for="edit-discount-type">Discount Type</label>
        <div class="edit-field-row">
          <select id="edit-discount-type" class="input">${discountOptions}</select>
          <small class="edit-original">Original: ${escapeHTML(original.discountType || "Regular")}</small>
        </div>
      </div>

      <div id="edit-discount-ids" hidden>
        <div class="edit-field">
          <label for="edit-discount-id">Discount ID Number *</label>
          <input id="edit-discount-id" class="input" autocomplete="off" value="${escapeHTML(state.discountId)}" />
        </div>
        <div class="edit-field">
          <label for="edit-discount-name">Discount ID Name *</label>
          <input id="edit-discount-name" class="input" autocomplete="off" value="${escapeHTML(state.discountName)}" />
        </div>
      </div>

      <div class="transaction-receipt-totals">
        <div><span>Subtotal</span><strong id="edit-subtotal"></strong></div>
        <div><span id="edit-discount-label">Discount</span><strong id="edit-discount"></strong></div>
        <div class="transaction-total-due"><span>Total Due</span><strong id="edit-total"></strong></div>
        <div><span>Payment Method</span><strong>${escapeHTML(transaction.paymentMethod || "—")}</strong></div>
      </div>

      <div class="edit-field">
        <label for="edit-received">Amount Received</label>
        <input id="edit-received" class="input" type="number" inputmode="decimal" min="0" step="0.01" />
      </div>
      <div class="transaction-receipt-totals">
        <div><span>Change</span><strong id="edit-change"></strong></div>
      </div>

      <div class="edit-field">
        <label for="edit-reason">Reason for correction *</label>
        <textarea id="edit-reason" class="input" rows="3" maxlength="500" placeholder="Describe what was corrected."></textarea>
      </div>

      <p class="transaction-request-error" id="edit-error" role="alert" hidden></p>
      <div class="approval-actions">
        <button type="button" class="btn btn--soft" id="edit-cancel">Cancel</button>
        <button type="button" class="btn btn--primary" id="edit-apply">Apply Correction</button>
      </div>
    </div>`;

  const modal = openModal({
    title: "Edit Transaction",
    content,
    size: "large",
  });

  const linesBox = document.getElementById("edit-lines");
  const idFields = document.getElementById("edit-discount-ids");
  const receivedInput = document.getElementById("edit-received");
  const errorEl = document.getElementById("edit-error");
  const applyBtn = document.getElementById("edit-apply");

  function drawLines() {
    linesBox.innerHTML = lines
      .map(
        (l, i) => `
        <div class="edit-line">
          <div class="edit-line-top">
            <strong>${escapeHTML(l.name || "Unnamed item")}</strong>
            <span>${peso(l.price * l.qty)}</span>
          </div>
          <div class="edit-line-bottom">
            <div class="edit-qty">
              <button type="button" data-i="${i}" data-act="dec" aria-label="Remove one">&minus;</button>
              <span>${l.qty}</span>
              <button type="button" data-i="${i}" data-act="inc" aria-label="Add one">+</button>
            </div>
            <small class="edit-original">${peso(l.price)} each · Original: ${original.items[i]?.qty ?? l.qty}</small>
          </div>
        </div>`,
      )
      .join("");
  }

  function drawTotals() {
    const t = totals();
    document.getElementById("edit-subtotal").textContent = peso(t.subtotal);
    document.getElementById("edit-discount-label").textContent =
      `Discount (${state.discountType}, ${rate()}%)`;
    document.getElementById("edit-discount").textContent =
      "-" + peso(t.discount);
    document.getElementById("edit-total").textContent = peso(t.total);
    document.getElementById("edit-change").textContent =
      isCash && state.received !== "" && t.received < t.total
        ? "Insufficient"
        : peso(t.change);

    if (!isCash) receivedInput.value = t.total.toFixed(2);
  }

  function syncIdFields() {
    idFields.hidden = !typeByName(state.discountType)?.requiresId;
  }

  receivedInput.value = isCash ? state.received : totals().total.toFixed(2);
  receivedInput.readOnly = !isCash;

  drawLines();
  syncIdFields();
  drawTotals();

  linesBox.addEventListener("click", (e) => {
    const btn = e.target.closest("[data-act]");
    if (!btn) return;
    const line = lines[Number(btn.dataset.i)];
    line.qty = Math.max(1, line.qty + (btn.dataset.act === "inc" ? 1 : -1));
    drawLines();
    drawTotals();
  });

  document.getElementById("edit-order-type").addEventListener("change", (e) => {
    state.orderType = e.target.value;
  });

  document
    .getElementById("edit-discount-type")
    .addEventListener("change", (e) => {
      state.discountType = e.target.value;
      syncIdFields();
      drawTotals();
    });

  document
    .getElementById("edit-discount-id")
    .addEventListener("input", (e) => (state.discountId = e.target.value));
  document
    .getElementById("edit-discount-name")
    .addEventListener("input", (e) => (state.discountName = e.target.value));

  receivedInput.addEventListener("input", () => {
    if (!isCash) return;
    state.received = receivedInput.value;
    drawTotals();
  });

  document
    .getElementById("edit-cancel")
    .addEventListener("click", () => modal?.close?.());

  applyBtn.addEventListener("click", async () => {
    errorEl.hidden = true;

    const reason = document.getElementById("edit-reason").value.trim();
    if (!reason) {
      errorEl.textContent = "Enter the reason for the correction.";
      errorEl.hidden = false;
      return;
    }

    applyBtn.disabled = true;
    applyBtn.textContent = "Applying...";

    try {
      await api.updateTransaction(
        transaction.transactionId,
        {
          reason,
          orderType: state.orderType,
          quantities: lines.map((l) => l.qty),
          discountType: state.discountType,
          discountId: state.discountId,
          discountName: state.discountName,
          amountReceived: state.received,
        },
        user.name,
      );
      modal?.close?.();
      onDone();
    } catch (err) {
      errorEl.textContent = err.message || "Unable to apply the correction.";
      errorEl.hidden = false;
      applyBtn.disabled = false;
      applyBtn.textContent = "Apply Correction";
    }
  });
}
