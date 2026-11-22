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

// ---------- Order and Transaction Numbers ----------
let nextNumber = 201;

export function peekOrderNumbers() {
  return { transactionNo: nextNumber, orderNo: nextNumber };
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

// ---------- Save Transaction ----------
export async function saveTransaction(order) {
  if (!order || !Array.isArray(order.items) || !order.items.length) {
    throw new Error("The transaction has no items.");
  }

  // Validate all items before changing stock.
  for (const line of order.items) {
    const product = PRODUCTS.find((p) => p.sku === line.sku);
    const quantity = Number(line.qty);

    if (!product) {
      throw new Error(`Product ${line.sku} was not found.`);
    }

    if (!Number.isFinite(quantity) || quantity <= 0) {
      throw new Error(`Invalid quantity for ${product.name}.`);
    }

    if (product.status === "Archived") {
      throw new Error(`${product.name} is archived and cannot be sold.`);
    }

    if (quantity > Number(product.stock)) {
      throw new Error(
        `Insufficient stock for ${product.name}. Available: ${product.stock}.`,
      );
    }
  }

  const id = nextNumber++;
  const now = new Date().toISOString();

  // Save item prices and line totals for the transaction receipt.
  const savedItems = order.items.map((line) => {
    const product = PRODUCTS.find((p) => p.sku === line.sku);
    const quantity = Number(line.qty);
    const price = Number(line.price ?? line.unitPrice ?? product.price);

    return {
      ...line,
      sku: product.sku,
      name: line.name || product.name,
      qty: quantity,
      price,
      lineTotal: Number(line.lineTotal ?? line.subtotal ?? price * quantity),
    };
  });

  const amountReceived = Number(
    order.amountTendered ??
      order.amountReceived ??
      order.cashReceived ??
      order.amountPaid ??
      order.received ??
      0,
  );

  const record = {
    ...order,
    items: savedItems,
    transactionId: id,
    orderNumber: id,
    dateTime: now,
    status: "Completed",
    requestType: "",
    requestReason: "",
    requestStatus: "None",
    voidRefundReason: "",
    itemName: savedItems.map((i) => `${i.qty}x ${i.name}`).join(", "),
    paymentMethod:
      order.paymentMethod || order.payment || order.paymentType || "—",
    amountReceived,
    change: Number(
      order.change ??
        order.changeAmount ??
        Math.max(0, amountReceived - Number(order.total || 0)),
    ),
  };

  // Deduct stock and record stock movements.
  savedItems.forEach((line) => {
    const product = PRODUCTS.find((p) => p.sku === line.sku);

    product.stock = Number(product.stock) - Number(line.qty);

    if (product.stock <= 0) {
      product.stock = 0;
      product.status = "Unavailable";
    }

    STOCK_MOVEMENTS.unshift({
      movementType: "Stock Out",
      sku: line.sku,
      quantity: -Number(line.qty),
      reason: "Sale",
      dateTime: now,
      staff: order.staff || "Cashier",
    });
  });

  TRANSACTIONS.unshift(record);

  return { ...record, items: record.items.map((item) => ({ ...item })) };
}

// ---------- Get Transactions ----------
export async function getTransactions(user) {
  return TRANSACTIONS.filter(
    (t) => user.role === "Admin" || t.staff === user.name,
  ).map((t) => ({
    ...t,
    items: Array.isArray(t.items) ? t.items.map((item) => ({ ...item })) : [],
  }));
}

// ---------- Void / Refund Requests ----------
export async function requestTransactionAction({
  transactionId,
  requestType,
  reason,
  staff,
}) {
  const transaction = TRANSACTIONS.find(
    (t) =>
      String(t.transactionId) === String(transactionId) ||
      String(t.orderNumber) === String(transactionId),
  );

  if (!transaction) {
    throw new Error("Transaction not found.");
  }

  if (String(transaction.status).toLowerCase() !== "completed") {
    throw new Error(
      "Only completed transactions can be requested for void or refund.",
    );
  }

  if (!["Void", "Refund"].includes(requestType)) {
    throw new Error("Please select Void or Refund.");
  }

  const cleanReason = String(reason || "").trim();

  if (!cleanReason) {
    throw new Error("Please provide a reason for this request.");
  }

  if (transaction.requestStatus === "Pending") {
    throw new Error("This transaction already has a pending request.");
  }

  transaction.requestType = requestType;
  transaction.requestReason = cleanReason;
  transaction.requestStatus = "Pending";
  transaction.requestedBy = String(staff || transaction.staff || "Cashier");
  transaction.requestedAt = new Date().toISOString();

  return {
    ...transaction,
    items: transaction.items.map((item) => ({ ...item })),
  };
}

// ---------- Approval Requests (Admin) ----------
// Pending void and refund requests, oldest first.
export async function getPendingRequests() {
  return TRANSACTIONS.filter((t) => t.requestStatus === "Pending")
    .sort((a, b) => new Date(a.requestedAt) - new Date(b.requestedAt))
    .map((t) => ({
      ...t,
      items: Array.isArray(t.items) ? t.items.map((item) => ({ ...item })) : [],
    }));
}

// Approve a pending void or refund request.
// Only the transaction record changes. Stock is not touched.
export async function approveTransactionRequest(transactionId, admin) {
  const transaction = TRANSACTIONS.find(
    (t) => String(t.transactionId) === String(transactionId),
  );

  if (!transaction) throw new Error("Transaction not found.");

  if (transaction.requestStatus !== "Pending") {
    throw new Error("This request is no longer pending.");
  }

  transaction.status =
    transaction.requestType === "Void" ? "Voided" : "Refunded";
  transaction.requestStatus = "Approved";
  transaction.voidRefundReason = transaction.requestReason;
  transaction.approvedBy = String(admin || "Admin");
  transaction.approvedAt = new Date().toISOString();

  return {
    ...transaction,
    items: transaction.items.map((item) => ({ ...item })),
  };
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

// ---------- Shifts: Mock Data ----------
const dayKey = (value) => new Date(value).toLocaleDateString("en-CA");

const money = (n) => Math.round(Number(n) * 100) / 100;

const daysAgo = (n) => {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return dayKey(d);
};

const pastShift = (id, n, opening, salesCount, cashSales, actual) => ({
  shiftId: id,
  staff: "Elle Santos",
  shiftDate: daysAgo(n),
  openingCash: opening,
  salesCount,
  cashSales,
  expectedCash: opening + cashSales,
  actualCash: actual,
  cashDifference: actual - (opening + cashSales),
  status: "Closed",
});

const SHIFTS = [
  pastShift(1, 6, 3500, 12, 1188, 4680),
  pastShift(2, 5, 2000, 28, 5227, 7200),
  pastShift(3, 4, 2000, 25, 4600, 6600),
  pastShift(4, 3, 2200, 19, 3980, 6200),
  pastShift(5, 2, 2000, 31, 5120, 7120),
  pastShift(6, 1, 2000, 22, 4350, 6300),
];

let nextShiftId = 7;

// ---------- Get Shifts ----------
export async function getShifts(user) {
  return SHIFTS.filter((s) => user.role === "Admin" || s.staff === user.name)
    .sort((a, b) => b.shiftId - a.shiftId)
    .map((s) => ({ ...s }));
}

// ---------- Open Shift ----------
export async function openShift(user, openingCash) {
  const amount = Number(openingCash);

  if (openingCash === "" || !Number.isFinite(amount) || amount < 0) {
    throw new Error("Enter the opening cash.");
  }

  const today = dayKey(new Date());

  if (SHIFTS.some((s) => s.staff === user.name && s.shiftDate === today)) {
    throw new Error("You already have a shift today.");
  }

  const shift = {
    shiftId: nextShiftId++,
    staff: user.name,
    shiftDate: today,
    openingCash: money(amount),
    salesCount: 0,
    cashSales: 0,
    expectedCash: money(amount),
    actualCash: null,
    cashDifference: null,
    status: "Open",
  };

  SHIFTS.push(shift);

  return { ...shift };
}

// ---------- Shift Summary ----------
export async function getShiftSummary(user) {
  const shift = SHIFTS.find(
    (s) => s.staff === user.name && s.status === "Open",
  );

  if (!shift) throw new Error("No shift is open.");

  const sales = (await getTransactions(user)).filter(
    (t) => t.status === "Completed" && dayKey(t.dateTime) === shift.shiftDate,
  );

  const cash = sales.filter((t) => {
    const method = String(t.payment || t.paymentMethod || t.paymentType || "")
      .trim()
      .toLowerCase();

    return method === "cash" || method.includes("cash");
  });

  const cashSales = money(
    cash.reduce((sum, t) => sum + Number(t.total || 0), 0),
  );

  return {
    openingCash: shift.openingCash,
    salesCount: sales.length,
    cashOrders: cash.length,
    cashSales,
    expectedCash: money(shift.openingCash + cashSales),
  };
}

// ---------- Close Shift ----------
export async function closeShift(user, actualCash) {
  const amount = Number(actualCash);

  if (actualCash === "" || !Number.isFinite(amount) || amount < 0) {
    throw new Error("Enter the cash counted.");
  }

  const shift = SHIFTS.find(
    (s) => s.staff === user.name && s.status === "Open",
  );

  if (!shift) throw new Error("No shift is open.");

  const summary = await getShiftSummary(user);

  Object.assign(shift, {
    salesCount: summary.salesCount,
    cashSales: summary.cashSales,
    expectedCash: summary.expectedCash,
    actualCash: money(amount),
    cashDifference: money(amount - summary.expectedCash),
    status: "Closed",
  });

  return { ...shift };
}
