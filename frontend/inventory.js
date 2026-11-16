
// inventory.js: displays product inventory for Cashier and Admin.

import * as api from "./api.js";
import {
  renderTable,
  statusChip,
  escapeHTML,
  openModal,
} from "./components.js";

const FLAG_REASONS = ["delivery", "expired", "spoilage"];

// ---------- CUSTOM NOTIFICATION ----------
function showInventoryNotice(title, message, type = "success") {
  const isError = type === "error";

  const modal = openModal({
    title,
    size: "small",
    content: `
      <div style="padding:4px 0;">
        <div style="
          display:flex;
          align-items:center;
          gap:12px;
          margin-bottom:16px;
        ">
          <div style="
            width:42px;
            height:42px;
            flex-shrink:0;
            display:flex;
            align-items:center;
            justify-content:center;
            border-radius:50%;
            background:${isError ? "#fff0f0" : "#e8f7ee"};
            color:${isError ? "#b90914" : "#16834b"};
            font-size:21px;
          ">
            ${isError ? "&#10006;" : "&#10003;"}
          </div>

          <div style="font-size:14px;line-height:1.6;">
            ${escapeHTML(message)}
          </div>
        </div>

        <div style="display:flex;justify-content:flex-end;margin-top:20px;">
          <button type="button" class="btn btn--primary" id="inventory-notice-ok">
            OK
          </button>
        </div>
      </div>
    `,
  });

  modal.element
    .querySelector("#inventory-notice-ok")
    .addEventListener("click", () => modal.close());
}

// ---------- BUILD STOCK FLAGS ----------
function buildFlags(movements) {
  const latest = {};

  for (const movement of movements) {
    const reason = String(movement.reason || "").toLowerCase();

    if (!FLAG_REASONS.includes(reason)) continue;

    const time = new Date(movement.dateTime).getTime();

    if (!latest[movement.sku] || time > latest[movement.sku].time) {
      latest[movement.sku] = { time, reason };
    }
  }

  const flags = {};

  for (const [sku, { reason }] of Object.entries(latest)) {
    if (reason === "expired") flags[sku] = "Expired";
    if (reason === "spoilage") flags[sku] = "Spoilage";
  }

  return flags;
}

// ---------- PRODUCT STATUS ----------
function getProductStatus(product) {
  if (product.status === "Archived") return "Archived";

  if (product.status === "Unavailable" || Number(product.stock) <= 0) {
    return "Unavailable";
  }

  if (Number(product.stock) <= Number(product.reorderLevel)) {
    return "Low stock";
  }

  return "Available";
}

// ---------- PRODUCT FORM ----------
function productFormContent(product = null) {
  const editing = Boolean(product);

  return `
    <form id="product-form">

      <div style="display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:14px;">

        <div class="field">
          <label for="product-sku">Product SKU *</label>
          <input class="input" id="product-sku" name="sku"
            value="${escapeHTML(product?.sku || "")}"
            type="text" maxlength="30"
            placeholder="Example: MEL-005"
            ${editing ? "readonly" : "required"} />
        </div>

        <div class="field">
          <label for="product-name">Product Name *</label>
          <input class="input" id="product-name" name="name"
            value="${escapeHTML(product?.name || "")}"
            type="text" placeholder="Enter product name" required />
        </div>

        <div class="field">
          <label for="product-category">Category *</label>
          <select class="input" id="product-category" name="category" required>
            <option value="">Select category</option>
            ${["Meals", "Snacks & Sides", "Desserts and Drinks", "Whole Lechon", "Raw Materials"]
              .map((value) => `<option value="${escapeHTML(value)}" ${product?.category === value ? "selected" : ""}>${escapeHTML(value)}</option>`)
              .join("")}
          </select>
        </div>

        <div class="field">
          <label for="product-type">Product Type *</label>
          <select class="input" id="product-type" name="productType" required>
            <option value="">Select product type</option>
            <option value="Finished good" ${product?.productType === "Finished good" ? "selected" : ""}>Finished good</option>
            <option value="Raw material" ${product?.productType === "Raw material" ? "selected" : ""}>Raw material</option>
          </select>
        </div>

        <div class="field">
          <label for="product-price">Selling Price (₱) *</label>
          <input class="input" id="product-price" name="price"
            type="number" min="0" step="0.01"
            value="${editing ? escapeHTML(product.price) : ""}"
            placeholder="0.00" required />
        </div>

        <div class="field">
          <label for="product-stock">Current Stock *</label>
          <input class="input" id="product-stock" name="stock"
            type="number" min="0" step="0.01"
            value="${editing ? escapeHTML(product.stock) : ""}"
            placeholder="0" required />
        </div>

        <div class="field">
          <label for="product-unit">Unit *</label>
          <select class="input" id="product-unit" name="unit" required>
            <option value="">Select unit</option>
            ${["piece", "tray", "kg", "pack", "serving", "bottle"]
              .map((value) => `<option value="${value}" ${product?.unit === value ? "selected" : ""}>${value === "kg" ? "Kilogram (kg)" : value.charAt(0).toUpperCase() + value.slice(1)}</option>`)
              .join("")}
          </select>
        </div>

        <div class="field">
          <label for="product-reorder">Reorder Level *</label>
          <input class="input" id="product-reorder" name="reorderLevel"
            type="number" min="0" step="0.01"
            value="${editing ? escapeHTML(product.reorderLevel) : "5"}"
            required />
        </div>

        <div class="field" style="grid-column:1/-1;">
          <label for="product-expiry">Expiry Date (Optional)</label>
          <input class="input" id="product-expiry" name="expiryDate"
            type="date" value="${escapeHTML(product?.expiryDate || "")}" />
        </div>

      </div>

      <div id="whole-lechon-fields"
        style="display:none;margin-top:18px;padding:14px;border:1px solid var(--line);border-radius:10px;">

        <h3 style="margin:0 0 12px;font-size:15px;">Whole Lechon Details</h3>

        <div style="display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:14px;">

          <div class="field">
            <label for="product-size">Size *</label>
            <select class="input" id="product-size" name="size">
              <option value="">Select size</option>
              ${["Small", "Medium", "Large", "Extra Large"]
                .map((value) => `<option value="${value}" ${product?.size === value ? "selected" : ""}>${value}</option>`)
                .join("")}
            </select>
          </div>

          <div class="field">
            <label for="product-kilos">Weight (kg) *</label>
            <input class="input" id="product-kilos" name="kilos"
              type="number" min="0.01" step="0.01"
              value="${product?.kilos != null ? escapeHTML(product.kilos) : ""}"
              placeholder="20" />
          </div>

          <div class="field" style="grid-column:1/-1;">
            <label for="product-pax">Serving Capacity (Pax) *</label>
            <input class="input" id="product-pax" name="servingPax"
              type="number" min="1" step="1"
              value="${product?.servingPax != null ? escapeHTML(product.servingPax) : ""}"
              placeholder="30" />
          </div>

        </div>
      </div>

      <p id="product-form-error" class="alert" role="alert"
        style="display:none;margin-top:14px;"></p>

      <div style="display:flex;justify-content:flex-end;gap:10px;margin-top:22px;">
        <button type="button" class="btn btn--soft" id="cancel-product">
          Cancel
        </button>

        <button type="submit" class="btn btn--primary" id="save-product">
          ${editing ? "Save Changes" : "Save Product"}
        </button>
      </div>

    </form>
  `;
}

// ---------- ADD / EDIT PRODUCT MODAL ----------
function renderProductModal(table, product = null) {
  const editing = Boolean(product);

  const modal = openModal({
    title: editing ? "Edit Product" : "Add Product",
    content: productFormContent(product),
    size: "medium",
  });

  const form = modal.element.querySelector("#product-form");
  const categoryInput = form.querySelector("#product-category");
  const wholeFields = form.querySelector("#whole-lechon-fields");
  const sizeInput = form.querySelector("#product-size");
  const kilosInput = form.querySelector("#product-kilos");
  const paxInput = form.querySelector("#product-pax");
  const errorMessage = form.querySelector("#product-form-error");
  const saveButton = form.querySelector("#save-product");

  function updateWholeLechonFields() {
    const isWholeLechon = categoryInput.value === "Whole Lechon";

    wholeFields.style.display = isWholeLechon ? "block" : "none";
    sizeInput.required = isWholeLechon;
    kilosInput.required = isWholeLechon;
    paxInput.required = isWholeLechon;
  }

  updateWholeLechonFields();
  categoryInput.addEventListener("change", updateWholeLechonFields);

  form.querySelector("#cancel-product").addEventListener("click", () => {
    modal.close();
  });

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    errorMessage.style.display = "none";

    if (!form.reportValidity()) return;

    saveButton.disabled = true;
    saveButton.textContent = "Saving...";

    const formData = new FormData(form);

    const productData = {
      sku: formData.get("sku"),
      name: formData.get("name"),
      category: formData.get("category"),
      productType: formData.get("productType"),
      price: formData.get("price"),
      stock: formData.get("stock"),
      unit: formData.get("unit"),
      reorderLevel: formData.get("reorderLevel"),
      expiryDate: formData.get("expiryDate"),
      size: formData.get("size"),
      kilos: formData.get("kilos"),
      servingPax: formData.get("servingPax"),
    };

    try {
      if (editing) {
        await api.updateProduct(product.sku, productData);
      } else {
        await api.addProduct(productData);
      }

      const updatedProducts = await api.getProducts();
      table.setData(updatedProducts);

      modal.close();

      showInventoryNotice(
        editing ? "Product Updated" : "Product Added",
        editing
          ? "Product successfully updated."
          : "Product successfully added to inventory."
      );

    } catch (error) {
      errorMessage.textContent =
        error.message || "Unable to save product. Please try again.";

      errorMessage.style.display = "block";
      saveButton.disabled = false;
      saveButton.textContent = editing ? "Save Changes" : "Save Product";
    }
  });
}

// ---------- ARCHIVE CONFIRMATION ----------
function renderArchiveConfirmation(table, product) {
  const content = `
    <div style="padding-top:4px;">

      <div style="display:flex;align-items:center;gap:12px;margin-bottom:16px;">
        <div style="
          width:42px;height:42px;display:flex;align-items:center;
          justify-content:center;flex-shrink:0;border-radius:50%;
          background:#fff0f0;color:#b90914;font-size:20px;
        ">
          &#128451;
        </div>

        <div>
          <strong style="display:block;font-size:15px;">Archive this product?</strong>
          <span class="muted" style="font-size:13px;">Please review the product details below.</span>
        </div>
      </div>

      <div style="
        padding:14px;background:var(--surface, #f5f5f5);
        border:1px solid var(--line);border-radius:10px;margin-bottom:14px;
      ">
        <strong style="display:block;">${escapeHTML(product.name)}</strong>
        <span class="muted" style="font-size:13px;">
          SKU: ${escapeHTML(product.sku)}
        </span>
      </div>

      <p class="muted" style="font-size:13px;line-height:1.6;">
        This product will be marked as Archived and should no longer be available for sale.
        Its existing inventory record and history will be retained.
      </p>

      <p id="archive-error" class="alert" role="alert"
        style="display:none;margin-top:12px;"></p>

      <div style="display:flex;justify-content:flex-end;gap:10px;margin-top:22px;">
        <button type="button" class="btn btn--soft" id="cancel-archive">
          Cancel
        </button>

        <button type="button" id="confirm-archive" class="inventory-confirm-archive">
          <span aria-hidden="true">&#128451;</span>
          Archive Product
        </button>
      </div>

    </div>
  `;

  const modal = openModal({
    title: "Confirm Archive",
    content,
    size: "small",
  });

  const confirmButton = modal.element.querySelector("#confirm-archive");
  const errorMessage = modal.element.querySelector("#archive-error");

  modal.element.querySelector("#cancel-archive").addEventListener("click", () => {
    modal.close();
  });

  confirmButton.addEventListener("click", async () => {
    confirmButton.disabled = true;
    confirmButton.textContent = "Archiving...";
    errorMessage.style.display = "none";

    try {
      await api.archiveProduct(product.sku);

      const updatedProducts = await api.getProducts();
      table.setData(updatedProducts);

      modal.close();

      showInventoryNotice(
        "Product Archived",
        "Product successfully archived."
      );

    } catch (error) {
      errorMessage.textContent =
        error.message || "Unable to archive product.";

      errorMessage.style.display = "block";
      confirmButton.disabled = false;
      confirmButton.innerHTML = '<span aria-hidden="true">&#128451;</span> Archive Product';
    }
  });
}

// ---------- INVENTORY PAGE ----------
export async function renderInventory(container, user) {
  container.innerHTML = `
    <h1 class="page-title">Inventory</h1>
    <p class="muted">View and monitor available products and stock levels.</p>
    <p>Loading inventory...</p>
  `;

  try {
    const [products, movements] = await Promise.all([
      api.getProducts(),
      api.getStockMovements(),
    ]);

    const flags = buildFlags(movements);

    container.innerHTML = `
      <div class="page-header"
        style="display:flex;justify-content:space-between;align-items:center;gap:16px;flex-wrap:wrap;">

        <div>
          <h1 class="page-title">Inventory</h1>
          <p class="muted">View and monitor available products and stock levels.</p>
        </div>

        ${
          user?.role === "Admin"
            ? `<button type="button" class="btn btn--primary" id="add-product-button">
                 + Add Product
               </button>`
            : ""
        }

      </div>

      <div id="inventory-table"></div>
    `;

    const tableContainer = container.querySelector("#inventory-table");

    const columns = [
      { key: "sku", label: "SKU" },

      {
        key: "name",
        label: "Product Name",
        render: (product) => `<strong>${escapeHTML(product.name)}</strong>`,
      },

      { key: "category", label: "Category" },
      { key: "productType", label: "Product Type" },

      {
        key: "price",
        label: "Price",
        render: (product) =>
          `₱${Number(product.price).toLocaleString("en-PH", {
            minimumFractionDigits: 2,
            maximumFractionDigits: 2,
          })}`,
      },

      {
        key: "stock",
        label: "Current Stock",
        render: (product) => escapeHTML(product.stock),
      },

      {
        key: "unit",
        label: "Unit",
        render: (product) => escapeHTML(product.unit),
      },

      {
        key: "reorderLevel",
        label: "Reorder Level",
        render: (product) => escapeHTML(product.reorderLevel),
      },

      {
        key: "expiryDate",
        label: "Expiry",
        render: (product) =>
          product.expiryDate
            ? new Date(product.expiryDate + "T00:00:00").toLocaleDateString(
                "en-PH",
                { year: "numeric", month: "short", day: "numeric" }
              )
            : "—",
      },

      {
        key: "status",
        label: "Status",
        render: (product) => {
          const status = getProductStatus(product);

          if (status === "Low stock") {
            return `<span class="status-chip status-warning">Low stock</span>`;
          }

          return statusChip(status);
        },
      },
    ];

    // ---------- ADMIN ACTION BUTTONS ----------
    if (user?.role === "Admin") {
      columns.push({
        key: "actions",
        label: "Actions",

        render: (product) => {
          if (getProductStatus(product) === "Archived") {
            return `<span class="inventory-archived-label">Archived</span>`;
          }

          return `
            <div class="inventory-actions">

              <button
                type="button"
                class="inventory-action-btn inventory-edit"
                data-sku="${escapeHTML(product.sku)}"
                aria-label="Edit ${escapeHTML(product.name)}"
                title="Edit product"
              >
                <span aria-hidden="true">&#9998;</span>
                Edit
              </button>

              <button
                type="button"
                class="inventory-action-btn inventory-archive"
                data-sku="${escapeHTML(product.sku)}"
                aria-label="Archive ${escapeHTML(product.name)}"
                title="Archive product"
              >
                <span aria-hidden="true">&#128451;</span>
                Archive
              </button>

            </div>
          `;
        },
      });
    }

    const table = renderTable(tableContainer, {
      columns,
      data: products,
      searchKeys: ["sku", "name", "category", "productType"],

      filters: [
        {
          label: "Available",
          value: "available",
          predicate: (product) => getProductStatus(product) === "Available",
        },
        {
          label: "Low Stock",
          value: "low",
          predicate: (product) => getProductStatus(product) === "Low stock",
        },
        {
          label: "Unavailable",
          value: "unavailable",
          predicate: (product) => getProductStatus(product) === "Unavailable",
        },
        {
          label: "Archived",
          value: "archived",
          predicate: (product) => getProductStatus(product) === "Archived",
        },
      ],

      pageSize: 8,
      emptyMessage: "No inventory products found.",
    });

    // ---------- ADD PRODUCT ----------
    const addButton = container.querySelector("#add-product-button");

    if (addButton && user?.role === "Admin") {
      addButton.addEventListener("click", () => {
        renderProductModal(table);
      });
    }

    // ---------- EDIT AND ARCHIVE ----------
    tableContainer.addEventListener("click", async (event) => {
      const target = event.target;

      if (!(target instanceof Element)) return;

      const editButton = target.closest(".inventory-edit");
      const archiveButton = target.closest(".inventory-archive");

      if (!editButton && !archiveButton) return;

      const clickedButton = editButton || archiveButton;
      const sku = clickedButton.dataset.sku;

      if (!sku || clickedButton.disabled) return;

      clickedButton.disabled = true;

      try {
        const latestProducts = await api.getProducts();

        const product = latestProducts.find(
          (item) => String(item.sku).toUpperCase() === sku.toUpperCase()
        );

        if (!product) {
          showInventoryNotice(
            "Product Not Found",
            "Product could not be found. Please refresh the inventory.",
            "error"
          );
          return;
        }

        if (product.status === "Archived") {
          showInventoryNotice(
            "Product Already Archived",
            "This product is already archived.",
            "error"
          );
          return;
        }

        if (editButton) {
          renderProductModal(table, product);
        } else {
          renderArchiveConfirmation(table, product);
        }

      } catch (error) {
        showInventoryNotice(
          "Unable to Open Product",
          error.message || "Unable to open product action.",
          "error"
        );

      } finally {
        clickedButton.disabled = false;
      }
    });

  } catch (error) {
    container.innerHTML = `
      <h1 class="page-title">Inventory</h1>
      <p class="muted">Unable to load inventory. Please try again.</p>
    `;

    console.error("Inventory loading error:", error);
  }
}
