
// stock.js: displays stock movement history for Admin.
import * as api from "./api.js";
import {
  renderTable,
  statusChip,
  escapeHTML,
} from "./components.js";

const formatDate = (dateTime) => {
  const date = new Date(dateTime);

  if (Number.isNaN(date.getTime())) return "—";

  return date.toLocaleString("en-PH", {
    dateStyle: "medium",
    timeStyle: "short",
  });
};

export async function renderStock(container, user) {
  container.innerHTML = `
    <h1 class="page-title">Stock Movement</h1>
    <p class="muted">Loading stock movement records...</p>
  `;

  try {
    const movements = await api.getStockMovements();

    container.innerHTML = `
      <div class="page-header">
        <div>
          <h1 class="page-title">Stock Movement</h1>
          <p class="muted">
            Monitor stock changes caused by sales and other inventory activities.
          </p>
        </div>
      </div>

      <div id="stock-table"></div>
    `;

    const tableContainer = container.querySelector("#stock-table");

    renderTable(tableContainer, {
      columns: [
        {
          key: "dateTime",
          label: "Date & Time",
          render: (movement) =>
            escapeHTML(formatDate(movement.dateTime)),
        },
        {
          key: "sku",
          label: "SKU",
        },
        {
          key: "productName",
          label: "Product Name",
          render: (movement) =>
            `<strong>${escapeHTML(movement.productName)}</strong>`,
        },
        {
          key: "movementType",
          label: "Movement Type",
          render: (movement) =>
            statusChip(movement.movementType),
        },
        {
          key: "quantity",
          label: "Quantity",
          render: (movement) =>
            escapeHTML(movement.quantity),
        },
        {
          key: "reason",
          label: "Reason",
        },
        {
          key: "staff",
          label: "Staff",
        },
      ],
      data: movements,
      searchKeys: [
        "sku",
        "productName",
        "movementType",
        "reason",
        "staff",
      ],
      pageSize: 8,
      emptyMessage: "No stock movements have been recorded yet.",
    });
  } catch (error) {
    console.error("Stock movement loading error:", error);

    container.innerHTML = `
      <h1 class="page-title">Stock Movement</h1>
      <p class="muted">
        Unable to load stock movement records. Please try again.
      </p>
    `;
  }
}
