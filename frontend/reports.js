
// reports.js: Admin reports and analytics.

import * as api from "./api.js";
import { escapeHTML } from "./components.js";

const peso = (amount) =>
  "₱ " + Number(amount || 0).toLocaleString("en-PH", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });

const safeDate = (value) => {
  if (!value) return null;

  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
};

const getTransactionDate = (transaction) =>
  safeDate(
    transaction.date ||
    transaction.createdAt ||
    transaction.timestamp ||
    transaction.transactionDate
  );

const getTransactionTotal = (transaction) =>
  Number(
    transaction.total ??
    transaction.totalDue ??
    transaction.grandTotal ??
    0
  );

const getTransactionItems = (transaction) =>
  Array.isArray(transaction.items) ? transaction.items : [];

const getItemQuantity = (item) =>
  Number(item.quantity ?? item.qty ?? 0);

const getItemName = (item) =>
  item.productName || item.name || item.itemName || "Unnamed Product";

const getItemTotal = (item) => {
  if (item.lineTotal != null) return Number(item.lineTotal);

  return (
    Number(item.price ?? 0) *
    getItemQuantity(item)
  );
};

const formatDate = (date) => {
  if (!date) return "—";

  return date.toLocaleDateString("en-PH", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
};

const formatDateTime = (date) => {
  if (!date) return "—";

  return date.toLocaleString("en-PH", {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
};

export async function renderReports(container, user) {
  container.innerHTML = `
    <div class="reports-page">
      <h1 class="page-title">Reports</h1>
      <p class="muted">View sales performance and inventory reports.</p>
      <p class="muted">Loading reports...</p>
    </div>
  `;

  try {
    const [transactions, products, movements] = await Promise.all([
      api.getTransactions(user),
      api.getProducts(),
      api.getStockMovements(),
    ]);

    const allTransactions = Array.isArray(transactions)
      ? transactions
      : [];

    const allProducts = Array.isArray(products)
      ? products
      : [];

    const allMovements = Array.isArray(movements)
      ? movements
      : [];

    const today = new Date();
    const todayString = [
      today.getFullYear(),
      String(today.getMonth() + 1).padStart(2, "0"),
      String(today.getDate()).padStart(2, "0"),
    ].join("-");

    function displayReports(startDate = "", endDate = "") {
      const filteredTransactions = allTransactions.filter((transaction) => {
        const date = getTransactionDate(transaction);

        if (!date) return false;

        const dateString = [
          date.getFullYear(),
          String(date.getMonth() + 1).padStart(2, "0"),
          String(date.getDate()).padStart(2, "0"),
        ].join("-");

        if (startDate && dateString < startDate) return false;
        if (endDate && dateString > endDate) return false;

        return true;
      });

      // Only completed transactions count as sales.
      const completedTransactions = filteredTransactions.filter(
        (transaction) =>
          String(transaction.status || "Completed").toLowerCase() ===
          "completed"
      );

      const totalSales = completedTransactions.reduce(
        (sum, transaction) => sum + getTransactionTotal(transaction),
        0
      );

      const transactionCount = completedTransactions.length;

      const averageOrder = transactionCount
        ? totalSales / transactionCount
        : 0;

      // Payment method summary.
      const paymentSummary = {};

      completedTransactions.forEach((transaction) => {
        const method =
          transaction.paymentMethod ||
          transaction.payment ||
          "Unspecified";

        paymentSummary[method] =
          (paymentSummary[method] || 0) +
          getTransactionTotal(transaction);
      });

      // Top-selling products.
      const productSales = {};

      completedTransactions.forEach((transaction) => {
        getTransactionItems(transaction).forEach((item) => {
          const name = getItemName(item);

          if (!productSales[name]) {
            productSales[name] = {
              name,
              quantity: 0,
              revenue: 0,
            };
          }

          productSales[name].quantity += getItemQuantity(item);
          productSales[name].revenue += getItemTotal(item);
        });
      });

      const topProducts = Object.values(productSales)
        .sort((a, b) => b.quantity - a.quantity)
        .slice(0, 5);

      // Inventory summary.
      const activeProducts = allProducts.filter(
        (product) =>
          String(product.status || "").toLowerCase() !== "archived"
      );

      const lowStockProducts = activeProducts.filter((product) => {
        const stock = Number(product.stock ?? 0);
        const reorder = Number(product.reorderLevel ?? 0);

        return stock > 0 && stock <= reorder;
      });

      const outOfStockProducts = activeProducts.filter(
        (product) => Number(product.stock ?? 0) <= 0
      );

      // Latest transactions.
      const latestTransactions = [...filteredTransactions]
        .sort((a, b) => {
          const dateA = getTransactionDate(a);
          const dateB = getTransactionDate(b);

          return (dateB?.getTime() || 0) - (dateA?.getTime() || 0);
        })
        .slice(0, 10);

      // Latest stock movements.
      const latestMovements = [...allMovements]
        .sort((a, b) => {
          const dateA = safeDate(a.timestamp || a.date);
          const dateB = safeDate(b.timestamp || b.date);

          return (dateB?.getTime() || 0) - (dateA?.getTime() || 0);
        })
        .slice(0, 10);

      container.innerHTML = `
        <div class="reports-page">

          <div class="page-header">
            <div>
              <h1 class="page-title">Reports</h1>
              <p class="muted">
                Monitor sales, payments, product performance, and inventory.
              </p>
            </div>
          </div>

          <section class="reports-filter">
            <div class="reports-filter-field">
              <label for="report-start-date">Start Date</label>
              <input
                type="date"
                id="report-start-date"
                value="${escapeHTML(startDate)}"
              >
            </div>

            <div class="reports-filter-field">
              <label for="report-end-date">End Date</label>
              <input
                type="date"
                id="report-end-date"
                value="${escapeHTML(endDate)}"
              >
            </div>

            <button type="button" class="btn btn-primary" id="apply-report-filter">
              Apply Filter
            </button>

            <button type="button" class="btn btn-secondary" id="reset-report-filter">
              Reset
            </button>
          </section>

          <h2 class="reports-section-title">Sales Overview</h2>

          <section class="reports-stat-grid">
            <article class="reports-stat-card">
              <span class="reports-stat-label">Total Sales</span>
              <strong>${peso(totalSales)}</strong>
              <small>Completed transactions only</small>
            </article>

            <article class="reports-stat-card">
              <span class="reports-stat-label">Transactions</span>
              <strong>${transactionCount}</strong>
              <small>Completed orders</small>
            </article>

            <article class="reports-stat-card">
              <span class="reports-stat-label">Average Order Value</span>
              <strong>${peso(averageOrder)}</strong>
              <small>Average sales per order</small>
            </article>

            <article class="reports-stat-card">
              <span class="reports-stat-label">Inventory Items</span>
              <strong>${activeProducts.length}</strong>
              <small>Non-archived products</small>
            </article>
          </section>

          <section class="reports-two-column">

            <div class="reports-panel">
              <h2 class="reports-section-title">Payment Summary</h2>

              ${
                Object.keys(paymentSummary).length
                  ? `
                    <div class="table-responsive">
                      <table class="data-table">
                        <thead>
                          <tr>
                            <th>Payment Method</th>
                            <th>Total Amount</th>
                          </tr>
                        </thead>
                        <tbody>
                          ${Object.entries(paymentSummary).map(([method, amount]) => `
                            <tr>
                              <td>${escapeHTML(method)}</td>
                              <td><strong>${peso(amount)}</strong></td>
                            </tr>
                          `).join("")}
                        </tbody>
                      </table>
                    </div>
                  `
                  : `<p class="muted">No completed payment records found.</p>`
              }
            </div>

            <div class="reports-panel">
              <h2 class="reports-section-title">Inventory Alerts</h2>

              <div class="reports-alert-row">
                <span>Low Stock Products</span>
                <strong>${lowStockProducts.length}</strong>
              </div>

              <div class="reports-alert-row">
                <span>Out of Stock Products</span>
                <strong>${outOfStockProducts.length}</strong>
              </div>

              <div class="reports-alert-list">
                ${
                  [...lowStockProducts, ...outOfStockProducts].length
                    ? [...lowStockProducts, ...outOfStockProducts]
                        .map((product) => `
                          <div class="reports-alert-product">
                            <span>${escapeHTML(product.name)}</span>
                            <small>
                              ${Number(product.stock ?? 0)} ${escapeHTML(product.unit || "pcs")}
                            </small>
                          </div>
                        `).join("")
                    : `<p class="muted">No inventory alerts.</p>`
                }
              </div>
            </div>

          </section>

          <section class="reports-panel">
            <h2 class="reports-section-title">Top-Selling Products</h2>

            ${
              topProducts.length
                ? `
                  <div class="table-responsive">
                    <table class="data-table">
                      <thead>
                        <tr>
                          <th>Rank</th>
                          <th>Product</th>
                          <th>Quantity Sold</th>
                          <th>Revenue</th>
                        </tr>
                      </thead>
                      <tbody>
                        ${topProducts.map((product, index) => `
                          <tr>
                            <td>${index + 1}</td>
                            <td><strong>${escapeHTML(product.name)}</strong></td>
                            <td>${product.quantity}</td>
                            <td>${peso(product.revenue)}</td>
                          </tr>
                        `).join("")}
                      </tbody>
                    </table>
                  </div>
                `
                : `<p class="muted">No product sales found for this date range.</p>`
            }
          </section>

          <section class="reports-panel">
            <h2 class="reports-section-title">Recent Transactions</h2>

            ${
              latestTransactions.length
                ? `
                  <div class="table-responsive">
                    <table class="data-table">
                      <thead>
                        <tr>
                          <th>Transaction No.</th>
                          <th>Date</th>
                          <th>Cashier</th>
                          <th>Payment</th>
                          <th>Total</th>
                          <th>Status</th>
                        </tr>
                      </thead>
                      <tbody>
                        ${latestTransactions.map((transaction) => {
                          const date = getTransactionDate(transaction);
                          const status = transaction.status || "Completed";

                          return `
                            <tr>
                              <td>${escapeHTML(
                                transaction.transactionNo ||
                                transaction.orderNo ||
                                transaction.id ||
                                "—"
                              )}</td>
                              <td>${formatDate(date)}</td>
                              <td>${escapeHTML(
                                transaction.cashier ||
                                transaction.staff ||
                                transaction.cashierName ||
                                "—"
                              )}</td>
                              <td>${escapeHTML(
                                transaction.paymentMethod ||
                                transaction.payment ||
                                "—"
                              )}</td>
                              <td>${peso(getTransactionTotal(transaction))}</td>
                              <td>${escapeHTML(status)}</td>
                            </tr>
                          `;
                        }).join("")}
                      </tbody>
                    </table>
                  </div>
                `
                : `<p class="muted">No transactions found for this date range.</p>`
            }
          </section>

          <section class="reports-panel">
            <h2 class="reports-section-title">Recent Stock Movements</h2>

            ${
              latestMovements.length
                ? `
                  <div class="table-responsive">
                    <table class="data-table">
                      <thead>
                        <tr>
                          <th>Date</th>
                          <th>Product</th>
                          <th>Movement</th>
                          <th>Quantity</th>
                          <th>Reason</th>
                        </tr>
                      </thead>
                      <tbody>
                        ${latestMovements.map((movement) => `
                          <tr>
                            <td>${formatDateTime(
                              safeDate(movement.timestamp || movement.date)
                            )}</td>
                            <td>${escapeHTML(
                              movement.productName ||
                              movement.sku ||
                              "—"
                            )}</td>
                            <td>${escapeHTML(movement.movementType || "—")}</td>
                            <td>${Number(movement.quantity ?? 0)}</td>
                            <td>${escapeHTML(movement.reason || "—")}</td>
                          </tr>
                        `).join("")}
                      </tbody>
                    </table>
                  </div>
                `
                : `<p class="muted">No stock movement records found.</p>`
            }
          </section>

        </div>
      `;

      container.querySelector("#apply-report-filter")
        ?.addEventListener("click", () => {
          const start = container.querySelector("#report-start-date").value;
          const end = container.querySelector("#report-end-date").value;

          if (start && end && start > end) {
            alert("Start date cannot be later than the end date.");
            return;
          }

          displayReports(start, end);
        });

      container.querySelector("#reset-report-filter")
        ?.addEventListener("click", () => {
          displayReports();
        });
    }

    displayReports();

  } catch (error) {
    console.error("Reports loading error:", error);

    container.innerHTML = `
      <div class="reports-page">
        <h1 class="page-title">Reports</h1>
        <p class="muted">
          Unable to load reports. Please check your API functions.
        </p>
        <p class="muted">${escapeHTML(error.message || "Unknown error")}</p>
      </div>
    `;
  }
}
