// api.js: session authentication plus application data.
const readData = (id) =>
  JSON.parse(document.getElementById(id)?.textContent || "[]");

const API_BASE_URL = "http://127.0.0.1:5000";
let memorySession = null;

// ---------- Login and Session ----------
function sessionUser(data) {
  if (
    !data ||
    data.authenticated === false ||
    data.user_id == null ||
    typeof data.full_name !== "string" ||
    typeof data.username !== "string" ||
    typeof data.role !== "string"
  ) {
    throw new Error("The server returned an invalid user profile.");
  }

  return {
    id: data.user_id,
    name: data.full_name,
    username: data.username,
    role: data.role,
    active: data.account_status === "Active",
  };
}

async function authRequest(path, options = {}, allowUnauthenticated = false) {
  const response = await fetch(`${API_BASE_URL}${path}`, {
    ...options,
    credentials: "include",
    headers: {
      Accept: "application/json",
      ...(options.headers || {}),
    },
  });

  let data = null;
  try {
    data = await response.json();
  } catch {
    // The status code below remains authoritative for non-JSON responses.
  }

  if (allowUnauthenticated && response.status === 401) return null;
  if (!response.ok) {
    throw new Error(
      (data && data.message) || `Authentication request failed (${response.status}).`,
    );
  }
  if (!data || typeof data !== "object") {
    throw new Error("The server returned an invalid authentication response.");
  }

  return data;
}

export async function login(credentials) {
  const username = String(credentials?.username || credentials?.email || "").trim();
  const password = String(credentials?.password || "");

  if (!username || !password) {
    throw new Error("Enter your username and password.");
  }

  const data = await authRequest("/auth/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username, password }),
  });
  if (data.success !== true) {
    throw new Error(data.message || "Unable to sign in.");
  }

  memorySession = sessionUser(data);
  return memorySession;
}

export async function getCurrentUser() {
  const data = await authRequest("/auth/me", {}, true);
  if (!data) {
    memorySession = null;
    return null;
  }
  if (data.authenticated === false) {
    memorySession = null;
    return null;
  }
  if (data.authenticated !== true) {
    throw new Error(data.message || "The server could not verify your session.");
  }

  memorySession = sessionUser(data);
  return memorySession;
}

export async function logout() {
  const data = await authRequest("/auth/logout", { method: "POST" }, true);
  memorySession = null;
  if (data && data.success !== true) {
    throw new Error(data.message || "Unable to log out.");
  }
}

// ---------- Account Management ----------
async function usersRequest(path, options = {}) {
  const response = await fetch(`${API_BASE_URL}${path}`, {
    ...options,
    credentials: "include",
    headers: {
      Accept: "application/json",
      ...(options.headers || {}),
    },
  });

  let data = null;
  try {
    data = await response.json();
  } catch {
    // Preserve the HTTP error when the backend returns a non-JSON response.
  }

  if (response.status === 401) {
    window.location.reload();
  }
  if (!response.ok) {
    throw new Error(
      (data && data.message) || `Users request failed (${response.status}).`,
    );
  }
  if (!data || typeof data !== "object") {
    throw new Error("The server returned an invalid users response.");
  }

  return data;
}

function mapAccountUser(user) {
  const {
    user_id: id,
    full_name: name,
    contact_number: contactNumber,
    account_status: accountStatus,
    ...rest
  } = user;

  return {
    ...rest,
    id,
    name,
    contactNumber,
    active: accountStatus === "Active",
  };
}

export async function getUsers(search = "", role = "") {
  const params = new URLSearchParams({
    search: String(search || ""),
    role: String(role || ""),
  });
  const data = await usersRequest(`/users?${params}`);

  if (!Array.isArray(data.users)) {
    throw new Error("The server returned an invalid users list.");
  }

  return { ...data, users: data.users.map(mapAccountUser) };
}

export async function createUser(userData) {
  const data = await usersRequest("/users", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      full_name: userData.name,
      username: userData.username,
      password: userData.password,
      role: userData.role,
      contact_number: userData.contactNumber,
    }),
  });
  const { user_id: id, ...result } = data;

  return { ...result, id };
}

export async function deactivateUser(id) {
  const data = await usersRequest(`/users/${encodeURIComponent(id)}/deactivate`, {
    method: "PATCH",
  });

  return {
    ...data,
    user: data.user ? mapAccountUser(data.user) : data.user,
  };
}

// ---------- Products ----------
const PRODUCTS = readData("data-products");

// Kept for the existing mock transaction and report flows.
export async function getProducts() {
  return PRODUCTS.map((p) => ({
    ...p,
    image: p.image || `assets/productsimage/${p.sku}.jpg`,
  }));
}

// ---------- Inventory and Stock API ----------
async function inventoryRequest(path, options = {}) {
  const response = await fetch(`${API_BASE_URL}${path}`, {
    ...options,
    credentials: "include",
    headers: {
      Accept: "application/json",
      ...(options.headers || {}),
    },
  });

  let data = null;
  try {
    data = await response.json();
  } catch {
    // Keep the HTTP status authoritative for non-JSON responses.
  }

  if (response.status === 401) {
    window.location.reload();
  }
  if (!response.ok) {
    throw new Error(
      (data && data.message) || `Inventory request failed (${response.status}).`,
    );
  }
  if (!data || typeof data !== "object") {
    throw new Error("The server returned an invalid inventory response.");
  }

  return data;
}

const numeric = (value) =>
  value == null || value === "" ? value : Number(value);

function mapProduct(product) {
  const {
    product_id: id,
    category_id: categoryId,
    category_name: category,
    current_stock: stock,
    reorder_level: reorderLevel,
    product_type: productType,
    expiry_date: expiryDate,
    serving_pax: servingPax,
    is_addon: isAddon,
    is_low_stock: isLowStock,
    is_expired: isExpired,
    ...rest
  } = product;

  return {
    ...rest,
    id: numeric(id),
    productId: numeric(id),
    categoryId: numeric(categoryId),
    category,
    price: numeric(product.price),
    stock: numeric(stock),
    reorderLevel: numeric(reorderLevel),
    productType,
    expiryDate,
    kilos: numeric(product.kilos),
    servingPax: numeric(servingPax),
    isAddon: isAddon === true || Number(isAddon) === 1,
    isLowStock: isLowStock === true || Number(isLowStock) === 1,
    isExpired: isExpired === true || Number(isExpired) === 1,
  };
}

const MOVEMENT_TYPES = {
  in: "Stock In",
  out: "Stock Out",
  adjustment: "Adjustment",
};

function movementRequestType(value) {
  const type = String(value || "").trim().toLowerCase();
  const label = Object.keys(MOVEMENT_TYPES).find(
    (key) => MOVEMENT_TYPES[key].toLowerCase() === type,
  );
  const normalized = label || type;

  if (!Object.prototype.hasOwnProperty.call(MOVEMENT_TYPES, normalized)) {
    throw new Error("Invalid movement type.");
  }

  return normalized;
}

function mapMovement(movement) {
  const {
    movement_id: id,
    product_id: productId,
    product_name: productName,
    user_id: userId,
    movement_type: movementType,
    date_time: dateTime,
    ...rest
  } = movement;
  const type = Object.entries(MOVEMENT_TYPES).find(
    ([, label]) => label === movementType,
  );

  if (!type) throw new Error("The server returned an invalid movement type.");

  return {
    ...rest,
    id: numeric(id),
    productId: numeric(productId),
    productName,
    userId: numeric(userId),
    movementType: type[1],
    movementTypeCode: type[0],
    quantity: numeric(movement.quantity),
    dateTime,
  };
}

function mapProductResponse(data) {
  return {
    ...data,
    id: numeric(data.product_id),
    ...(data.product ? { product: mapProduct(data.product) } : {}),
  };
}

export async function getInventory(search = "") {
  const params = new URLSearchParams({ search: String(search || "") });
  const data = await inventoryRequest(`/inventory?${params}`);

  if (!Array.isArray(data.products)) {
    throw new Error("The server returned an invalid inventory list.");
  }

  return data.products.map(mapProduct);
}

export async function getCatalog() {
  const data = await inventoryRequest("/inventory/catalog");

  if (!Array.isArray(data.products)) {
    throw new Error("The server returned an invalid product catalog.");
  }

  return data.products.map(mapProduct);
}

export async function getLowStock() {
  const data = await inventoryRequest("/inventory/low-stock");

  if (!Array.isArray(data.low_stock) || !Array.isArray(data.expired)) {
    throw new Error("The server returned invalid stock alerts.");
  }

  return {
    ...data,
    low_stock: data.low_stock.map(mapProduct),
    expired: data.expired.map(mapProduct),
  };
}

export async function getProduct(sku) {
  const data = await inventoryRequest(
    `/inventory/${encodeURIComponent(sku)}`,
  );

  if (!data.product || typeof data.product !== "object") {
    throw new Error("The server returned an invalid product.");
  }

  return mapProduct(data.product);
}

export async function createProduct(productData) {
  const body = {
    sku: productData.sku,
    name: productData.name,
    category_id: productData.categoryId,
    price: productData.price,
    unit: productData.unit,
    product_type: productData.productType,
    current_stock: productData.stock,
    reorder_level: productData.reorderLevel,
    status: productData.status,
    expiry_date: productData.expiryDate || null,
    is_addon: productData.isAddon === true,
  };

  if (productData.category === "Whole Lechon") {
    body.size = productData.size;
    body.kilos = productData.kilos;
    body.serving_pax = productData.servingPax;
  }

  const data = await inventoryRequest("/inventory", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  return mapProductResponse(data);
}

export async function updateProduct(sku, updates) {
  const body = {};
  if (updates.price !== undefined) body.price = updates.price;
  if (updates.reorderLevel !== undefined) {
    body.reorder_level = updates.reorderLevel;
  }
  if (updates.status !== undefined) body.status = updates.status;
  if (updates.isAddon !== undefined) body.is_addon = updates.isAddon;

  const data = await inventoryRequest(
    `/inventory/${encodeURIComponent(sku)}`,
    {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    },
  );

  return mapProductResponse(data);
}

export async function archiveProduct(sku) {
  const data = await inventoryRequest(
    `/inventory/${encodeURIComponent(sku)}/archive`,
    { method: "PATCH" },
  );

  return mapProductResponse(data);
}

export async function restoreProduct(sku) {
  const data = await inventoryRequest(
    `/inventory/${encodeURIComponent(sku)}/restore`,
    { method: "PATCH" },
  );

  return mapProductResponse(data);
}

export async function logStockMovement({
  sku,
  movementType,
  quantity,
  reason,
}) {
  const data = await inventoryRequest("/stock/movements", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      sku,
      movement_type: movementRequestType(movementType),
      quantity,
      reason,
    }),
  });

  return {
    ...data,
    ...(data.movement ? { movement: mapMovement(data.movement) } : {}),
  };
}

export async function getStockMovements(filters = {}) {
  const params = new URLSearchParams();
  const movementType = filters.movementType || filters.movement_type;
  const startDate = filters.startDate || filters.start_date;
  const endDate = filters.endDate || filters.end_date;
  if (filters.sku) params.set("sku", filters.sku);
  if (movementType) {
    params.set("movement_type", movementRequestType(movementType));
  }
  if (startDate) params.set("start_date", startDate);
  if (endDate) params.set("end_date", endDate);
  const query = params.toString();
  const data = await inventoryRequest(
    `/stock/movements${query ? `?${query}` : ""}`,
  );

  if (!Array.isArray(data.movements)) {
    throw new Error("The server returned an invalid stock movement list.");
  }

  return data.movements.map(mapMovement);
}

export async function getCategories() {
  const data = await inventoryRequest("/categories");

  if (!Array.isArray(data.categories)) {
    throw new Error("The server returned an invalid category list.");
  }

  return data.categories.map((category) => ({
    id: numeric(category.category_id),
    name: category.category_name,
  }));
}

// ---------- Discount Settings ----------
const DISCOUNT_TYPES = [
  { name: "Regular", value: 0, requiresId: false, active: true },
  { name: "VIP", value: 10, requiresId: false, active: true },
  { name: "Promo", value: 5, requiresId: false, active: true },
  { name: "Senior Citizen", value: 20, requiresId: true, active: true },
  { name: "PWD", value: 20, requiresId: true, active: true },
];

export async function getDiscountTypes() {
  return DISCOUNT_TYPES.map((discount) => ({ ...discount }));
}

export async function getDiscountSettings() {
  const data = await inventoryRequest("/discounts");
  if (!Array.isArray(data.discounts)) {
    throw new Error("The server returned an invalid discount list.");
  }

  return data.discounts.map((discount) => ({
    id: numeric(discount.discount_type_id),
    name: discount.discount_name,
    value: numeric(discount.discount_value),
    requiresId: ["Senior Citizen", "PWD"].includes(discount.discount_name),
    active: true,
  }));
}

export async function saveDiscountPercentage(discount, value) {
  if (
    !discount ||
    !Number.isInteger(Number(discount.id)) ||
    Number(discount.id) < 1 ||
    typeof discount.name !== "string"
  ) {
    throw new Error("Discount type not found.");
  }
  if (!Number.isFinite(value) || value < 0 || value > 100) {
    throw new Error("Discount percentage must be between 0 and 100.");
  }

  const data = await inventoryRequest(
    `/discounts/${encodeURIComponent(discount.id)}`,
    {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        discount_name: discount.name,
        discount_value: value,
      }),
    },
  );
  if (data.success !== true) {
    throw new Error(data.message || "Unable to save discount percentage.");
  }

  return { ...discount, value };
}

export async function getCheckoutDiscountTypes() {
  const data = await inventoryRequest("/discounts");
  if (!Array.isArray(data.discounts)) {
    throw new Error("The server returned an invalid discount list.");
  }

  return data.discounts.map((discount) => ({
    id: numeric(discount.discount_type_id),
    name: discount.discount_name,
    value: numeric(discount.discount_value),
    requiresId: ["Senior Citizen", "PWD"].includes(discount.discount_name),
    active: true,
  }));
}

export async function updateDiscountType(name, updates) {
  const discount = DISCOUNT_TYPES.find(
    (item) => item.name === String(name).trim(),
  );

  if (!discount) {
    throw new Error("Discount type not found.");
  }

  // Backward compatibility: existing calls may pass true or false.
  if (typeof updates === "boolean") {
    discount.active = updates;
    return { ...discount };
  }

  if (!updates || typeof updates !== "object") {
    throw new Error("Invalid discount update.");
  }

  // Update discount percentage.
  if (updates.value !== undefined) {
    const value = Number(updates.value);

    if (
      updates.value === "" ||
      !Number.isFinite(value) ||
      value < 0 ||
      value > 100
    ) {
      throw new Error("Discount percentage must be between 0 and 100.");
    }

    discount.value = value;
  }

  // Optional status update.
  if (updates.active !== undefined) {
    discount.active = Boolean(updates.active);
  }

  return { ...discount };
}

// ---------- Transactions and Stock Movements ----------
const TRANSACTIONS = [];

const STOCK_MOVEMENTS = [
  {
    dateTime: "2026-11-14T16:30:00",
    sku: "DSR-001",
    movementType: "Stock Out",
    quantity: -2,
    reason: "Expired",
    staff: "Sallie De Guzman",
  },
];

// ---------- POS Checkout ----------
const PAYMENT_METHOD_IDS = {
  Cash: 1,
  "GCash/E-Wallet": 2,
  Card: 3,
};

export async function saveTransaction(order) {
  if (!order || !Array.isArray(order.items) || !order.items.length) {
    throw new Error("The transaction has no items.");
  }

  const paymentMethodId = PAYMENT_METHOD_IDS[order.paymentMethod];
  if (!paymentMethodId) {
    throw new Error("Select a valid payment method.");
  }

  const payload = {
    cart_items: order.items.map((item) => ({
      product_id: Number(item.productId),
      quantity: Number(item.qty),
      is_addon: Boolean(item.isAddon),
      parent_line_no:
        item.parentId == null
          ? null
          : order.items.findIndex((parent) => parent.id === item.parentId) + 1,
    })),
    order_type: order.orderType === "Dine In" ? "Dine-In" : "Take-Out",
    discount_type_id: Number(order.discountTypeId),
    payment_method_id: paymentMethodId,
    amount_tendered: Number(order.amountTendered),
    discount_amount: Number(order.discountAmount),
    discount_id_number: order.discountId || null,
    discount_name: order.discountName || null,
    customer_name: order.customerName || null,
    customer_contact: order.customerContact || null,
  };
  const response = await inventoryRequest("/transactions/checkout", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });

  const transactionId = numeric(response.data?.transaction_id);
  const orderNumber = response.data?.order_number;
  if (
    response.success !== true ||
    !response.data ||
    !Number.isInteger(transactionId) ||
    transactionId < 1 ||
    typeof orderNumber !== "string" ||
    !orderNumber.trim()
  ) {
    throw new Error(
      response.message || "The server returned an invalid checkout response.",
    );
  }

  return {
    transactionId,
    orderNumber,
    subtotal: numeric(response.data.subtotal),
    discountAmount: numeric(response.data.discount_amount),
    totalDue: numeric(response.data.total_due),
    amountTendered: numeric(response.data.amount_tendered),
    change: numeric(response.data.change),
  };
}

export async function getTransactionReceipt(transactionId) {
  const response = await inventoryRequest(
    `/transactions/${Number(transactionId)}/receipt`,
  );
  return response.data;
}

export async function getKitchenTicket(transactionId) {
  const response = await inventoryRequest(
    `/transactions/${Number(transactionId)}/kitchen-ticket`,
  );
  return response.data;
}

// ---------- Get Transactions ----------
export async function getTransactions(user) {
  const response = await inventoryRequest("/transactions");
  const records = Array.isArray(response.data) ? response.data : [];

  return Promise.all(
    records.map(async (record) => {
      let detail = record;
      try {
        const detailResponse = await inventoryRequest(
          `/transactions/${record.transaction_id}`,
        );
        detail = detailResponse.data || record;
      } catch {
        detail = record;
      }

      const items = Array.isArray(detail.items)
        ? detail.items.map((item) => ({
            sku: item.sku || "",
            name: item.product_name || item.name || "",
            qty: Number(item.quantity ?? item.qty ?? 0),
            price: numeric(item.unit_price ?? item.price),
            lineTotal: numeric(item.line_total ?? item.lineTotal),
          }))
        : [];
      const total = numeric(detail.total_due);
      const amountTendered = numeric(detail.amount);
      const change =
        detail.payment_method_name === "Cash"
          ? Math.max(0, Number(amountTendered || 0) - Number(total || 0))
          : 0;

      return {
        transactionId: Number(detail.transaction_id),
        orderNumber: detail.order_number,
        dateTime: detail.date_time,
        staff: detail.processed_by_name || user.name,
        itemName: detail.item_name,
        items,
        paymentMethod:
          detail.payment_method_name ||
          detail.payment_method ||
          (detail.payment_method_id === 1
            ? "Cash"
            : detail.payment_method_id === 2
              ? "GCash/E-Wallet"
              : detail.payment_method_id === 3
                ? "Card"
                : "—"),
        subtotal: numeric(detail.subtotal),
        discountAmount: numeric(detail.discount_amount),
        total,
        amountTendered,
        change,
        status: detail.status,
        orderType: detail.order_type,
        customerName: detail.customer_name,
        customerContact: detail.customer_contact,
        voidRefundReason: detail.void_refund_reason,
        approvedByUserId: detail.approved_by_user_id,
      };
    }),
  );
}

// ---------- Void / Refund Requests ----------
export async function requestTransactionAction({
  transactionId,
  requestType,
  reason,
  staff,
}) {
  if (!["Void", "Refund"].includes(requestType)) {
    throw new Error("Please select Void or Refund.");
  }

  const cleanReason = String(reason || "").trim();

  if (!cleanReason) {
    throw new Error("Please provide a reason for this request.");
  }

  await inventoryRequest("/approvals/requests", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      transaction_id: Number(transactionId),
      request_type: requestType,
      reason: cleanReason,
    }),
  });
  return { success: true };
}

export async function directVoidRefund(transactionId, type, reason) {
  const id = Number(transactionId);
  const cleanReason = String(reason || "").trim();

  if (!Number.isInteger(id) || id < 1) {
    throw new Error("A valid transaction ID is required.");
  }
  if (!["Void", "Refund"].includes(type)) {
    throw new Error("Please select Void or Refund.");
  }
  if (!cleanReason) {
    throw new Error("Please provide a reason.");
  }

  const response = await inventoryRequest("/approvals/direct", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      transaction_id: id,
      request_type: type,
      reason: cleanReason,
    }),
  });
  if (
    response.success !== true ||
    !response.request ||
    !response.transaction
  ) {
    throw new Error(response.message || "Unable to apply the change.");
  }
  return response;
}

// ---------- Approval Requests (Admin) ----------
// Pending void and refund requests, oldest first.
export async function getPendingRequests() {
  const response = await inventoryRequest("/approvals/requests?status=Pending");
  const requests = Array.isArray(response.data) ? response.data : [];

  return Promise.all(
    requests.map(async (request) => {
      const transactionResponse = await inventoryRequest(
        `/transactions/${request.transaction_id}`,
      );
      const transaction = transactionResponse.data || {};
      const items = Array.isArray(transaction.items)
        ? transaction.items.map((item) => ({
            sku: item.sku || "",
            name: item.product_name || item.name || "",
            qty: Number(item.quantity ?? item.qty ?? 0),
            price: numeric(item.unit_price ?? item.price),
            lineTotal: numeric(item.line_total ?? item.lineTotal),
          }))
        : [];
      const total = numeric(transaction.total_due);
      const amountTendered = numeric(transaction.amount);

      return {
        requestId: request.request_id,
        transactionId: request.transaction_id,
        orderNumber: transaction.order_number,
        dateTime: transaction.date_time,
        staff: transaction.processed_by_name || "",
        itemName: transaction.item_name,
        items,
        paymentMethod: transaction.payment_method_name || "—",
        subtotal: numeric(transaction.subtotal),
        discountAmount: numeric(transaction.discount_amount),
        total,
        amountTendered,
        change:
          transaction.payment_method_name === "Cash"
            ? Math.max(0, Number(amountTendered || 0) - Number(total || 0))
            : 0,
        status: "Completed",
        requestType: request.request_type,
        requestReason: request.reason,
        requestStatus: "Pending",
      };
    }),
  );
}

// Approve a pending void or refund request.
// Only the transaction record changes. Stock is not touched.
export async function approveTransactionRequest(transactionId, admin) {
  const requests = await getPendingRequests();
  const request = requests.find(
    (item) => String(item.transactionId) === String(transactionId),
  );
  if (!request) throw new Error("Pending request not found.");

  await inventoryRequest(
    `/approvals/requests/${request.requestId}/approve`,
    { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" },
  );
  return { success: true };
}

// ---------- Admin: correct a completed transaction (FR-46) ----------
export async function updateTransaction(transactionId, changes, admin) {
  const transaction = TRANSACTIONS.find(
    (t) => String(t.transactionId) === String(transactionId),
  );

  if (!transaction) throw new Error("Transaction not found.");

  if (transaction.status !== "Completed") {
    throw new Error("Only completed transactions can be corrected.");
  }

  if (transaction.requestStatus === "Pending") {
    throw new Error("Resolve the pending void or refund request first.");
  }

  const reason = String(changes.reason || "").trim();
  if (!reason) throw new Error("Enter the reason for the correction.");

  const orderType = String(changes.orderType || "");
  if (!["Dine In", "Take-out"].includes(orderType)) {
    throw new Error("Select Dine In or Take-out.");
  }

  const quantities = changes.quantities;
  if (
    !Array.isArray(quantities) ||
    quantities.length !== transaction.items.length
  ) {
    throw new Error("Invalid item quantities.");
  }

  quantities.forEach((q, i) => {
    if (!Number.isInteger(Number(q)) || Number(q) < 1) {
      throw new Error(`Invalid quantity for ${transaction.items[i].name}.`);
    }
  });

  // Quantity change per product (positive = sold more, negative = sold less).
  const deltas = {};
  transaction.items.forEach((line, i) => {
    deltas[line.sku] =
      (deltas[line.sku] || 0) + (Number(quantities[i]) - Number(line.qty));
  });

  for (const [sku, delta] of Object.entries(deltas)) {
    const product = PRODUCTS.find((p) => p.sku === sku);
    if (product && delta > Number(product.stock)) {
      throw new Error(
        `Insufficient stock for ${product.name}. Available: ${product.stock}.`,
      );
    }
  }

  // Discount.
  const type = DISCOUNT_TYPES.find((d) => d.name === changes.discountType);
  if (!type) throw new Error("Select a valid discount type.");

  const discountId = String(changes.discountId || "").trim();
  const discountName = String(changes.discountName || "").trim();

  if (type.requiresId && (!discountId || !discountName)) {
    throw new Error("Enter the discount ID number and ID name.");
  }

  const rate =
    changes.discountType === transaction.discountType &&
    transaction.discountRate != null
      ? Number(transaction.discountRate)
      : type.value;

  // New amounts.
  const items = transaction.items.map((line, i) => {
    const qty = Number(quantities[i]);
    const price = Number(line.price ?? line.unitPrice ?? 0);
    return { ...line, qty, price, lineTotal: money(price * qty) };
  });

  const subtotal = money(items.reduce((sum, line) => sum + line.lineTotal, 0));
  const discountAmount = money((subtotal * rate) / 100);
  const total = money(subtotal - discountAmount);

  const isCash =
    String(transaction.paymentMethod || "").toLowerCase() === "cash";
  let received = total;

  if (isCash) {
    received = Number(changes.amountReceived);
    if (
      changes.amountReceived === "" ||
      !Number.isFinite(received) ||
      received < total
    ) {
      throw new Error("The amount received is less than the new total.");
    }
    received = money(received);
  }

  const change = isCash ? money(received - total) : 0;

  // Keep the first version so the pop-up can show "Original".
  if (!transaction.original) {
    transaction.original = {
      orderType: transaction.orderType,
      discountType: transaction.discountType || "Regular",
      items: transaction.items.map((l) => ({ sku: l.sku, qty: l.qty })),
      total: transaction.total,
    };
  }

  // Stock follows the corrected quantities.
  const now = new Date().toISOString();

  Object.entries(deltas).forEach(([sku, delta]) => {
    if (!delta) return;

    const product = PRODUCTS.find((p) => p.sku === sku);
    if (!product) return;

    const previousStock = Number(product.stock) || 0;
    const newStock = Math.max(0, previousStock - delta);

    product.stock = newStock;

    if (product.status !== "Archived") {
      product.status = newStock > 0 ? "Available" : "Unavailable";
    }

    STOCK_MOVEMENTS.unshift({
      dateTime: now,
      sku,
      movementType: "Adjustment",
      quantity: newStock - previousStock,
      previousStock,
      newStock,
      reason: "Sale correction",
      notes: `Transaction #${transaction.transactionId}: ${reason}`,
      staff: String(admin || "Admin"),
    });
  });

  Object.assign(transaction, {
    orderType,
    items,
    itemName: items.map((i) => `${i.qty}x ${i.name}`).join(", "),
    subtotal,
    discountType: type.name,
    discountRate: rate,
    discountAmount,
    discount: discountAmount,
    discountId: type.requiresId ? discountId : "",
    discountName: type.requiresId ? discountName : "",
    total,
    amountReceived: received,
    amountTendered: received,
    change,
    correctionReason: reason,
    correctedBy: String(admin || "Admin"),
    correctedAt: now,
  });

  return {
    ...transaction,
    items: transaction.items.map((item) => ({ ...item })),
  };
}

// ---------- Admin: void or refund directly, no request needed ----------
export async function voidRefundTransaction(
  transactionId,
  type,
  reason,
  admin,
) {
  const transaction = TRANSACTIONS.find(
    (t) => String(t.transactionId) === String(transactionId),
  );

  if (!transaction) throw new Error("Transaction not found.");

  if (transaction.status !== "Completed") {
    throw new Error("Only completed transactions can be voided or refunded.");
  }

  if (!["Void", "Refund"].includes(type)) {
    throw new Error("Select Void or Refund.");
  }

  const cleanReason = String(reason || "").trim();
  if (!cleanReason) throw new Error("Enter the reason.");

  const now = new Date().toISOString();
  const adminName = String(admin || "Admin");

  Object.assign(transaction, {
    status: type === "Void" ? "Voided" : "Refunded",
    requestType: type,
    requestReason: cleanReason,
    requestStatus: "Approved",
    requestedBy: adminName,
    requestedAt: now,
    voidRefundReason: cleanReason,
    approvedBy: adminName,
    approvedAt: now,
  });

  return {
    ...transaction,
    items: transaction.items.map((item) => ({ ...item })),
  };
}

// ---------- Shifts ----------
const localDateKey = (value = new Date()) => {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return [
    String(date.getFullYear()).padStart(4, "0"),
    String(date.getMonth() + 1).padStart(2, "0"),
    String(date.getDate()).padStart(2, "0"),
  ].join("-");
};

const normalizeShiftDate = (value) => {
  if (typeof value === "string") {
    const iso = value.match(/^(\d{4}-\d{2}-\d{2})/);
    if (iso) return iso[1];

    const parsed = new Date(value);
    if (!Number.isNaN(parsed.getTime())) return localDateKey(parsed);
  }
  if (value instanceof Date) return localDateKey(value);
  return "";
};

const validateShiftMoney = (value, label) => {
  if (value === "" || value === null || value === undefined) {
    throw new Error(`${label} is required.`);
  }
  const amount = Number(value);
  if (!Number.isFinite(amount) || amount < 0) {
    throw new Error(`${label} cannot be negative.`);
  }
  if (Math.abs(amount * 100 - Math.round(amount * 100)) > 0.000001) {
    throw new Error(`${label} can have at most 2 decimal places.`);
  }
  return Math.round(amount * 100) / 100;
};

const mapShift = (shift) => {
  if (!shift) return null;
  const openingCash = numeric(shift.opening_cash);
  const actualCash =
    shift.actual_cash == null ? null : numeric(shift.actual_cash);
  const cashSales =
    shift.cash_sales == null ? 0 : numeric(shift.cash_sales);
  const expectedCash =
    shift.expected_cash == null
      ? Math.round((openingCash + cashSales) * 100) / 100
      : numeric(shift.expected_cash);
  const cashDifference =
    shift.cash_difference == null
      ? actualCash == null
        ? null
        : Math.round((actualCash - expectedCash) * 100) / 100
      : numeric(shift.cash_difference);

  return {
    shiftId: Number(shift.shift_id),
    staff: shift.cashier_name || shift.full_name || "",
    shiftDate: normalizeShiftDate(shift.shift_date),
    openingCash,
    salesCount:
      shift.sales_count == null ? null : numeric(shift.sales_count),
    cashSales,
    expectedCash,
    actualCash,
    cashDifference,
    status: actualCash == null ? "Open" : "Closed",
  };
};

export async function getShifts(_user, filters = {}) {
  const params = new URLSearchParams();
  if (filters.startDate) params.set("start_date", filters.startDate);
  if (filters.endDate) params.set("end_date", filters.endDate);
  if (filters.status) params.set("status", filters.status);
  const query = params.toString();
  const response = await inventoryRequest(
    `/shifts${query ? `?${query}` : ""}`,
  );
  if (!Array.isArray(response.data)) {
    throw new Error("The server returned an invalid shift list.");
  }
  return response.data.map(mapShift).filter(Boolean);
}

async function getReportData(endpoint, startDate, endDate) {
  const params = new URLSearchParams({
    start_date: startDate,
    end_date: endDate,
  });
  const response = await inventoryRequest(
    `/reports/${endpoint}?${params.toString()}`,
  );
  if (response.success !== true || response.data == null) {
    throw new Error(response.message || "The server returned an invalid report.");
  }
  return response.data;
}

export async function getSalesReport(startDate, endDate) {
  const data = await getReportData("sales", startDate, endDate);
  if (
    !data.summary ||
    !Array.isArray(data.daily_sales) ||
    !Array.isArray(data.payment_methods)
  ) {
    throw new Error("The server returned an invalid sales report.");
  }
  return data;
}

export async function getProductPerformanceReport(startDate, endDate) {
  const data = await getReportData(
    "product-performance",
    startDate,
    endDate,
  );
  if (!Array.isArray(data)) {
    throw new Error("The server returned an invalid product performance report.");
  }
  return data;
}

export async function getInventoryReport(startDate, endDate) {
  const data = await getReportData("inventory", startDate, endDate);
  if (!Array.isArray(data)) {
    throw new Error("The server returned an invalid inventory report.");
  }
  return data;
}

export async function getExceptionsReport(startDate, endDate) {
  const data = await getReportData("exceptions", startDate, endDate);
  if (
    !Array.isArray(data.voids_refunds) ||
    !Array.isArray(data.stock_movements) ||
    !Array.isArray(data.discount_exceptions) ||
    !Array.isArray(data.pending_requests)
  ) {
    throw new Error("The server returned an invalid exceptions report.");
  }
  return data;
}

export async function getStaffCashReport(startDate, endDate) {
  const params = new URLSearchParams({
    start_date: startDate,
    end_date: endDate,
  });
  const response = await inventoryRequest(
    `/reports/staff-cash?${params.toString()}`,
  );
  if (
    !Array.isArray(response.data?.cashier_sales) ||
    !Array.isArray(response.data?.shift_cash)
  ) {
    throw new Error("The server returned an invalid staff cash report.");
  }
  return {
    cashierSales: response.data.cashier_sales,
    shiftCash: response.data.shift_cash,
  };
}

export async function openShift(_user, openingCash) {
  const amount = validateShiftMoney(openingCash, "Opening cash");
  const response = await inventoryRequest("/shifts/open", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ opening_cash: amount }),
  });
  if (!response.data?.shift) {
    throw new Error("The server returned an invalid open-shift response.");
  }
  return mapShift(response.data.shift);
}

export async function getShiftSummary(user) {
  const response = await inventoryRequest("/shifts/current");
  const shift = mapShift(response.data);
  if (!shift) throw new Error("No shift is open.");

  const transactions = await getTransactions(user);
  const shiftTransactions = transactions.filter(
    (transaction) =>
      transaction.status === "Completed" &&
      normalizeShiftDate(transaction.dateTime) === shift.shiftDate,
  );
  const cashTransactions = shiftTransactions.filter((transaction) => {
    const method = String(
      transaction.paymentMethod || transaction.payment || "",
    )
      .trim()
      .toLowerCase();
    return method === "cash" || method.includes("cash");
  });
  const cashSales = Math.round(
    cashTransactions.reduce(
      (sum, transaction) => sum + Number(transaction.total || 0),
      0,
    ) * 100,
  ) / 100;

  return {
    ...shift,
    salesCount: shiftTransactions.length,
    cashOrders: cashTransactions.length,
    cashSales,
    expectedCash: Math.round((shift.openingCash + cashSales) * 100) / 100,
  };
}

export async function closeShift(_user, actualCash) {
  const amount = validateShiftMoney(actualCash, "Actual cash");
  const current = await inventoryRequest("/shifts/current");
  if (!current.data?.shift_id) throw new Error("No shift is open.");
  const response = await inventoryRequest("/shifts/close", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      actual_cash: amount,
      shift_id: Number(current.data.shift_id),
    }),
  });
  if (!response.data?.shift) {
    throw new Error("The server returned an invalid close-shift response.");
  }
  return mapShift(response.data.shift);
}
