// inventory.js: displays product inventory for Cashier and Admin.

import * as api from "./api.js";
import {
  renderTable,
  statusChip,
  escapeHTML,
  openModal,
} from "./components.js";

let cloudinaryCloudName = "";

function productImageUrl(sku) {
  if (!cloudinaryCloudName || !sku) return "";
  return `https://res.cloudinary.com/${encodeURIComponent(cloudinaryCloudName)}/image/upload/f_auto,q_auto,w_400/lechon-de-jay/products/${encodeURIComponent(sku)}`;
}

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

// ---------- PRODUCT STATUS ----------
function getProductStatus(product) {
  if (product.status === "Archived") return "Archived";

  if (product.status === "Unavailable" || Number(product.stock) <= 0) {
    return "Unavailable";
  }

  if (product.isExpired) return "Expired";

  if (product.isLowStock) {
    return "Low stock";
  }

  return "Available";
}

// ---------- PRODUCT FORM ----------
function productFormContent(product = null, categories = []) {
  const editing = Boolean(product);
  const selectedCategory = product?.categoryId ?? "";

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
            type="text" placeholder="Enter product name"
            ${editing ? "readonly" : "required"} />
        </div>

        <div class="field">
          <label for="product-category">Category *</label>
          <select class="input" id="product-category" name="categoryId"
            ${editing ? "disabled" : "required"}>
            <option value="">Select category</option>
            ${categories
              .map(
                ({ id, name }) =>
                  `<option value="${escapeHTML(id)}" ${String(selectedCategory) === String(id) ? "selected" : ""}>${escapeHTML(name)}</option>`,
              )
              .join("")}
          </select>
        </div>

        <div class="field">
          <label for="product-type">Product Type *</label>
          <select class="input" id="product-type" name="productType"
            ${editing ? "disabled" : "required"}>
            <option value="">Select product type</option>
            <option value="Finished Good" ${product?.productType === "Finished Good" ? "selected" : ""}>Finished Good</option>
            <option value="Raw Material" ${product?.productType === "Raw Material" ? "selected" : ""}>Raw Material</option>
          </select>
        </div>

        <div class="field" style="grid-column:1/-1;display:flex;align-items:center;gap:8px;">
          <input id="product-is-addon" name="isAddon" type="checkbox"
            ${product?.isAddon ? "checked" : ""} />
          <label for="product-is-addon">Add-on item</label>
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
            placeholder="0"
            ${editing ? "readonly" : "required"} />
        </div>

        <div class="field">
          <label for="product-unit">Unit *</label>
          <select class="input" id="product-unit" name="unit"
            ${editing ? "disabled" : "required"}>
            <option value="">Select unit</option>
            ${["piece", "kilogram", "tray"]
              .map(
                (value) =>
                  `<option value="${value}" ${product?.unit === value ? "selected" : ""}>${value === "kilogram" ? "Kilogram" : value.charAt(0).toUpperCase() + value.slice(1)}</option>`,
              )
              .join("")}
          </select>
        </div>

        <div class="field">
          <label for="product-reorder">Reorder Level</label>
          <input class="input" id="product-reorder" name="reorderLevel"
            type="number" min="0" step="0.01"
            value="${editing ? escapeHTML(product.reorderLevel) : "5"}"
            required />
        </div>

        <div class="field">
          <label for="product-status">Status</label>
          <select class="input" id="product-status" name="status" required>
            <option value="Available" ${product?.status === "Available" || !product ? "selected" : ""}>Available</option>
            <option value="Unavailable" ${product?.status === "Unavailable" ? "selected" : ""}>Unavailable</option>
          </select>
        </div>

        <div class="field">
          <label for="product-expiry">Expiry Date</label>
          <input class="input" id="product-expiry" name="expiryDate"
            type="date" value="${escapeHTML(product?.expiryDate || "")}"
            ${editing ? "disabled" : ""} />
        </div>

        <div class="field product-image-field" style="grid-column:1/-1;">
          <label for="product-image">Product Image (JPG, PNG, WebP; max 2 MB)</label>
          <input class="input" id="product-image" name="image"
            type="file" accept=".jpg,.jpeg,.png,.webp,image/jpeg,image/png,image/webp" />
          <div class="product-image-preview-wrap">
            <img id="product-image-preview"
              src="${escapeHTML(productImageUrl(product?.sku || ""))}"
              alt="${escapeHTML(product?.name || "Product image preview")}"
              ${product?.sku && cloudinaryCloudName ? "" : "hidden"} />
            <div class="product-image-placeholder" id="product-image-placeholder"
              ${product?.sku && cloudinaryCloudName ? "hidden" : ""}>
              <i class="bi bi-image" aria-hidden="true"></i>
              <span>No product image</span>
            </div>
          </div>
        </div>

      </div>

      <div id="whole-lechon-fields"
        style="display:none;margin-top:18px;padding:14px;border:1px solid var(--line);border-radius:10px;">

        <h3 style="margin:0 0 12px;font-size:15px;">Whole Lechon Details</h3>

        <div style="display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:14px;">

          <div class="field">
            <label for="product-size">Size *</label>
            <input class="input" id="product-size" name="size"
              type="text" value="${escapeHTML(product?.size || "")}"
              placeholder="Enter size" ${editing ? "readonly" : ""} />
          </div>

          <div class="field">
            <label for="product-kilos">Weight (kg) *</label>
            <input class="input" id="product-kilos" name="kilos"
              type="number" min="0.01" step="0.01"
              value="${product?.kilos != null ? escapeHTML(product.kilos) : ""}"
              placeholder="20" ${editing ? "readonly" : ""} />
          </div>

          <div class="field" style="grid-column:1/-1;">
            <label for="product-pax">Serving Capacity (Pax) *</label>
            <input class="input" id="product-pax" name="servingPax"
              type="number" min="1" step="1"
              value="${product?.servingPax != null ? escapeHTML(product.servingPax) : ""}"
              placeholder="30" ${editing ? "readonly" : ""} />
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
function renderProductModal(table, categories, product = null) {
  const editing = Boolean(product);

  const modal = openModal({
    title: editing ? "Edit Product" : "Add Product",
    content: productFormContent(product, categories),
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
  const imageInput = form.querySelector("#product-image");
  const imagePreview = form.querySelector("#product-image-preview");
  const imagePlaceholder = form.querySelector("#product-image-placeholder");
  let savedProductId = editing ? product.productId : null;
  let productSaved = false;
  let previewUrl = "";

  imagePreview.addEventListener("error", () => {
    imagePreview.hidden = true;
    imagePlaceholder.hidden = false;
  });
  imageInput.addEventListener("change", () => {
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    const file = imageInput.files?.[0];
    if (!file) return;
    previewUrl = URL.createObjectURL(file);
    imagePreview.src = previewUrl;
    imagePreview.hidden = false;
    imagePlaceholder.hidden = true;
  });

  function updateWholeLechonFields() {
    const selectedCategory = categories.find(
      (item) => String(item.id) === categoryInput.value,
    );
    const isWholeLechon = selectedCategory?.name === "Whole Lechon";

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

    try {
      if (!productSaved) {
        if (editing) {
          await api.updateProduct(product.sku, {
            price: formData.get("price"),
            reorderLevel: formData.get("reorderLevel"),
            status: formData.get("status"),
            isAddon: formData.has("isAddon"),
          });
        } else {
          const categoryId = Number(formData.get("categoryId"));
          const category = categories.find((item) => item.id === categoryId);
          const productData = {
            sku: formData.get("sku"),
            name: formData.get("name"),
            categoryId,
            category: category?.name,
            productType: formData.get("productType"),
            price: formData.get("price"),
            stock: formData.get("stock"),
            unit: formData.get("unit"),
            reorderLevel: formData.get("reorderLevel"),
            status: formData.get("status"),
            expiryDate: formData.get("expiryDate"),
            isAddon: formData.has("isAddon"),
          };

          if (category?.name === "Whole Lechon") {
            productData.size = formData.get("size");
            productData.kilos = formData.get("kilos");
            productData.servingPax = formData.get("servingPax");
          }

          const savedProduct = await api.createProduct(productData);
          savedProductId = savedProduct.id;
        }
        productSaved = true;
      }

      const imageFile = formData.get("image");
      if (imageFile instanceof File && imageFile.size > 0) {
        if (!savedProductId) {
          throw new Error("Product saved, but its ID was not returned.");
        }
        saveButton.textContent = "Uploading Image...";
        await api.uploadProductImage(savedProductId, imageFile);
      }
    } catch (error) {
      errorMessage.textContent = productSaved
        ? `Product saved, but image upload failed: ${error.message || "Unable to upload image."}`
        : error.message || "Unable to save product. Please try again.";

      errorMessage.style.display = "block";
      saveButton.disabled = false;
      saveButton.textContent = productSaved
        ? "Retry Image Upload"
        : editing
          ? "Save Changes"
          : "Save Product";
      return;
    }

    if (previewUrl) URL.revokeObjectURL(previewUrl);
    modal.close();

    try {
      table.setData(await api.getInventory());
    } catch (error) {
      showInventoryNotice(
        "Product Saved, Inventory Not Refreshed",
        error.message || "Unable to refresh inventory.",
        "error",
      );
      return;
    }

    showInventoryNotice(
      editing ? "Product Updated" : "Product Added",
      editing
        ? "Product successfully updated."
        : "Product successfully added to inventory.",
    );
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

  modal.element
    .querySelector("#cancel-archive")
    .addEventListener("click", () => {
      modal.close();
    });

  confirmButton.addEventListener("click", async () => {
    confirmButton.disabled = true;
    confirmButton.textContent = "Archiving...";
    errorMessage.style.display = "none";

    try {
      await api.archiveProduct(product.sku);
    } catch (error) {
      errorMessage.textContent = error.message || "Unable to archive product.";

      errorMessage.style.display = "block";
      confirmButton.disabled = false;
      confirmButton.innerHTML =
        '<span aria-hidden="true">&#128451;</span> Archive Product';
      return;
    }

    modal.close();

    try {
      table.setData(await api.getInventory());
    } catch (error) {
      showInventoryNotice(
        "Product Archived, Inventory Not Refreshed",
        error.message || "Unable to refresh inventory.",
        "error",
      );
      return;
    }

    showInventoryNotice("Product Archived", "Product successfully archived.");
  });
}

// ---------- RESTORE CONFIRMATION ----------
function renderRestoreConfirmation(table, product) {
  const content = `
    <div style="padding-top:4px;">

      <div style="display:flex;align-items:center;gap:12px;margin-bottom:16px;">
        <div style="
          width:42px;height:42px;display:flex;align-items:center;
          justify-content:center;flex-shrink:0;border-radius:50%;
          background:#e8f7ee;color:#16834b;font-size:20px;
        ">
          &#8634;
        </div>

        <div>
          <strong style="display:block;font-size:15px;">Restore this product?</strong>
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
        This product will be marked Available again. Its existing inventory record
        and history will be retained.
      </p>

      <p id="restore-error" class="alert" role="alert"
        style="display:none;margin-top:12px;"></p>

      <div style="display:flex;justify-content:flex-end;gap:10px;margin-top:22px;">
        <button type="button" class="btn btn--soft" id="cancel-restore">
          Cancel
        </button>

        <button type="button" id="confirm-restore" class="btn btn--primary">
          <span aria-hidden="true">&#8634;</span>
          Restore Product
        </button>
      </div>

    </div>
  `;

  const modal = openModal({
    title: "Confirm Restore",
    content,
    size: "small",
  });

  const confirmButton = modal.element.querySelector("#confirm-restore");
  const errorMessage = modal.element.querySelector("#restore-error");

  modal.element
    .querySelector("#cancel-restore")
    .addEventListener("click", () => {
      modal.close();
    });

  confirmButton.addEventListener("click", async () => {
    confirmButton.disabled = true;
    confirmButton.textContent = "Restoring...";
    errorMessage.style.display = "none";

    try {
      await api.restoreProduct(product.sku);
    } catch (error) {
      errorMessage.textContent = error.message || "Unable to restore product.";

      errorMessage.style.display = "block";
      confirmButton.disabled = false;
      confirmButton.innerHTML =
        '<span aria-hidden="true">&#8634;</span> Restore Product';
      return;
    }

    modal.close();

    try {
      table.setData(await api.getInventory());
    } catch (error) {
      showInventoryNotice(
        "Product Restored, Inventory Not Refreshed",
        error.message || "Unable to refresh inventory.",
        "error",
      );
      return;
    }

    showInventoryNotice("Product Restored", "Product successfully restored.");
  });
}

// ---------- INVENTORY PAGE ----------
export async function renderInventory(container, user) {
  container.innerHTML = `
    <h1 class="page-title">Inventory</h1>
    <p class="muted">View and monitor available products and stock levels.</p>
    <p>Loading inventory...</p>
  `;

  async function loadProducts() {
    const [products, stockAlerts] = await Promise.all([
      api.getInventory(),
      api.getLowStock(),
    ]);
    const lowStockSkus = new Set(stockAlerts.low_stock.map((item) => item.sku));
    const expiredSkus = new Set(stockAlerts.expired.map((item) => item.sku));

    return products.map((product) => ({
      ...product,
      isLowStock: lowStockSkus.has(product.sku),
      isExpired: expiredSkus.has(product.sku),
    }));
  }

  try {
    const [products, categories, configuredCloudName] = await Promise.all([
      loadProducts(),
      user?.role === "Admin" ? api.getCategories() : Promise.resolve([]),
      api.getCloudinaryConfig(),
    ]);
    cloudinaryCloudName = configuredCloudName;

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
    tableContainer.addEventListener(
      "error",
      (event) => {
        const image = event.target;
        if (
          !(image instanceof HTMLImageElement) ||
          !image.classList.contains("inventory-product-image-photo")
        ) {
          return;
        }
        image.hidden = true;
        const placeholder = image.nextElementSibling;
        if (placeholder) placeholder.hidden = false;
      },
      true,
    );

    const columns = [
      {
        key: "image",
        label: "Image",
        render: (product) => {
          const imageUrl = productImageUrl(product.sku);
          return `
            <span class="inventory-product-image">
              <img class="inventory-product-image-photo"
                ${imageUrl ? `src="${escapeHTML(imageUrl)}"` : ""}
                alt="${escapeHTML(product.name)}"
                ${imageUrl ? "" : "hidden"} />
              <span class="inventory-product-image-placeholder"
                ${imageUrl ? "hidden" : ""}>
                <i class="bi bi-image" aria-hidden="true"></i>
              </span>
            </span>
          `;
        },
      },
      { key: "sku", label: "SKU" },

      {
        key: "name",
        label: "Product Name",
        render: (product) => `
          <strong>${escapeHTML(product.name)}</strong>
          ${product.isAddon ? '<span class="status-chip status-warning">Add-on</span>' : ""}
        `,
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
                { year: "numeric", month: "short", day: "numeric" },
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

          if (status === "Expired") {
            return `<span class="status-chip status-inactive">Expired</span>`;
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
            return `
              <div class="inventory-actions">
                <button
                  type="button"
                  class="inventory-action-btn inventory-restore"
                  data-sku="${escapeHTML(product.sku)}"
                  aria-label="Restore ${escapeHTML(product.name)}"
                  title="Restore product"
                >
                  <span aria-hidden="true">&#8634;</span>
                  Restore
                </button>
              </div>
            `;
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
          label: "Expired",
          value: "expired",
          predicate: (product) => getProductStatus(product) === "Expired",
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
        renderProductModal(table, categories);
      });
    }

    tableContainer.addEventListener("click", async (event) => {
      const target = event.target;
      if (!(target instanceof Element)) return;

      const editButton = target.closest(".inventory-edit");
      const archiveButton = target.closest(".inventory-archive");
      const restoreButton = target.closest(".inventory-restore");
      const clickedButton = editButton || archiveButton || restoreButton;
      if (!clickedButton || clickedButton.disabled) return;

      const sku = clickedButton.dataset.sku;
      if (!sku) return;
      clickedButton.disabled = true;

      try {
        const product = await api.getProduct(sku);

        if (restoreButton) {
          if (product.status !== "Archived") {
            showInventoryNotice(
              "Product No Longer Archived",
              "This product is no longer archived.",
              "error",
            );
            return;
          }

          renderRestoreConfirmation(table, product);
          return;
        }

        if (product.status === "Archived") {
          showInventoryNotice(
            "Product Already Archived",
            "This product is already archived.",
            "error",
          );
          return;
        }

        if (editButton) {
          renderProductModal(table, categories, product);
        } else {
          renderArchiveConfirmation(table, product);
        }
      } catch (error) {
        showInventoryNotice(
          "Unable to Process Product",
          error.message || "Unable to process product action.",
          "error",
        );
      } finally {
        clickedButton.disabled = false;
      }
    });
  } catch (error) {
    container.innerHTML = `
      <h1 class="page-title">Inventory</h1>
      <p class="alert" role="alert">${escapeHTML(error.message || "Unable to load inventory.")}</p>
    `;

    console.error("Inventory loading error:", error);
  }
}
