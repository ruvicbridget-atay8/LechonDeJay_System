
// stock.js: Stock Movement page for Admin.

import * as api from "./api.js";
import {
  renderTable,
  statusChip,
  escapeHTML,
  openModal,
} from "./components.js";

// ---------- DATE FORMAT ----------
const formatDate = (dateTime) => {
  const date = new Date(dateTime);

  if (Number.isNaN(date.getTime())) return "—";

  return date.toLocaleString("en-PH", {
    dateStyle: "medium",
    timeStyle: "short",
  });
};

// ---------- QUANTITY FORMAT ----------
const formatQuantity = (quantity) => {
  const value = Number(quantity) || 0;

  const formatted = Math.abs(value).toLocaleString("en-PH", {
    maximumFractionDigits: 3,
  });

  if (value > 0) return `+${formatted}`;
  if (value < 0) return `-${formatted}`;

  return "0";
};

// ---------- CUSTOM STOCK NOTICE ----------
function showStockNotice(title, message, type = "success", details = "") {
  const isError = type === "error";

  const modal = openModal({
    title,
    size: "small",

    content: `
      <div style="text-align:center; padding:0.5rem 0;">

        <div style="
          width:48px;
          height:48px;
          border-radius:50%;
          margin:0 auto 12px;
          display:flex;
          align-items:center;
          justify-content:center;
          background:${isError ? "#fde9e6" : "#e5f7ed"};
          color:${isError ? "#b42318" : "#16834b"};
          font-size:22px;
        ">
          <i class="bi ${isError ? "bi-exclamation-circle" : "bi-check-circle"}"></i>
        </div>

        <p style="color:#475467; margin:0;">
          ${escapeHTML(message)}
        </p>

        ${details ? `
          <div style="
            text-align:left;
            background:#f9fafb;
            border:1px solid #eaecf0;
            border-radius:8px;
            padding:12px;
            margin-top:15px;
            font-size:13px;
            line-height:1.8;
          ">
            ${details}
          </div>
        ` : ""}

        <div style="display:flex; justify-content:center; margin-top:20px;">
          <button type="button" class="btn btn--primary" id="stock-notice-ok">
            OK
          </button>
        </div>

      </div>
    `,
  });

  modal.element
    .querySelector("#stock-notice-ok")
    .addEventListener("click", () => modal.close());
}

// ---------- RENDER STOCK MOVEMENT ----------
export async function renderStock(container, user) {
  container.innerHTML = `
    <h1 class="page-title">Stock Movement</h1>
    <p class="muted">Loading stock movement records...</p>
  `;

  try {
    const movements = await api.getStockMovements();

    container.innerHTML = `
      <div class="page-header"
           style="display:flex; justify-content:space-between; align-items:flex-start; gap:1rem; flex-wrap:wrap;">

        <div>
          <h1 class="page-title">Stock Movement</h1>
          <p class="muted">
            Monitor and record changes to product stock.
          </p>
        </div>

        <button type="button"
                class="btn btn--primary"
                id="open-stock-movement">
          <i class="bi bi-plus-lg" aria-hidden="true"></i>
          Log Stock Movement
        </button>

      </div>

      <div id="stock-table"></div>
    `;

    const tableContainer = container.querySelector("#stock-table");

    const table = renderTable(tableContainer, {
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
          label: "Quantity Change",
          render: (movement) =>
            escapeHTML(formatQuantity(movement.quantity)),
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

    // ---------- OPEN STOCK MOVEMENT MODAL ----------
    container
      .querySelector("#open-stock-movement")
      .addEventListener("click", async () => {
        try {
          // Retrieve fresh product information whenever the modal opens.
          const products = await api.getProducts();

          const activeProducts = products.filter(
            (product) => product.status !== "Archived"
          );

          if (!activeProducts.length) {
            showStockNotice(
              "No Available Products",
              "There are no active products available for stock movement.",
              "error"
            );
            return;
          }

          const productOptions = activeProducts.map((product) => `
            <option value="${escapeHTML(product.sku)}">
              ${escapeHTML(product.name)}
              (${escapeHTML(product.sku)})
              — Current stock: ${escapeHTML(product.stock)}
              ${escapeHTML(product.unit || "")}
            </option>
          `).join("");

          const modal = openModal({
            title: "Log Stock Movement",
            size: "medium",

            content: `
              <form id="stock-movement-form"
                    style="display:grid; gap:1rem;">

                <div class="field">
                  <label for="movement-type">Movement Type</label>

                  <select id="movement-type"
                          name="movementType"
                          class="input"
                          required>
                    <option value="in">Stock In</option>
                    <option value="out">Stock Out</option>
                    <option value="adjustment">Adjustment</option>
                  </select>
                </div>

                <div class="field">
                  <label for="movement-product">Product</label>

                  <select id="movement-product"
                          name="sku"
                          class="input"
                          required>
                    ${productOptions}
                  </select>
                </div>

                <div class="field">
                  <label for="movement-quantity"
                         id="quantity-label">
                    Quantity to Add
                  </label>

                  <input id="movement-quantity"
                         name="quantity"
                         class="input"
                         type="number"
                         min="0.001"
                         step="any"
                         placeholder="Enter quantity"
                         required>

                  <small class="muted"
                         id="quantity-help">
                    Enter the amount to add to the current stock.
                  </small>
                </div>

                <div class="field">
                  <label for="movement-reason">Reason</label>

                  <select id="movement-reason"
                          name="reason"
                          class="input"
                          required>
                    <option value="">Select a reason</option>
                    <option value="Delivery">Delivery</option>
                    <option value="Expired">Expired</option>
                    <option value="Spoilage">Spoilage</option>
                    <option value="Damaged">Damaged</option>
                    <option value="Correction">Correction</option>
                    <option value="Other">Other</option>
                  </select>
                </div>

                <div class="field">
                  <label for="movement-notes">
                    Notes (Optional)
                  </label>

                  <textarea id="movement-notes"
                            name="notes"
                            class="input"
                            rows="3"
                            placeholder="Add additional details..."
                            style="padding:0.75rem; min-height:90px; resize:vertical;"></textarea>
                </div>

                <p id="movement-error"
                   class="alert"
                   role="alert"
                   hidden></p>

                <div style="display:flex; justify-content:flex-end; gap:0.75rem; flex-wrap:wrap;">

                  <button type="button"
                          class="btn btn--soft"
                          id="cancel-stock-movement">
                    Cancel
                  </button>

                  <button type="submit"
                          class="btn btn--primary"
                          id="save-stock-movement">
                    Save Movement
                  </button>

                </div>
              </form>
            `,
          });

          const form = modal.element.querySelector(
            "#stock-movement-form"
          );

          const typeInput = form.querySelector("#movement-type");
          const quantityInput = form.querySelector("#movement-quantity");
          const quantityLabel = form.querySelector("#quantity-label");
          const quantityHelp = form.querySelector("#quantity-help");
          const errorMessage = form.querySelector("#movement-error");
          const saveButton = form.querySelector("#save-stock-movement");

          // ---------- UPDATE QUANTITY INSTRUCTIONS ----------
          function updateQuantityInstructions() {
            const type = typeInput.value;

            if (type === "in") {
              quantityLabel.textContent = "Quantity to Add";

              quantityHelp.textContent =
                "Enter the amount to add to the current stock.";

              quantityInput.min = "0.001";
              quantityInput.placeholder = "Enter quantity to add";

            } else if (type === "out") {
              quantityLabel.textContent = "Quantity to Remove";

              quantityHelp.textContent =
                "Enter the amount to deduct from the current stock.";

              quantityInput.min = "0.001";
              quantityInput.placeholder = "Enter quantity to remove";

            } else {
              quantityLabel.textContent = "New Total Stock";

              quantityHelp.textContent =
                "Enter the new total stock after adjustment. Enter 0 if there is no stock.";

              quantityInput.min = "0";
              quantityInput.placeholder = "Enter new total stock";
            }

            quantityInput.value = "";
          }

          typeInput.addEventListener(
            "change",
            updateQuantityInstructions
          );

          // ---------- CANCEL ----------
          form
            .querySelector("#cancel-stock-movement")
            .addEventListener("click", () => {
              modal.close();
            });

          // ---------- SAVE MOVEMENT ----------
          form.addEventListener("submit", async (event) => {
            event.preventDefault();

            errorMessage.hidden = true;
            errorMessage.textContent = "";

            if (!form.reportValidity()) return;

            const formData = new FormData(form);

            const selectedSku = formData.get("sku");

            const selectedProduct = activeProducts.find(
              (product) => product.sku === selectedSku
            );

            try {
              saveButton.disabled = true;
              saveButton.textContent = "Saving...";

              // Wait for the stock movement result.
              const result = await api.saveStockMovement({
                sku: selectedSku,
                movementType: formData.get("movementType"),
                quantity: formData.get("quantity"),
                reason: formData.get("reason"),
                notes: formData.get("notes"),
                staff: user?.name || "Admin",
              });

              // Retrieve and display updated movement history.
              const updatedMovements = await api.getStockMovements();

              table.setData(updatedMovements);

              modal.close();

              // Show updated stock information.
              showStockNotice(
                "Stock Movement Saved",
                "The stock movement was recorded successfully.",
                "success",
                `
                  <div>
                    <strong>Product:</strong>
                    ${escapeHTML(selectedProduct?.name || result.sku)}
                  </div>

                  <div>
                    <strong>Previous Stock:</strong>
                    ${escapeHTML(result.previousStock)}
                  </div>

                  <div>
                    <strong>New Stock:</strong>
                    ${escapeHTML(result.newStock)}
                  </div>
                `
              );

            } catch (error) {
              errorMessage.textContent =
                error.message || "Unable to save stock movement.";

              errorMessage.hidden = false;

            } finally {
              saveButton.disabled = false;
              saveButton.textContent = "Save Movement";
            }
          });

          updateQuantityInstructions();

        } catch (error) {
          console.error("Unable to open stock movement form:", error);

          showStockNotice(
            "Unable to Open Stock Movement",
            error.message || "Unable to open the stock movement form.",
            "error"
          );
        }
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

