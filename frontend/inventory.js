// inventory.js: displays product inventory for Cashier and Admin.
import * as api from "./api.js";
import {
  renderTable,
  statusChip,
  escapeHTML,
} from "./components.js";

export async function renderInventory(container, user) {
  // Show a loading message while products are retrieved.
  container.innerHTML = `
    <h1 class="page-title">Inventory</h1>
    <p class="muted">View and monitor available products and stock levels.</p>
    <p>Loading inventory...</p>
  `;

  try {
    const products = await api.getProducts();

    // Calculate the display status based on product status and stock.
    const getProductStatus = (product) => {
      if (product.status === "Archived") return "Archived";
      if (product.status === "Unavailable" || product.stock <= 0) {
        return "Unavailable";
      }
      if (product.stock <= product.reorderLevel) return "Low stock";
      return "Available";
    };

    container.innerHTML = `
      <div class="page-header">
        <div>
          <h1 class="page-title">Inventory</h1>
          <p class="muted">View and monitor available products and stock levels.</p>
        </div>
      </div>

      <div id="inventory-table"></div>
    `;

    const tableContainer = container.querySelector("#inventory-table");

    renderTable(tableContainer, {
      columns: [
        {
          key: "sku",
          label: "SKU",
        },
        {
          key: "name",
          label: "Product Name",
          render: (product) => `
            <strong>${escapeHTML(product.name)}</strong>
          `,
        },
        {
          key: "category",
          label: "Category",
        },
        {
          key: "productType",
          label: "Product Type",
        },
        {
          key: "price",
          label: "Price",
          render: (product) =>
            `₱${Number(product.price).toLocaleString("en-PH", {
              minimumFractionDigits: 2,
            })}`,
        },
        {
          key: "stock",
          label: "Stock",
          render: (product) =>
            `${escapeHTML(product.stock)} ${escapeHTML(product.unit)}`,
        },
        {
          key: "reorderLevel",
          label: "Reorder Level",
          render: (product) =>
            `${escapeHTML(product.reorderLevel)} ${escapeHTML(product.unit)}`,
        },
        {
          key: "status",
          label: "Status",
          render: (product) => {
            const status = getProductStatus(product);

            if (status === "Low stock") {
              return `
                <span class="status-chip status-warning">
                  Low stock
                </span>
              `;
            }

            return statusChip(status);
          },
        },
      ],

      data: products,

      searchKeys: [
        "sku",
        "name",
        "category",
        "productType",
      ],

      filters: [
        {
          label: "Available",
          value: "available",
          predicate: (product) =>
            getProductStatus(product) === "Available",
        },
        {
          label: "Low Stock",
          value: "low",
          predicate: (product) =>
            getProductStatus(product) === "Low stock",
        },
        {
          label: "Unavailable",
          value: "unavailable",
          predicate: (product) =>
            getProductStatus(product) === "Unavailable",
        },
        {
          label: "Archived",
          value: "archived",
          predicate: (product) =>
            getProductStatus(product) === "Archived",
        },
      ],

      pageSize: 8,
      emptyMessage: "No inventory products found.",
    });
  } catch (error) {
    container.innerHTML = `
      <h1 class="page-title">Inventory</h1>
      <p class="muted">Unable to load inventory. Please try again.</p>
    `;

    console.error("Inventory loading error:", error);
  }
}