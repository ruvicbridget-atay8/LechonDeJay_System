// shifts.js: Cashier shifts and cash drawer log.
import * as api from "./api.js";
import { renderTable, escapeHTML } from "./components.js";

const formatCurrency = (amount) =>
  `₱ ${Number(amount || 0).toLocaleString("en-PH", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;

const formatShiftDate = (ymd) => {
  const [y, m, d] = String(ymd).split("-").map(Number);
  const date = new Date(y, m - 1, d);
  return Number.isNaN(date.getTime())
    ? "—"
    : date.toLocaleDateString("en-PH", { dateStyle: "medium" });
};

const formatNow = () =>
  new Date().toLocaleString("en-PH", { dateStyle: "medium", timeStyle: "short" });

// Shortage, Overage, or Balanced (FR-59).
const differenceLabel = (d) => (d < 0 ? "Shortage" : d > 0 ? "Overage" : "Balanced");
const differenceClass = { Shortage: "danger", Overage: "warning", Balanced: "success" };

function differenceChip(d) {
  const label = differenceLabel(d);
  const sign = d > 0 ? "+" : "-";
  const amount = d === 0 ? "" : ` ${sign}${formatCurrency(Math.abs(d))}`;
  return `<span class="status-chip status-${differenceClass[label]}">${label}${amount}</span>`;
}

function showToast(msg) {
  const t = document.createElement("div");
  t.className = "toast";
  t.textContent = msg;
  document.body.appendChild(t);
  setTimeout(() => t.remove(), 3000);
}

const isOpen = (s) => s.status === "Open";

// Rows for the Cash Drawer Logs table.
const toRows = (list) =>
  list.map((s) => ({
    ...s,
    dateLabel: formatShiftDate(s.shiftDate),
    differenceText: isOpen(s) ? "Open" : differenceLabel(s.cashDifference),
  }));

export async function renderShifts(container, user) {
  container.innerHTML = `
    <h1 class="page-title">Shifts</h1>
    <p class="muted">Loading shifts...</p>
  `;

  try {
    let shifts = await api.getShifts(user);
    let panel = "none"; // "none" | "open" | "close"

    const todayKey = () => new Date().toLocaleDateString("en-CA");
    const getOpenShift = () => shifts.find(isOpen) || null;
    const getTodayShift = () => shifts.find((s) => s.shiftDate === todayKey()) || null;

    container.innerHTML = `
      <div class="shifts-page">
        <div class="page-header">
          <div>
            <h1 class="page-title">Shifts</h1>
            <p class="muted">Manage opening and closing shifts for your cash drawers.</p>
          </div>
          <div class="shift-header-actions" id="shift-actions"></div>
        </div>

        <div class="shift-cards" id="shift-cards"></div>

        <h2 class="shifts-section-title">Cash Drawer Logs</h2>
        <div id="shift-log"></div>
      </div>
    `;

    const actionsBox = container.querySelector("#shift-actions");
    const cardsBox = container.querySelector("#shift-cards");

    /* ---------- Cash Drawer Logs (same shared table as Inventory) ---------- */
    const table = renderTable(container.querySelector("#shift-log"), {
      columns: [
        {
          key: "dateLabel",
          label: "Date",
          render: (s) => `<i class="bi bi-calendar3"></i> ${escapeHTML(s.dateLabel)}`,
        },
        { key: "openingCash", label: "Opening Cash", render: (s) => formatCurrency(s.openingCash) },
        { key: "salesCount", label: "No. of Sales", render: (s) => (isOpen(s) ? "—" : escapeHTML(s.salesCount)) },
        { key: "cashSales", label: "Cash Sales", render: (s) => (isOpen(s) ? "—" : formatCurrency(s.cashSales)) },
        { key: "expectedCash", label: "Expected Cash", render: (s) => (isOpen(s) ? "—" : formatCurrency(s.expectedCash)) },
        { key: "actualCash", label: "Counted", render: (s) => (isOpen(s) ? "—" : formatCurrency(s.actualCash)) },
        {
          key: "differenceText",
          label: "Difference",
          render: (s) =>
            isOpen(s)
              ? `<span class="status-chip status-info">Open</span>`
              : differenceChip(s.cashDifference),
        },
      ],
      data: toRows(shifts),
      searchKeys: ["dateLabel", "shiftDate", "differenceText"],
      filters: [
        { label: "Shortage", value: "shortage", predicate: (s) => !isOpen(s) && s.cashDifference < 0 },
        { label: "Overage", value: "overage", predicate: (s) => !isOpen(s) && s.cashDifference > 0 },
        { label: "Balanced", value: "balanced", predicate: (s) => !isOpen(s) && s.cashDifference === 0 },
      ],
      pageSize: 8,
      emptyMessage: "No shifts have been recorded yet.",
    });

    /* ---------- Header button: depends on the shift state ---------- */
    function drawActions() {
      if (getOpenShift()) {
        // A shift is open: only Close Shift.
        actionsBox.innerHTML = `<button class="btn btn--primary" id="btn-close-shift" type="button">Close Shift</button>`;
        actionsBox.querySelector("#btn-close-shift").addEventListener("click", () => showPanel("close"));
      } else if (getTodayShift()) {
        // One shift per cashier per day (A-09).
        actionsBox.innerHTML = `
          <span class="muted">Today's shift is already closed.</span>
          <button class="btn btn--primary" type="button" disabled>Open Shift</button>`;
      } else {
        // Nothing is open: only Open Shift.
        actionsBox.innerHTML = `<button class="btn btn--primary" id="btn-open-shift" type="button">Open Shift</button>`;
        actionsBox.querySelector("#btn-open-shift").addEventListener("click", () => showPanel("open"));
      }
    }

    /* ---------- Open Shift card ---------- */
    function drawOpenCard() {
      cardsBox.innerHTML = `
        <section class="shift-card">
          <h2>Open Shift</h2>
          <div class="shift-meta">
            <strong>${escapeHTML(user.name)}</strong>
            <span class="muted">${escapeHTML(formatNow())}</span>
          </div>

          <div class="shift-box">
            <label class="shift-label" for="opening-cash">Opening Cash in Drawer</label>
            <div class="peso-field">
              <span>₱</span>
              <input class="input" id="opening-cash" type="number" inputmode="decimal" min="0" step="0.01" placeholder="0.00" />
            </div>
            <p class="alert" id="open-error" hidden></p>
            <div class="shift-buttons">
              <button class="btn btn--primary" id="start-shift" type="button">Start Shift</button>
            </div>
          </div>

          <div class="shift-buttons">
            <button class="btn btn--soft" id="cancel-panel" type="button">Cancel</button>
          </div>
        </section>`;

      const input = cardsBox.querySelector("#opening-cash");
      const errorEl = cardsBox.querySelector("#open-error");
      const startBtn = cardsBox.querySelector("#start-shift");
      input.focus();

      cardsBox.querySelector("#cancel-panel").addEventListener("click", () => showPanel("none"));

      startBtn.addEventListener("click", async () => {
        errorEl.hidden = true;
        startBtn.disabled = true;
        try {
          await api.openShift(user, input.value);
          showToast("Shift started.");
          await refresh();
        } catch (err) {
          errorEl.textContent = err.message || "Could not start the shift.";
          errorEl.hidden = false;
          startBtn.disabled = false;
        }
      });
    }

    /* ---------- Close Shift card ---------- */
    async function drawCloseCard() {
      let summary;
      try {
        summary = await api.getShiftSummary(user);
      } catch (err) {
        cardsBox.innerHTML = `<p class="alert">${escapeHTML(err.message || "Could not load the shift summary.")}</p>`;
        return;
      }

      cardsBox.innerHTML = `
        <section class="shift-card">
          <h2>Close Shift</h2>
          <div class="shift-meta">
            <strong>${escapeHTML(user.name)}</strong>
            <span class="muted">${escapeHTML(formatNow())}</span>
          </div>

          <div class="shift-box">
            <h3 class="shift-label">Shift Summary</h3>
            <div class="shift-row">
              <span class="muted">Opening Cash</span>
              <span>${formatCurrency(summary.openingCash)}</span>
            </div>
            <div class="shift-row">
              <span class="muted">Cash Sales (${escapeHTML(summary.cashOrders)} Orders)</span>
              <span>${formatCurrency(summary.cashSales)}</span>
            </div>
            <div class="shift-row shift-row--total">
              <strong>EXPECTED CASH</strong>
              <strong>${formatCurrency(summary.expectedCash)}</strong>
            </div>
            <div class="shift-row">
              <label for="actual-cash"><strong>Actual Cash Counted</strong></label>
              <div class="peso-field">
                <span>₱</span>
                <input class="input" id="actual-cash" type="number" inputmode="decimal" min="0" step="0.01" placeholder="0.00" />
              </div>
            </div>
            <div class="shift-row">
              <strong>Difference</strong>
              <span class="muted" id="shift-diff">Enter the counted amount.</span>
            </div>
            <p class="alert" id="close-error" hidden></p>
          </div>

          <div class="shift-buttons">
            <button class="btn btn--soft" id="cancel-panel" type="button">Cancel</button>
            <button class="btn btn--primary" id="confirm-close" type="button" disabled>Close Shift</button>
          </div>
        </section>`;

      const input = cardsBox.querySelector("#actual-cash");
      const diffEl = cardsBox.querySelector("#shift-diff");
      const errorEl = cardsBox.querySelector("#close-error");
      const closeBtn = cardsBox.querySelector("#confirm-close");
      input.focus();

      // The difference updates as the cashier types (FR-59).
      input.addEventListener("input", () => {
        errorEl.hidden = true;
        const raw = input.value;
        const valid = raw !== "" && Number.isFinite(Number(raw)) && Number(raw) >= 0;
        closeBtn.disabled = !valid;

        if (!valid) {
          diffEl.className = "muted";
          diffEl.textContent = "Enter the counted amount.";
          return;
        }
        const diff = Math.round((Number(raw) - summary.expectedCash) * 100) / 100;
        diffEl.className = "";
        diffEl.innerHTML = differenceChip(diff);
      });

      cardsBox.querySelector("#cancel-panel").addEventListener("click", () => showPanel("none"));

      closeBtn.addEventListener("click", async () => {
        closeBtn.disabled = true;
        try {
          await api.closeShift(user, input.value);
          showToast("Shift closed.");
          await refresh();
        } catch (err) {
          errorEl.textContent = err.message || "Could not close the shift.";
          errorEl.hidden = false;
          closeBtn.disabled = false;
        }
      });
    }

    async function drawCards() {
      if (panel === "open" && !getOpenShift() && !getTodayShift()) {
        drawOpenCard();
      } else if (panel === "close" && getOpenShift()) {
        await drawCloseCard();
      } else {
        cardsBox.innerHTML = "";
      }
    }

    function showPanel(name) {
      panel = name;
      drawCards();
    }

    async function refresh() {
      shifts = await api.getShifts(user);
      table.setData(toRows(shifts));
      panel = "none";
      drawActions();
      await drawCards();
    }

    drawActions();
    drawCards();
  } catch (error) {
    console.error("Shifts loading error:", error);
    container.innerHTML = `
      <h1 class="page-title">Shifts</h1>
      <p class="muted">Unable to load shifts. Please try again.</p>
    `;
  }
}