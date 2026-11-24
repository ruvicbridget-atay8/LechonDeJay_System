
 // reports.js: Lechon De Jay Admin Reports

import * as api from "./api.js";
import { escapeHTML } from "./components.js";

const peso = (amount) =>
  "₱ " + Number(amount || 0).toLocaleString("en-PH", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });

const number = (value) =>
  Number(value || 0).toLocaleString("en-PH");

const safeDate = (value) => {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
};

const dateKey = (date) => {
  if (!date) return "";
  return [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, "0"),
    String(date.getDate()).padStart(2, "0"),
  ].join("-");
};

const formatDate = (date) =>
  date
    ? date.toLocaleDateString("en-PH", {
        month: "short",
        day: "numeric",
        year: "numeric",
      })
    : "—";

const formatDateTime = (date) =>
  date
    ? date.toLocaleString("en-PH", {
        month: "short",
        day: "numeric",
        year: "numeric",
        hour: "numeric",
        minute: "2-digit",
      })
    : "—";

const transactionDate = (transaction) =>
  safeDate(
    transaction.dateTime ||
    transaction.createdAt ||
    transaction.timestamp ||
    transaction.date
  );

const transactionTotal = (transaction) =>
  Number(
    transaction.total ??
    transaction.totalDue ??
    transaction.grandTotal ??
    0
  );

const transactionItems = (transaction) =>
  Array.isArray(transaction.items) ? transaction.items : [];

const itemQuantity = (item) =>
  Number(item.qty ?? item.quantity ?? 0);

const itemName = (item) =>
  item.name || item.productName || item.itemName || "Unnamed Product";

const itemRevenue = (item) => {
  if (item.lineTotal != null) return Number(item.lineTotal);
  return Number(item.price || 0) * itemQuantity(item);
};

const transactionGross = (transaction) => {
  const subtotal = Number(transaction.subtotal);
  if (Number.isFinite(subtotal) && transaction.subtotal != null) {
    return subtotal;
  }

  return transactionItems(transaction).reduce(
    (sum, item) => sum + itemRevenue(item),
    0
  );
};

const transactionDiscount = (transaction) => {
  const candidates = [
    transaction.discountAmount,
    transaction.discountTotal,
    transaction.discountValue,
    transaction.discountApplied,
  ];

  for (const value of candidates) {
    if (typeof value === "number" && Number.isFinite(value)) {
      return Math.max(0, value);
    }

    if (typeof value === "string" && value.trim() !== "") {
      const parsed = Number(value);
      if (Number.isFinite(parsed)) return Math.max(0, parsed);
    }
  }

  return Math.max(0, transactionGross(transaction) - transactionTotal(transaction));
};

const isCompleted = (transaction) =>
  String(transaction.status || "Completed").toLowerCase() === "completed";

const isCash = (method) =>
  String(method || "").toLowerCase().includes("cash");

const getRange = (mode, customStart, customEnd) => {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const start = new Date(today);
  const end = new Date(today);

  if (mode === "today") {
    // Today only.
  } else if (mode === "week") {
    const day = start.getDay();
    const difference = day === 0 ? 6 : day - 1;
    start.setDate(start.getDate() - difference);
  } else if (mode === "month") {
    start.setDate(1);
  } else if (mode === "custom") {
    return {
      start: customStart ? safeDate(`${customStart}T00:00:00`) : null,
      end: customEnd ? safeDate(`${customEnd}T23:59:59.999`) : null,
    };
  }

  end.setHours(23, 59, 59, 999);

  return { start, end };
};

const inRange = (date, range) => {
  if (!date) return false;
  if (range.start && date < range.start) return false;
  if (range.end && date > range.end) return false;
  return true;
};

const csvCell = (value) =>
  `"${String(value ?? "").replace(/"/g, '""')}"`;

const downloadCSV = (filename, rows) => {
  if (!rows.length) {
    alert("There is no report data to export.");
    return;
  }

  const csv = rows.map((row) => row.map(csvCell).join(",")).join("\n");
  const blob = new Blob(["\uFEFF" + csv], {
    type: "text/csv;charset=utf-8;",
  });

  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");

  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();

  URL.revokeObjectURL(url);
};

export async function renderReports(container, user) {
  if (user?.role !== "Admin") {
    container.innerHTML = `
      <div class="reports-page">
        <h1 class="page-title">Reports</h1>
        <p class="muted">Only administrators can access reports.</p>
      </div>
    `;
    return;
  }

  container.innerHTML = `
    <div class="reports-page">
      <h1 class="page-title">Reports</h1>
      <p class="muted">Loading report data...</p>
    </div>
  `;

  try {
    const [transactions, products, movements, shifts] = await Promise.all([
      api.getTransactions(user),
      api.getProducts(),
      api.getStockMovements(),
      api.getShifts(user),
    ]);

    const allTransactions = Array.isArray(transactions) ? transactions : [];
    const allProducts = Array.isArray(products) ? products : [];
    const allMovements = Array.isArray(movements) ? movements : [];
    const allShifts = Array.isArray(shifts) ? shifts : [];

    let currentPage = "hub";
    let rangeMode = "month";
    let customStart = "";
    let customEnd = "";
    let categoryFilter = "All";
    const staffCashReportCache = new Map();
    const staffCashReportErrors = new Map();
    const staffCashReportRequests = new Map();

    const staffCashReportRangeKey = (range) =>
      range.start && range.end
        ? `${dateKey(range.start)}:${dateKey(range.end)}`
        : null;

    const getStaffCashReportForRange = (range) => {
      const key = staffCashReportRangeKey(range);
      if (!key) return null;
      if (staffCashReportCache.has(key)) return staffCashReportCache.get(key);
      if (staffCashReportErrors.has(key)) return null;

      if (!staffCashReportRequests.has(key)) {
        const startDate = dateKey(range.start);
        const endDate = dateKey(range.end);
        const request = api
          .getStaffCashReport(startDate, endDate)
          .then((staffCashReport) => {
            staffCashReportCache.set(key, staffCashReport);
            staffCashReportErrors.delete(key);
          })
          .catch((error) => {
            staffCashReportErrors.set(
              key,
              error.message || "Unable to load cashier order counts.",
            );
          })
          .finally(() => {
            staffCashReportRequests.delete(key);
            const activeRange = getRange(
              rangeMode,
              customStart,
              customEnd,
            );
            if (
              currentPage === "staff" &&
              staffCashReportRangeKey(activeRange) === key
            ) {
              render();
            }
          });
        staffCashReportRequests.set(key, request);
      }

      return null;
    };

    const activeProducts = allProducts.filter(
      (product) =>
        String(product.status || "").toLowerCase() !== "archived"
    );

    const getFilteredTransactions = (range) =>
      allTransactions.filter((transaction) =>
        inRange(transactionDate(transaction), range)
      );

    const getSalesTransactions = (range) =>
      getFilteredTransactions(range).filter(isCompleted);

    const getSalesTotal = (items) =>
      items.reduce((sum, item) => sum + transactionTotal(item), 0);

    const getProductSales = (items) => {
      const sales = {};

      items.forEach((transaction) => {
        transactionItems(transaction).forEach((item) => {
          const name = itemName(item);
          const sku = item.sku || "";
          const product = allProducts.find((p) => p.sku === sku);

          if (!sales[sku || name]) {
            sales[sku || name] = {
              name,
              sku,
              category: product?.category || "Uncategorized",
              quantity: 0,
              revenue: 0,
            };
          }

          sales[sku || name].quantity += itemQuantity(item);
          sales[sku || name].revenue += itemRevenue(item);
        });
      });

      return Object.values(sales).sort(
        (a, b) => b.revenue - a.revenue
      );
    };

    const getDailySales = (items) => {
      const days = {};

      items.forEach((transaction) => {
        const date = transactionDate(transaction);
        if (!date) return;

        const key = dateKey(date);

        if (!days[key]) {
          days[key] = { date: key, gross: 0, discount: 0, net: 0 };
        }

        days[key].gross += transactionGross(transaction);
        days[key].discount += transactionDiscount(transaction);
        days[key].net += transactionTotal(transaction);
      });

      return Object.values(days).sort((a, b) =>
        a.date.localeCompare(b.date)
      );
    };

    const getPaymentSummary = (items) => {
      const summary = {};

      items.forEach((transaction) => {
        const method =
          transaction.paymentMethod ||
          transaction.payment ||
          transaction.paymentType ||
          "Unspecified";

        summary[method] =
          (summary[method] || 0) + transactionTotal(transaction);
      });

      return Object.entries(summary).sort((a, b) => b[1] - a[1]);
    };

    const getExceptions = (items) => {
      const exceptions = [];

      items.forEach((transaction) => {
        const status = String(transaction.status || "Completed");
        const requestStatus = String(transaction.requestStatus || "None");
        const requestType = String(transaction.requestType || "");

        if (status.toLowerCase() !== "completed") {
          exceptions.push({
            date: transactionDate(transaction),
            order: transaction.transactionId || transaction.orderNumber || "—",
            type: status,
            staff: transaction.staff || "—",
            reason:
              transaction.voidRefundReason ||
              transaction.requestReason ||
              "No reason recorded",
            amount: transactionTotal(transaction),
            approval: requestStatus,
          });
        } else if (requestType) {
          exceptions.push({
            date: safeDate(transaction.requestedAt) || transactionDate(transaction),
            order: transaction.transactionId || transaction.orderNumber || "—",
            type: requestType,
            staff: transaction.requestedBy || transaction.staff || "—",
            reason: transaction.requestReason || "No reason recorded",
            amount: transactionTotal(transaction),
            approval: requestStatus,
          });
        }

        const discount = transactionDiscount(transaction);

        if (discount > 0 && isCompleted(transaction)) {
          exceptions.push({
            date: transactionDate(transaction),
            order: transaction.transactionId || transaction.orderNumber || "—",
            type: "Discount",
            staff: transaction.staff || "—",
            reason: transaction.discountReason || transaction.discountType || "Discount applied",
            amount: discount,
            approval: "Recorded",
          });
        }
      });

      return exceptions.sort(
        (a, b) => (b.date?.getTime() || 0) - (a.date?.getTime() || 0)
      );
    };

    const renderFilterBar = () => `
      <section class="reports-filter-bar">
        <div class="reports-range-buttons">
          <button type="button" class="reports-range-btn ${rangeMode === "today" ? "active" : ""}" data-range="today">Today</button>
          <button type="button" class="reports-range-btn ${rangeMode === "week" ? "active" : ""}" data-range="week">This Week</button>
          <button type="button" class="reports-range-btn ${rangeMode === "month" ? "active" : ""}" data-range="month">This Month</button>
          <button type="button" class="reports-range-btn ${rangeMode === "custom" ? "active" : ""}" data-range="custom">Custom Range</button>
        </div>

        ${
          rangeMode === "custom"
            ? `
              <div class="reports-custom-range">
                <label>
                  Start Date
                  <input type="date" id="reports-start-date" value="${escapeHTML(customStart)}">
                </label>
                <label>
                  End Date
                  <input type="date" id="reports-end-date" value="${escapeHTML(customEnd)}">
                </label>
                <button type="button" class="reports-apply-btn" id="reports-apply-range">Apply</button>
              </div>
            `
            : ""
        }

        <button type="button" class="reports-export-btn" id="reports-export">
          Export CSV
        </button>
      </section>
    `;

    const renderStat = (label, value, note = "") => `
      <article class="reports-stat-card">
        <span>${escapeHTML(label)}</span>
        <strong>${value}</strong>
        ${note ? `<small>${escapeHTML(note)}</small>` : ""}
      </article>
    `;

    const renderTableMessage = (message, columns = 1) => `
      <tr>
        <td colspan="${columns}" class="reports-empty-cell">
          ${escapeHTML(message)}
        </td>
      </tr>
    `;

    const renderHub = (range) => {
      const sales = getSalesTransactions(range);
      const totalSales = getSalesTotal(sales);
      const productsSold = getProductSales(sales).reduce(
        (sum, product) => sum + product.quantity,
        0
      );

      const lowStock = activeProducts.filter(
        (product) =>
          Number(product.stock || 0) > 0 &&
          Number(product.stock || 0) <= Number(product.reorderLevel || 0)
      );

      const reviewCount = getExceptions(getFilteredTransactions(range))
        .filter((exception) =>
          ["pending", "review"].includes(
            String(exception.approval).toLowerCase()
          )
        ).length;

      const reconciledShifts = allShifts.filter(
        (shift) => shift.status === "Closed" && inRange(
          safeDate(shift.shiftDate),
          range
        )
      );

      // Compare current selected period with the previous equal-length period.
      let comparison = "—";
      let comparisonNote = "No previous period available";

      if (range.start && range.end) {
        const duration = range.end.getTime() - range.start.getTime() + 1;
        const previousRange = {
          start: new Date(range.start.getTime() - duration),
          end: new Date(range.start.getTime() - 1),
        };

        const previousSales = getSalesTransactions(previousRange);
        const previousTotal = getSalesTotal(previousSales);

        if (previousTotal > 0) {
          const change = ((totalSales - previousTotal) / previousTotal) * 100;
          comparison = `${change >= 0 ? "+" : ""}${change.toFixed(1)}%`;
          comparisonNote = "Compared with previous period";
        } else if (totalSales > 0) {
          comparison = "New";
          comparisonNote = "No previous-period sales";
        } else {
          comparison = "0.0%";
          comparisonNote = "No sales in either period";
        }
      }

      return `
        <div class="reports-page-heading">
          <div>
            <h1 class="page-title">Reports</h1>
            <p class="muted">Lechon De Jay · Admin Analytics</p>
          </div>
        </div>

        <section class="reports-hero-card">
          <div>
            <span class="reports-eyebrow">TOTAL NET SALES</span>
            <h2>${peso(totalSales)}</h2>
            <p>${escapeHTML(comparison)} ${escapeHTML(comparisonNote)}</p>
          </div>
          <div class="reports-hero-note">
            <strong>Every sale is accounted for.</strong>
            <p>Sales reports reflect completed orders only. Voids and refunds are tracked separately in Exceptions.</p>
          </div>
        </section>

        <div class="reports-hub-grid">
          <button type="button" class="reports-hub-card" data-page="sales">
            <span class="reports-card-kicker">01 · REVENUE</span>
            <strong>Sales</strong>
            <p>Revenue trends, discounts, and payment mix.</p>
            <b>${peso(totalSales)}</b>
            <small>Net sales</small>
          </button>

          <button type="button" class="reports-hub-card" data-page="products">
            <span class="reports-card-kicker">02 · PERFORMANCE</span>
            <strong>Product Performance</strong>
            <p>Discover your best-selling products.</p>
            <b>${number(productsSold)}</b>
            <small>Units sold</small>
          </button>

          <button type="button" class="reports-hub-card" data-page="inventory">
            <span class="reports-card-kicker">03 · STOCK</span>
            <strong>Inventory</strong>
            <p>Monitor ingredient levels and stock movement.</p>
            <b>${number(lowStock.length)}</b>
            <small>Items need restocking</small>
          </button>

          <button type="button" class="reports-hub-card" data-page="staff">
            <span class="reports-card-kicker">04 · RECONCILIATION</span>
            <strong>Staff &amp; Cash</strong>
            <p>Review cashier shifts and cash variances.</p>
            <b>${number(reconciledShifts.length)}</b>
            <small>Shifts reconciled</small>
          </button>

          <button type="button" class="reports-hub-card" data-page="exceptions">
            <span class="reports-card-kicker">05 · AUDIT</span>
            <strong>Exceptions</strong>
            <p>Review voids, refunds, and discounts.</p>
            <b>${number(reviewCount)}</b>
            <small>Requests needing review</small>
          </button>
        </div>

        <p class="reports-footnote">
          Report figures are calculated from the records currently available in the system.
        </p>
      `;
    };

    const renderSales = (range) => {
      const sales = getSalesTransactions(range);
      const totalGross = sales.reduce((sum, t) => sum + transactionGross(t), 0);
      const totalDiscount = sales.reduce((sum, t) => sum + transactionDiscount(t), 0);
      const totalNet = getSalesTotal(sales);
      const daily = getDailySales(sales);
      const payments = getPaymentSummary(sales);
      const maxDaily = Math.max(1, ...daily.map((day) => day.net));

      return `
        <div class="reports-page-heading">
          <div>
            <button type="button" class="reports-back-btn" data-page="hub">← Reports Hub</button>
            <h1 class="page-title">Sales Report</h1>
            <p class="muted">Revenue trends and payment breakdown.</p>
          </div>
        </div>

        <section class="reports-stat-grid">
          ${renderStat("Gross Sales", peso(totalGross))}
          ${renderStat("Discounts", peso(totalDiscount))}
          ${renderStat("Net Sales", peso(totalNet))}
          ${renderStat("Completed Orders", number(sales.length))}
        </section>

        <section class="reports-panel">
          <h2>Daily Sales Trend</h2>
          ${
            daily.length
              ? `
                <div class="reports-bar-chart">
                  ${daily.map((day) => `
                    <div class="reports-bar-column" title="${escapeHTML(day.date)}: ${peso(day.net)}">
                      <strong>${peso(day.net)}</strong>
                      <div class="reports-bar-track">
                        <div class="reports-bar-fill" style="height:${Math.max(3, day.net / maxDaily * 100)}%"></div>
                      </div>
                      <small>${escapeHTML(day.date.slice(5))}</small>
                    </div>
                  `).join("")}
                </div>
              `
              : `<p class="muted">No sales data for this date range.</p>`
          }
        </section>

        <section class="reports-panel">
          <h2>Payment Mix</h2>
          ${
            payments.length
              ? `
                <div class="reports-payment-list">
                  ${payments.map(([method, amount]) => `
                    <div class="reports-payment-row">
                      <span>${escapeHTML(method)}</span>
                      <strong>${peso(amount)}</strong>
                      <small>${totalNet ? (amount / totalNet * 100).toFixed(1) : "0.0"}%</small>
                    </div>
                  `).join("")}
                </div>
              `
              : `<p class="muted">No payment records found.</p>`
          }
        </section>

        <section class="reports-panel">
          <h2>Sales Breakdown by Date</h2>
          <div class="table-responsive">
            <table class="data-table">
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Gross Sales</th>
                  <th>Discounts</th>
                  <th>Net Sales</th>
                </tr>
              </thead>
              <tbody>
                ${
                  daily.length
                    ? daily.map((day) => `
                      <tr>
                        <td>${escapeHTML(day.date)}</td>
                        <td>${peso(day.gross)}</td>
                        <td>${peso(day.discount)}</td>
                        <td><strong>${peso(day.net)}</strong></td>
                      </tr>
                    `).join("")
                    : renderTableMessage("No sales records found.", 4)
                }
              </tbody>
            </table>
          </div>
        </section>
      `;
    };

    const renderProducts = (range) => {
      const sales = getSalesTransactions(range);
      const allProductSales = getProductSales(sales);
      const categories = [
        "All",
        ...new Set(allProductSales.map((item) => item.category)),
      ];

      const filtered = categoryFilter === "All"
        ? allProductSales
        : allProductSales.filter((item) => item.category === categoryFilter);

      const topTen = filtered.slice(0, 10);
      const maxRevenue = Math.max(1, ...topTen.map((item) => item.revenue));
      const totalRevenue = filtered.reduce((sum, item) => sum + item.revenue, 0);

      return `
        <div class="reports-page-heading">
          <div>
            <button type="button" class="reports-back-btn" data-page="hub">← Reports Hub</button>
            <h1 class="page-title">Product Performance</h1>
            <p class="muted">Rank products by revenue and units sold.</p>
          </div>
        </div>

        <section class="reports-filter-inline">
          <label for="reports-category-filter">Category</label>
          <select id="reports-category-filter">
            ${categories.map((category) => `
              <option value="${escapeHTML(category)}" ${categoryFilter === category ? "selected" : ""}>
                ${escapeHTML(category)}
              </option>
            `).join("")}
          </select>
        </section>

        <section class="reports-panel">
          <h2>Top 10 Products by Revenue</h2>
          ${
            topTen.length
              ? `
                <div class="reports-ranked-bars">
                  ${topTen.map((item, index) => `
                    <div class="reports-ranked-row">
                      <span class="reports-rank">${index + 1}</span>
                      <div class="reports-ranked-content">
                        <div class="reports-ranked-label">
                          <strong>${escapeHTML(item.name)}</strong>
                          <span>${peso(item.revenue)}</span>
                        </div>
                        <div class="reports-horizontal-track">
                          <div class="reports-horizontal-fill" style="width:${item.revenue / maxRevenue * 100}%"></div>
                        </div>
                      </div>
                    </div>
                  `).join("")}
                </div>
              `
              : `<p class="muted">No product sales found for this selection.</p>`
          }
        </section>

        <section class="reports-panel">
          <h2>Product Breakdown</h2>
          <div class="table-responsive">
            <table class="data-table">
              <thead>
                <tr>
                  <th>Product</th>
                  <th>Category</th>
                  <th>Units Sold</th>
                  <th>Revenue</th>
                  <th>Share of Sales</th>
                </tr>
              </thead>
              <tbody>
                ${
                  filtered.length
                    ? filtered.map((item) => `
                      <tr>
                        <td><strong>${escapeHTML(item.name)}</strong></td>
                        <td>${escapeHTML(item.category)}</td>
                        <td>${number(item.quantity)}</td>
                        <td>${peso(item.revenue)}</td>
                        <td>${totalRevenue ? (item.revenue / totalRevenue * 100).toFixed(1) : "0.0"}%</td>
                      </tr>
                    `).join("")
                    : renderTableMessage("No product sales found.", 5)
                }
              </tbody>
            </table>
          </div>
        </section>
      `;
    };

    const renderInventory = (range) => {
      const rawMaterials = activeProducts.filter(
        (product) =>
          String(product.productType || "").toLowerCase() === "raw material"
      );

      const inventoryItems = rawMaterials.length ? rawMaterials : activeProducts;

      const lowStock = inventoryItems.filter(
        (product) =>
          Number(product.stock || 0) > 0 &&
          Number(product.stock || 0) <= Number(product.reorderLevel || 0)
      );

      const outOfStock = inventoryItems.filter(
        (product) => Number(product.stock || 0) <= 0
      );

      const valuedProducts = inventoryItems.filter(
        (product) => Number.isFinite(Number(product.unitCost ?? product.costPrice))
          && (product.unitCost != null || product.costPrice != null)
      );

      const stockValue = valuedProducts.reduce(
        (sum, product) =>
          sum + Number(product.stock || 0) *
            Number(product.unitCost ?? product.costPrice ?? 0),
        0
      );

      const rangeMovements = allMovements.filter((movement) =>
        inRange(safeDate(movement.dateTime || movement.timestamp || movement.date), range)
      );

      return `
        <div class="reports-page-heading">
          <div>
            <button type="button" class="reports-back-btn" data-page="hub">← Reports Hub</button>
            <h1 class="page-title">Inventory Report</h1>
            <p class="muted">Ingredient stock levels and movement history.</p>
          </div>
        </div>

        <section class="reports-stat-grid">
          ${renderStat("Tracked Items", number(inventoryItems.length))}
          ${renderStat("Low Stock", number(lowStock.length))}
          ${renderStat("Out of Stock", number(outOfStock.length))}
          ${renderStat(
            "Closing Stock Value",
            valuedProducts.length ? peso(stockValue) : "Not available",
            valuedProducts.length ? "Based on recorded unit costs" : "Product cost data is not configured"
          )}
        </section>

        <section class="reports-panel">
          <h2>Restocking Recommendations</h2>
          ${
            lowStock.length || outOfStock.length
              ? `
                <p class="reports-note">
                  Review the following items and reorder before the next service.
                </p>
                <div class="table-responsive">
                  <table class="data-table">
                    <thead>
                      <tr>
                        <th>Ingredient / Product</th>
                        <th>On Hand</th>
                        <th>Reorder Point</th>
                        <th>Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      ${[...outOfStock, ...lowStock].map((product) => `
                        <tr>
                          <td><strong>${escapeHTML(product.name)}</strong></td>
                          <td>${number(product.stock)} ${escapeHTML(product.unit || "")}</td>
                          <td>${number(product.reorderLevel)}</td>
                          <td>
                            <span class="reports-status ${Number(product.stock) <= 0 ? "danger" : "warning"}">
                              ${Number(product.stock) <= 0 ? "Out of stock" : "Low stock"}
                            </span>
                          </td>
                        </tr>
                      `).join("")}
                    </tbody>
                  </table>
                </div>
              `
              : `<p class="muted">No restocking alerts for the tracked items.</p>`
          }
        </section>

        <section class="reports-panel">
          <h2>Stock Movement History</h2>
          <div class="table-responsive">
            <table class="data-table">
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Product</th>
                  <th>Movement</th>
                  <th>Quantity</th>
                  <th>Reason</th>
                  <th>Staff</th>
                </tr>
              </thead>
              <tbody>
                ${
                  rangeMovements.length
                    ? rangeMovements.map((movement) => `
                      <tr>
                        <td>${formatDateTime(safeDate(movement.dateTime || movement.timestamp || movement.date))}</td>
                        <td>${escapeHTML(movement.productName || movement.sku || "—")}</td>
                        <td>${escapeHTML(movement.movementType || "—")}</td>
                        <td>${number(movement.quantity)}</td>
                        <td>${escapeHTML(movement.reason || "—")}</td>
                        <td>${escapeHTML(movement.staff || "—")}</td>
                      </tr>
                    `).join("")
                    : renderTableMessage("No stock movements in this date range.", 6)
                }
              </tbody>
            </table>
          </div>
        </section>

        <p class="reports-footnote">
          Ingredient cost as a share of sales is unavailable until ingredient cost data is added to the system.
        </p>
      `;
    };

    const renderStaff = (range) => {
      const filteredShifts = allShifts.filter((shift) =>
        inRange(safeDate(shift.shiftDate), range)
      );
      const staffCashReport = getStaffCashReportForRange(range);
      const reportKey = staffCashReportRangeKey(range);
      const staffCashReportError = reportKey
        ? staffCashReportErrors.get(reportKey)
        : null;

      const flagged = filteredShifts.filter(
        (shift) =>
          shift.status === "Closed" &&
          Math.abs(Number(shift.cashDifference || 0)) > 0.009
      );

      return `
        <div class="reports-page-heading">
          <div>
            <button type="button" class="reports-back-btn" data-page="hub">← Reports Hub</button>
            <h1 class="page-title">Staff &amp; Cash Report</h1>
            <p class="muted">Cashier shift reconciliation and cash variance.</p>
          </div>
        </div>

        <section class="reports-stat-grid">
          ${renderStat("Total Shifts", number(filteredShifts.length))}
          ${renderStat("Closed Shifts", number(filteredShifts.filter((s) => s.status === "Closed").length))}
          ${renderStat("Needs Review", number(flagged.length))}
          ${renderStat("Cash Sales", peso(filteredShifts.reduce((sum, s) => sum + Number(s.cashSales || 0), 0)))}
        </section>

        ${
          flagged.length
            ? `
              <section class="reports-review-alert">
                <strong>Cash variance requires review</strong>
                <p>${flagged.length} closed shift(s) have a difference between expected and counted cash.</p>
              </section>
            `
            : ""
        }

        <section class="reports-panel">
          <h2>Shift Reconciliation</h2>
          ${staffCashReportError ? `<p class="alert" role="alert">${escapeHTML(staffCashReportError)}</p>` : ""}
          <div class="table-responsive">
            <table class="data-table">
              <thead>
                <tr>
                  <th>Staff</th>
                  <th>Shift Date</th>
                  <th>Orders</th>
                  <th>Net Cash Sales</th>
                  <th>Expected Cash</th>
                  <th>Counted Cash</th>
                  <th>Variance</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                ${
                  filteredShifts.length
                    ? filteredShifts.map((shift) => {
                      const variance = Number(shift.cashDifference || 0);
                      const closed = shift.status === "Closed";
                      const review = closed && Math.abs(variance) > 0.009;
                      const shiftCashRow = staffCashReport?.shiftCash.find(
                        (row) => Number(row.shift_id) === shift.shiftId,
                      );
                      const cashierSalesRow = staffCashReport?.cashierSales.find(
                        (row) => row.full_name === shift.staff,
                      );
                      const orderCount =
                        shiftCashRow?.transaction_count ??
                        shift.salesCount ??
                        cashierSalesRow?.transaction_count;

                      return `
                        <tr>
                          <td><strong>${escapeHTML(shift.staff || "—")}</strong></td>
                          <td>${formatDate(safeDate(shift.shiftDate))}</td>
                          <td>${orderCount == null ? "—" : number(orderCount)}</td>
                          <td>${peso(shift.cashSales)}</td>
                          <td>${peso(shift.expectedCash)}</td>
                          <td>${shift.actualCash == null ? "—" : peso(shift.actualCash)}</td>
                          <td>${shift.cashDifference == null ? "—" : peso(variance)}</td>
                          <td>
                            <span class="reports-status ${!closed ? "neutral" : review ? "warning" : "success"}">
                              ${!closed ? "Open" : review ? "Review" : "Balanced"}
                            </span>
                          </td>
                        </tr>
                      `;
                    }).join("")
                    : renderTableMessage("No shifts found for this date range.", 8)
                }
              </tbody>
            </table>
          </div>
        </section>

        <p class="reports-footnote">
          Shift figures are based on recorded opening cash, cash sales, and counted cash. The current sample shift records belong to the staff member saved in the API.
        </p>
      `;
    };

    const renderExceptions = (range) => {
      const exceptions = getExceptions(getFilteredTransactions(range));

      const voids = exceptions.filter((item) =>
        String(item.type).toLowerCase().includes("void")
      );

      const refunds = exceptions.filter((item) =>
        String(item.type).toLowerCase().includes("refund")
      );

      const discounts = exceptions.filter((item) =>
        String(item.type).toLowerCase() === "discount"
      );

      const needsReview = exceptions.filter((item) =>
        ["pending", "review"].includes(String(item.approval).toLowerCase())
      );

      return `
        <div class="reports-page-heading">
          <div>
            <button type="button" class="reports-back-btn" data-page="hub">← Reports Hub</button>
            <h1 class="page-title">Exceptions Report</h1>
            <p class="muted">Audit log of voids, refunds, and discounts.</p>
          </div>
        </div>

        <section class="reports-stat-grid">
          ${renderStat("Voids", number(voids.length))}
          ${renderStat("Refunds", number(refunds.length))}
          ${renderStat("Discounts", number(discounts.length))}
          ${renderStat("Needs Review", number(needsReview.length))}
        </section>

        ${
          needsReview.length
            ? `
              <section class="reports-review-alert">
                <strong>Manager review required</strong>
                <p>Check the original order and the recorded reason before approving a void or refund request.</p>
              </section>
            `
            : ""
        }

        <section class="reports-panel">
          <h2>Exception Audit Log</h2>
          <div class="table-responsive">
            <table class="data-table">
              <thead>
                <tr>
                  <th>Time</th>
                  <th>Order No.</th>
                  <th>Type</th>
                  <th>Staff</th>
                  <th>Reason</th>
                  <th>Amount</th>
                  <th>Approval Status</th>
                </tr>
              </thead>
              <tbody>
                ${
                  exceptions.length
                    ? exceptions.map((item) => `
                      <tr>
                        <td>${formatDateTime(item.date)}</td>
                        <td>${escapeHTML(item.order)}</td>
                        <td>${escapeHTML(item.type)}</td>
                        <td>${escapeHTML(item.staff)}</td>
                        <td>${escapeHTML(item.reason)}</td>
                        <td>${peso(item.amount)}</td>
                        <td>
                          <span class="reports-status ${
                            String(item.approval).toLowerCase() === "pending"
                              ? "warning"
                              : String(item.approval).toLowerCase() === "approved"
                                ? "success"
                                : "neutral"
                          }">
                            ${escapeHTML(item.approval)}
                          </span>
                        </td>
                      </tr>
                    `).join("")
                    : renderTableMessage("No exceptions found for this date range.", 7)
                }
              </tbody>
            </table>
          </div>
        </section>

        <p class="reports-footnote">
          Pending void/refund requests are displayed for review. This report does not approve or reverse transactions.
        </p>
      `;
    };

    const getExportRows = (range) => {
      if (currentPage === "products") {
        const products = getProductSales(getSalesTransactions(range))
          .filter((item) =>
            categoryFilter === "All" || item.category === categoryFilter
          );

        return [
          ["Product", "SKU", "Category", "Units Sold", "Revenue"],
          ...products.map((item) => [
            item.name,
            item.sku,
            item.category,
            item.quantity,
            item.revenue,
          ]),
        ];
      }

      if (currentPage === "staff") {
        return [
          ["Staff", "Shift Date", "Orders", "Cash Sales", "Expected Cash", "Counted Cash", "Variance", "Status"],
          ...allShifts.filter((shift) =>
            inRange(safeDate(shift.shiftDate), range)
          ).map((shift) => [
            shift.staff,
            shift.shiftDate,
            shift.salesCount,
            shift.cashSales,
            shift.expectedCash,
            shift.actualCash,
            shift.cashDifference,
            shift.status,
          ]),
        ];
      }

      if (currentPage === "inventory") {
        return [
          ["SKU", "Product", "Stock", "Unit", "Reorder Level", "Status"],
          ...activeProducts.map((product) => [
            product.sku,
            product.name,
            product.stock,
            product.unit,
            product.reorderLevel,
            product.status,
          ]),
        ];
      }

      if (currentPage === "exceptions") {
        return [
          ["Time", "Order", "Type", "Staff", "Reason", "Amount", "Approval"],
          ...getExceptions(getFilteredTransactions(range)).map((item) => [
            item.date?.toISOString() || "",
            item.order,
            item.type,
            item.staff,
            item.reason,
            item.amount,
            item.approval,
          ]),
        ];
      }

      const sales = getSalesTransactions(range);

      return [
        ["Date", "Order", "Staff", "Payment", "Gross Sales", "Discount", "Net Sales"],
        ...sales.map((transaction) => [
          transactionDate(transaction)?.toISOString() || "",
          transaction.transactionId || transaction.orderNumber || "",
          transaction.staff || "",
          transaction.paymentMethod || transaction.payment || "",
          transactionGross(transaction),
          transactionDiscount(transaction),
          transactionTotal(transaction),
        ]),
      ];
    };

    function render() {
      const range = getRange(rangeMode, customStart, customEnd);

      let pageContent = "";

      if (currentPage === "hub") pageContent = renderHub(range);
      if (currentPage === "sales") pageContent = renderSales(range);
      if (currentPage === "products") pageContent = renderProducts(range);
      if (currentPage === "inventory") pageContent = renderInventory(range);
      if (currentPage === "staff") pageContent = renderStaff(range);
      if (currentPage === "exceptions") pageContent = renderExceptions(range);

      container.innerHTML = `
        <div class="reports-page">
          ${renderFilterBar()}
          ${pageContent}
        </div>
      `;

      container.querySelectorAll("[data-range]").forEach((button) => {
        button.addEventListener("click", () => {
          rangeMode = button.dataset.range;
          render();
        });
      });

      container.querySelectorAll("[data-page]").forEach((button) => {
        button.addEventListener("click", () => {
          currentPage = button.dataset.page;
          categoryFilter = "All";
          render();
        });
      });

      container.querySelector("#reports-apply-range")
        ?.addEventListener("click", () => {
          const start = container.querySelector("#reports-start-date").value;
          const end = container.querySelector("#reports-end-date").value;

          if (!start || !end) {
            alert("Please select both a start date and an end date.");
            return;
          }

          if (start > end) {
            alert("Start Date cannot be later than End Date.");
            return;
          }

          customStart = start;
          customEnd = end;
          render();
        });

      container.querySelector("#reports-category-filter")
        ?.addEventListener("change", (event) => {
          categoryFilter = event.target.value;
          render();
        });

      container.querySelector("#reports-export")
        ?.addEventListener("click", () => {
          const rows = getExportRows(range);
          downloadCSV(`lechon-de-jay-${currentPage}-report.csv`, rows);
        });
    }

    render();

  } catch (error) {
    console.error("Reports loading error:", error);

    container.innerHTML = `
      <div class="reports-page">
        <h1 class="page-title">Reports</h1>
        <p class="muted">Unable to load reports.</p>
        <p class="reports-error">${escapeHTML(error.message || "Unknown error")}</p>
      </div>
    `;
  }
}
