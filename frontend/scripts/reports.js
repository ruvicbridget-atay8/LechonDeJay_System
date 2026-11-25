
 // reports.js: Lechon De Jay Admin Reports

import * as api from "./api.js";
import { escapeHTML, showAlertPopup } from "./components.js";

const peso = (amount) =>
  amount == null || amount === ""
    ? "—"
    : "₱ " + Number(amount).toLocaleString("en-PH", {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      });

const number = (value) =>
  value == null || value === ""
    ? "—"
    : Number(value).toLocaleString("en-PH");

const numericValue = (value) => {
  if (value == null || value === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
};

const percentage = (value, total) => {
  const amount = numericValue(value);
  const totalAmount = numericValue(total);
  if (amount == null || totalAmount == null) return "—";
  return `${totalAmount ? (amount / totalAmount * 100).toFixed(1) : "0.0"}%`;
};

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

const csvCell = (value) =>
  `"${String(value ?? "").replace(/"/g, '""')}"`;

const downloadCSV = (filename, rows) => {
  if (!rows.length) {
    showAlertPopup("There is no report data to export.");
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

  let currentPage = "hub";
  let rangeMode = "month";
  let customStart = "";
  let customEnd = "";
  let reportData = null;
  let loading = true;
  let reportError = "";
  let requestVersion = 0;

  const getCurrentRange = () =>
    getRange(rangeMode, customStart, customEnd);

  const getPreviousRange = (range) => {
    if (!range.start || !range.end) return null;
    const duration = range.end.getTime() - range.start.getTime() + 1;
    return {
      start: new Date(range.start.getTime() - duration),
      end: new Date(range.start.getTime() - 1),
    };
  };

  const getInventoryItems = () => {
    const products = reportData?.inventory || [];
    const rawMaterials = products.filter(
      (product) =>
        String(product.product_type || "").toLowerCase() === "raw material"
    );
    return rawMaterials.length ? rawMaterials : products;
  };

  const isLowStock = (product) =>
    Number(product.is_low_stock) === 1 &&
    Number(product.current_stock) > 0;

  const orderCountForShift = (shift) => {
    const shiftCash = reportData?.staffCash?.shiftCash || [];
    const cashierSales = reportData?.staffCash?.cashierSales || [];
    const shiftRow = shiftCash.find(
      (row) => Number(row.shift_id) === shift.shiftId
    );
    const cashierRow = cashierSales.find(
      (row) => row.full_name === shift.staff
    );
    return (
      shiftRow?.transaction_count ??
      shift.salesCount ??
      cashierRow?.transaction_count ??
      null
    );
  };

  const loadReportData = async () => {
    const range = getCurrentRange();
    if (!range.start || !range.end) {
      reportError = "Select a valid start and end date.";
      loading = false;
      render();
      return;
    }

    const version = ++requestVersion;
    const startDate = dateKey(range.start);
    const endDate = dateKey(range.end);
    const previousRange = getPreviousRange(range);
    const previousStart = dateKey(previousRange.start);
    const previousEnd = dateKey(previousRange.end);

    loading = true;
    reportError = "";
    reportData = null;
    render();

    try {
      const [
        sales,
        products,
        inventory,
        movements,
        shifts,
        staffCash,
        exceptions,
        previousSales,
      ] = await Promise.all([
        api.getSalesReport(startDate, endDate),
        api.getProductPerformanceReport(startDate, endDate),
        api.getInventoryReport(startDate, endDate),
        api.getStockMovements({ startDate, endDate }),
        api.getShifts(user, { startDate, endDate }),
        api.getStaffCashReport(startDate, endDate),
        api.getExceptionsReport(startDate, endDate),
        api.getSalesReport(previousStart, previousEnd),
      ]);

      if (version !== requestVersion) return;
      reportData = {
        sales,
        products,
        inventory,
        movements,
        shifts,
        staffCash,
        exceptions,
        previousSales,
      };
      loading = false;
      render();
    } catch (error) {
      if (version !== requestVersion) return;
      reportError = error.message || "Unable to load reports.";
      loading = false;
      render();
    }
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

        <button type="button" class="reports-export-btn" id="reports-export" ${loading || reportError ? "disabled" : ""}>
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

    const renderHub = () => {
      const summary = reportData.sales.summary;
      const productsSold = reportData.products.reduce(
        (sum, product) => sum + Number(product.quantity_sold || 0),
        0,
      );
      const inventory = getInventoryItems();
      const lowStockCount = inventory.filter(isLowStock).length;
      const reconciledShifts = reportData.shifts.filter(
        (shift) => shift.status === "Closed",
      );
      const currentNet = numericValue(summary.net_sales);
      const previousNet = numericValue(
        reportData.previousSales.summary.net_sales,
      );
      let comparison = "—";
      let comparisonNote = "Previous-period sales unavailable";

      if (currentNet != null && previousNet != null) {
        if (previousNet > 0) {
          const change = ((currentNet - previousNet) / previousNet) * 100;
          comparison = `${change >= 0 ? "+" : ""}${change.toFixed(1)}%`;
          comparisonNote = "Compared with previous period";
        } else if (currentNet > 0) {
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
            <h2>${peso(summary.net_sales)}</h2>
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
            <b>${peso(summary.net_sales)}</b>
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
            <b>${number(lowStockCount)}</b>
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
            <p>Review recorded voids and refunds.</p>
            <b>—</b>
            <small>Review requests not included in this report</small>
          </button>
        </div>

        <p class="reports-footnote">
          Report figures are calculated from the records currently available in the system.
        </p>
      `;
    };

    const renderSales = () => {
      const { summary, daily_sales: daily, payment_methods: payments } =
        reportData.sales;
      const maxDaily = Math.max(
        1,
        ...daily.map((day) => Number(day.net_sales || 0)),
      );

      return `
        <div class="reports-page-heading">
          <div>
            <button type="button" class="reports-back-btn" data-page="hub">← Reports Hub</button>
            <h1 class="page-title">Sales Report</h1>
            <p class="muted">Revenue trends and payment breakdown.</p>
          </div>
        </div>

        <section class="reports-stat-grid">
          ${renderStat("Gross Sales", peso(summary.gross_sales))}
          ${renderStat("Discounts", peso(summary.total_discounts))}
          ${renderStat("Net Sales", peso(summary.net_sales))}
          ${renderStat("Completed Orders", number(summary.completed_transactions))}
        </section>

        <section class="reports-panel">
          <h2>Daily Sales Trend</h2>
          ${
            daily.length
              ? `
                <div class="reports-bar-chart">
                  ${daily.map((day) => `
                    <div class="reports-bar-column" title="${escapeHTML(day.sale_date)}: ${peso(day.net_sales)}">
                      <strong>${peso(day.net_sales)}</strong>
                      <div class="reports-bar-track">
                        <div class="reports-bar-fill" style="height:${Math.max(3, Number(day.net_sales || 0) / maxDaily * 100)}%"></div>
                      </div>
                      <small>${day.sale_date ? escapeHTML(String(day.sale_date).slice(5)) : "—"}</small>
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
                  ${payments.map((payment) => `
                    <div class="reports-payment-row">
                      <span>${escapeHTML(payment.method_name || "—")}</span>
                      <strong>${peso(payment.total_sales)}</strong>
                      <small>${percentage(payment.total_sales, summary.net_sales)}</small>
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
                        <td>${formatDate(safeDate(day.sale_date))}</td>
                        <td>${peso(day.gross_sales)}</td>
                        <td>${peso(day.discounts)}</td>
                        <td><strong>${peso(day.net_sales)}</strong></td>
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

    const renderProducts = () => {
      const products = reportData.products;
      const topTen = products.slice(0, 10);
      const maxRevenue = Math.max(
        1,
        ...topTen.map((item) => Number(item.gross_revenue || 0)),
      );
      const totalRevenue = products.reduce(
        (sum, item) => sum + Number(item.gross_revenue || 0),
        0,
      );

      return `
        <div class="reports-page-heading">
          <div>
            <button type="button" class="reports-back-btn" data-page="hub">← Reports Hub</button>
            <h1 class="page-title">Product Performance</h1>
            <p class="muted">Rank products by revenue and units sold.</p>
          </div>
        </div>

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
                          <strong>${escapeHTML(item.name || "—")}</strong>
                          <span>${peso(item.gross_revenue)}</span>
                        </div>
                        <div class="reports-horizontal-track">
                          <div class="reports-horizontal-fill" style="width:${Number(item.gross_revenue || 0) / maxRevenue * 100}%"></div>
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
                  products.length
                    ? products.map((item) => `
                      <tr>
                        <td><strong>${escapeHTML(item.name || "—")}</strong></td>
                        <td>${escapeHTML(item.category_name || "—")}</td>
                        <td>${number(item.quantity_sold)}</td>
                        <td>${peso(item.gross_revenue)}</td>
                        <td>${percentage(item.gross_revenue, totalRevenue)}</td>
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

    const renderInventory = () => {
      const inventoryItems = getInventoryItems();
      const lowStock = inventoryItems.filter(isLowStock);
      const outOfStock = inventoryItems.filter(
        (product) => Number(product.current_stock) <= 0
      );
      const movements = reportData.movements;

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
            "Not available",
            "Unit cost is not returned by the inventory report",
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
                          <td><strong>${escapeHTML(product.name || "—")}</strong></td>
                          <td>${number(product.current_stock)} ${escapeHTML(product.unit || "")}</td>
                          <td>${number(product.reorder_level)}</td>
                          <td>
                            <span class="reports-status ${Number(product.current_stock) <= 0 ? "danger" : "warning"}">
                              ${Number(product.current_stock) <= 0 ? "Out of stock" : "Low stock"}
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
                  <th>SKU</th>
                  <th>Movement</th>
                  <th>Quantity</th>
                  <th>Reason</th>
                  <th>Staff</th>
                </tr>
              </thead>
              <tbody>
                ${
                  movements.length
                    ? movements.map((movement) => `
                      <tr>
                        <td>${formatDateTime(safeDate(movement.dateTime))}</td>
                        <td>${escapeHTML(movement.productName || "—")}</td>
                        <td>${escapeHTML(movement.sku || "—")}</td>
                        <td>${escapeHTML(movement.movementType || "—")}</td>
                        <td>${number(movement.quantity)}</td>
                        <td>${escapeHTML(movement.reason || "—")}</td>
                        <td>${escapeHTML(movement.staff_name || "—")}</td>
                      </tr>
                    `).join("")
                    : renderTableMessage("No stock movements in this date range.", 7)
                }
              </tbody>
            </table>
          </div>
        </section>

        <p class="reports-footnote">
          Closing stock value is unavailable because the inventory report does not return unit cost.
        </p>
      `;
    };

    const renderStaff = () => {
      const filteredShifts = reportData.shifts;

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
                      const orderCount = orderCountForShift(shift);

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
          Shift figures are based on the opening cash, cash sales, and counted cash returned for the selected date range.
        </p>
      `;
    };

    const renderExceptions = () => {
      const {
        voids_refunds: reversals,
        discount_exceptions: discountExceptions,
        pending_requests: pendingRequests,
      } = reportData.exceptions;
      const voids = reversals.filter((item) => item.status === "Voided");
      const refunds = reversals.filter((item) => item.status === "Refunded");

      return `
        <div class="reports-page-heading">
          <div>
            <button type="button" class="reports-back-btn" data-page="hub">← Reports Hub</button>
            <h1 class="page-title">Exceptions Report</h1>
            <p class="muted">Recorded voids, refunds, and stock movement summaries.</p>
          </div>
        </div>

        <section class="reports-stat-grid">
          ${renderStat("Voids", number(voids.length))}
          ${renderStat("Refunds", number(refunds.length))}
          ${renderStat("Discounts", number(discountExceptions.length))}
          ${renderStat("Needs Review", number(pendingRequests.length))}
        </section>

        <section class="reports-panel">
          <h2>Discount Exceptions</h2>
          <div class="table-responsive">
            <table class="data-table">
              <thead>
                <tr>
                  <th>Transaction ID</th>
                  <th>Order No.</th>
                  <th>Date</th>
                  <th>Discount Type</th>
                  <th>Discount Amount</th>
                  <th>Total Due</th>
                  <th>Processed By</th>
                </tr>
              </thead>
              <tbody>
                ${
                  discountExceptions.length
                    ? discountExceptions.map((item) => `
                      <tr>
                        <td>${number(item.transaction_id)}</td>
                        <td>${escapeHTML(item.order_number || "—")}</td>
                        <td>${formatDateTime(safeDate(item.date_time))}</td>
                        <td>${escapeHTML(item.discount_type || "—")}</td>
                        <td>${peso(item.discount_amount)}</td>
                        <td>${peso(item.total_due)}</td>
                        <td>${escapeHTML(item.processed_by || "—")}</td>
                      </tr>
                    `).join("")
                    : renderTableMessage("No discounted transactions for this date range.", 7)
                }
              </tbody>
            </table>
          </div>
        </section>

        <section class="reports-panel">
          <h2>Pending Approval Requests</h2>
          <div class="table-responsive">
            <table class="data-table">
              <thead>
                <tr>
                  <th>Request ID</th>
                  <th>Transaction ID</th>
                  <th>Order No.</th>
                  <th>Request Type</th>
                  <th>Reason</th>
                  <th>Requested By</th>
                  <th>Requested At</th>
                </tr>
              </thead>
              <tbody>
                ${
                  pendingRequests.length
                    ? pendingRequests.map((item) => `
                      <tr>
                        <td>${number(item.request_id)}</td>
                        <td>${number(item.transaction_id)}</td>
                        <td>${escapeHTML(item.order_number || "—")}</td>
                        <td>${escapeHTML(item.request_type || "—")}</td>
                        <td>${escapeHTML(item.reason || "—")}</td>
                        <td>${escapeHTML(item.requested_by || "—")}</td>
                        <td>${formatDateTime(safeDate(item.requested_at))}</td>
                      </tr>
                    `).join("")
                    : renderTableMessage("No pending requests for this date range.", 7)
                }
              </tbody>
            </table>
          </div>
        </section>

        <section class="reports-panel">
          <h2>Exception Audit Log</h2>
          <div class="table-responsive">
            <table class="data-table">
              <thead>
                <tr>
                  <th>Time</th>
                  <th>Order No.</th>
                  <th>Status</th>
                  <th>Staff</th>
                  <th>Reason</th>
                  <th>Amount</th>
                </tr>
              </thead>
              <tbody>
                ${
                  reversals.length
                    ? reversals.map((item) => `
                      <tr>
                        <td>${formatDateTime(safeDate(item.date_time))}</td>
                        <td>${escapeHTML(item.order_number || "—")}</td>
                        <td>${escapeHTML(item.status || "—")}</td>
                        <td>${escapeHTML(item.processed_by || "—")}</td>
                        <td>${escapeHTML(item.void_refund_reason || "—")}</td>
                        <td>${peso(item.total_due)}</td>
                      </tr>
                    `).join("")
                    : renderTableMessage("No voided or refunded transactions for this date range.", 6)
                }
              </tbody>
            </table>
          </div>
        </section>

      `;
    };

    const getExportRows = () => {
      if (currentPage === "products") {
        return [
          ["Product", "SKU", "Category", "Units Sold", "Revenue"],
          ...reportData.products.map((item) => [
            item.name,
            item.sku,
            item.category_name || "—",
            item.quantity_sold,
            item.gross_revenue,
          ]),
        ];
      }

      if (currentPage === "staff") {
        return [
          ["Staff", "Shift Date", "Orders", "Cash Sales", "Expected Cash", "Counted Cash", "Variance", "Status"],
          ...reportData.shifts.map((shift) => [
            shift.staff,
            shift.shiftDate,
            orderCountForShift(shift),
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
          ...reportData.inventory.map((product) => [
            product.sku,
            product.name,
            product.current_stock,
            product.unit,
            product.reorder_level,
            product.status,
          ]),
        ];
      }

      if (currentPage === "exceptions") {
        return [
          [
            "Record Type", "Date", "Request ID", "Transaction ID", "Order",
            "Status/Type", "Staff", "Reason", "Discount Amount", "Total Due",
            "Product", "SKU", "Unit", "Stock In", "Stock Out", "Net Adjustment",
          ],
          ...reportData.exceptions.voids_refunds.map((item) => [
            "Void/Refund",
            item.date_time,
            "",
            item.transaction_id,
            item.order_number,
            item.status,
            item.processed_by,
            item.void_refund_reason,
            "",
            item.total_due,
            "",
            "",
            "",
            "",
            "",
            "",
          ]),
          ...reportData.exceptions.discount_exceptions.map((item) => [
            "Discount",
            item.date_time,
            "",
            item.transaction_id,
            item.order_number,
            item.discount_type,
            item.processed_by,
            "",
            item.discount_amount,
            item.total_due,
            "",
            "",
            "",
            "",
            "",
            "",
          ]),
          ...reportData.exceptions.pending_requests.map((item) => [
            "Pending Request",
            item.requested_at,
            item.request_id,
            item.transaction_id,
            item.order_number,
            item.request_type,
            item.requested_by,
            item.reason,
            "",
            "",
            "",
            "",
            "",
            "",
            "",
            "",
          ]),
          ...reportData.exceptions.stock_movements.map((item) => [
            "Stock Movement",
            "",
            "",
            "",
            "",
            "",
            "",
            "",
            "",
            item.name,
            item.sku,
            item.unit,
            item.stock_in,
            item.stock_out,
            item.net_adjustment,
          ]),
        ];
      }

      return [
        ["Date", "Orders", "Gross Sales", "Discounts", "Net Sales"],
        ...reportData.sales.daily_sales.map((day) => [
          day.sale_date,
          day.transaction_count,
          day.gross_sales,
          day.discounts,
          day.net_sales,
        ]),
      ];
    };

    function render() {
      let pageContent;
      if (loading) {
        pageContent = `
          <section class="reports-panel">
            <p class="muted">Loading report data...</p>
          </section>
        `;
      } else if (reportError) {
        pageContent = `
          <section class="reports-panel">
            <p class="reports-error" role="alert">${escapeHTML(reportError)}</p>
            <button type="button" class="reports-apply-btn" id="reports-retry">
              Retry
            </button>
          </section>
        `;
      } else if (currentPage === "hub") {
        pageContent = renderHub();
      } else if (currentPage === "sales") {
        pageContent = renderSales();
      } else if (currentPage === "products") {
        pageContent = renderProducts();
      } else if (currentPage === "inventory") {
        pageContent = renderInventory();
      } else if (currentPage === "staff") {
        pageContent = renderStaff();
      } else {
        pageContent = renderExceptions();
      }

      container.innerHTML = `
        <div class="reports-page">
          ${renderFilterBar()}
          ${pageContent}
        </div>
      `;

      container.querySelectorAll("[data-range]").forEach((button) => {
        button.addEventListener("click", () => {
          if (button.dataset.range === "custom") {
            const range = getCurrentRange();
            rangeMode = "custom";
            customStart = dateKey(range.start);
            customEnd = dateKey(range.end);
            render();
          } else {
            rangeMode = button.dataset.range;
            loadReportData();
          }
        });
      });

      container.querySelectorAll("[data-page]").forEach((button) => {
        button.addEventListener("click", () => {
          currentPage = button.dataset.page;
          render();
        });
      });

      container.querySelector("#reports-apply-range")
        ?.addEventListener("click", () => {
          const start = container.querySelector("#reports-start-date").value;
          const end = container.querySelector("#reports-end-date").value;

          if (!start || !end) {
            showAlertPopup("Please select both a start date and an end date.");
            return;
          }

          if (start > end) {
            showAlertPopup("Start Date cannot be later than End Date.");
            return;
          }

          customStart = start;
          customEnd = end;
          loadReportData();
        });

      container.querySelector("#reports-retry")
        ?.addEventListener("click", loadReportData);

      container.querySelector("#reports-export")
        ?.addEventListener("click", () => {
          const rows = getExportRows();
          downloadCSV(`lechon-de-jay-${currentPage}-report.csv`, rows);
        });
    }

    await loadReportData();
}
