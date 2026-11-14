// api.js: mock data for now.

// ---------- Users ----------
const USERS = [
  {
    id: 1,
    username: "cashier",
    password: "1234",
    name: "Elle Santos",
    role: "Cashier",
    active: true,
  },
  {
    id: 2,
    username: "admin",
    password: "1234",
    name: "Sallie De Guzman",
    role: "Admin",
    active: true,
  },
];

const SESSION_KEY = "lechon_session";
let memorySession = null;

// ---------- Login and Session ----------
export async function login(username, password) {
  const user = USERS.find(
    (u) =>
      u.username === username.trim().toLowerCase() &&
      u.password === password &&
      u.active !== false
  );

  if (!user) {
    throw new Error("Invalid username or password, or account is inactive.");
  }

  const { password: _omit, ...safe } = user;
  memorySession = safe;

  try {
    sessionStorage.setItem(SESSION_KEY, JSON.stringify(safe));
  } catch {
    // Ignore storage errors.
  }

  return safe;
}

export function getSession() {
  if (memorySession) return memorySession;

  try {
    const raw = sessionStorage.getItem(SESSION_KEY);
    if (raw) memorySession = JSON.parse(raw);
  } catch {
    // Ignore storage errors.
  }

  return memorySession;
}

export function logout() {
  memorySession = null;

  try {
    sessionStorage.removeItem(SESSION_KEY);
  } catch {
    // Ignore storage errors.
  }
}

// ---------- Account Management ----------

// Get all accounts without exposing passwords.
export async function getUsers() {
  return USERS.map(({ password, ...user }) => ({
    ...user,
    active: user.active !== false,
  }));
}

// Add a new account.
export async function addUser(userData) {
  const name = String(userData.name || "").trim();
  const username = String(userData.username || "").trim().toLowerCase();
  const password = String(userData.password || "");
  const role = userData.role;

  if (!name || !username || !password) {
    throw new Error("Please complete all required fields.");
  }

  if (!["Admin", "Cashier"].includes(role)) {
    throw new Error("Invalid account role.");
  }

  if (USERS.some((user) => user.username.toLowerCase() === username)) {
    throw new Error("Username already exists.");
  }

  const newUser = {
    id: Math.max(0, ...USERS.map((user) => user.id)) + 1,
    name,
    username,
    password,
    role,
    active: true,
  };

  USERS.push(newUser);

  const { password: _omit, ...safeUser } = newUser;
  return safeUser;
}

// Update an existing account.
export async function updateUser(id, updates) {
  const user = USERS.find((item) => item.id === Number(id));

  if (!user) {
    throw new Error("User account not found.");
  }

  if (updates.name !== undefined) {
    const name = String(updates.name).trim();

    if (!name) throw new Error("Name is required.");

    user.name = name;
  }

  if (updates.username !== undefined) {
    const username = String(updates.username).trim().toLowerCase();

    if (!username) throw new Error("Username is required.");

    const duplicate = USERS.some(
      (item) =>
        item.id !== user.id &&
        item.username.toLowerCase() === username
    );

    if (duplicate) throw new Error("Username already exists.");

    user.username = username;
  }

  if (updates.password) {
    user.password = String(updates.password);
  }

  if (updates.role !== undefined) {
    if (!["Admin", "Cashier"].includes(updates.role)) {
      throw new Error("Invalid account role.");
    }

    user.role = updates.role;
  }

  if (updates.active !== undefined) {
    user.active = Boolean(updates.active);
  }

  const { password: _omit, ...safeUser } = user;
  return safeUser;
}

// Activate or deactivate an account.
export async function updateUserStatus(id, active) {
  return updateUser(id, { active });
}

// ---------- Products ----------
const PRODUCTS = [
  { sku: "MEL-001", name: "Lechon Budget Meal", price: 99, category: "Meals", productType: "Finished good", status: "Available", image: null, stock: 24, unit: "piece", reorderLevel: 5, expiryDate: null },
  { sku: "SNK-001", name: "Cheese Burger", price: 30, category: "Snacks & Sides", productType: "Finished good", status: "Available", image: null, stock: 18, unit: "piece", reorderLevel: 5, expiryDate: null },
  { sku: "MEL-002", name: "Lechon Paksiw", price: 149, category: "Meals", productType: "Finished good", status: "Available", image: null, stock: 3, unit: "piece", reorderLevel: 5, expiryDate: null },
  { sku: "SNK-002", name: "Fries Platter", price: 249, category: "Snacks & Sides", productType: "Finished good", status: "Available", image: null, stock: 12, unit: "tray", reorderLevel: 4, expiryDate: null },
  { sku: "MEL-003", name: "Lechon Meal Unli Rice", price: 129, category: "Meals", productType: "Finished good", status: "Available", image: null, stock: 20, unit: "piece", reorderLevel: 5, expiryDate: null },
  { sku: "SNK-003", name: "Crazy Loaded Nachos", price: 179, category: "Snacks & Sides", productType: "Finished good", status: "Available", image: null, stock: 15, unit: "tray", reorderLevel: 5, expiryDate: null },
  { sku: "DSR-001", name: "Fruit Salad", price: 79, category: "Desserts and Drinks", productType: "Finished good", status: "Available", image: null, stock: 10, unit: "piece", reorderLevel: 4, expiryDate: "2026-10-29" },
  { sku: "MEL-004", name: "Crew Meal", price: 200, category: "Meals", productType: "Finished good", status: "Available", image: null, stock: 9, unit: "piece", reorderLevel: 3, expiryDate: null },
  { sku: "WLC-001", name: "Whole Lechon Baboy (Medium)", price: 6500, category: "Whole Lechon", productType: "Finished good", status: "Available", image: null, stock: 2, unit: "piece", reorderLevel: 1, expiryDate: null },

  // Add-ons
  { sku: "SNK-004", name: "Cheese Sauce", price: 50, category: "Snacks & Sides", productType: "Finished good", status: "Available", image: null, stock: 30, unit: "piece", reorderLevel: 10, expiryDate: null, isAddon: true },
  { sku: "SNK-006", name: "Lechon Bites", price: 120, category: "Snacks & Sides", productType: "Finished good", status: "Available", image: null, stock: 25, unit: "piece", reorderLevel: 8, expiryDate: null, isAddon: true },

  // These must NOT show on the POS.
  { sku: "RAW-001", name: "Rice", price: 0, category: "Raw Materials", productType: "Raw material", status: "Available", image: null, stock: 8, unit: "kg", reorderLevel: 10, expiryDate: null },
  { sku: "DRK-001", name: "Refreshments", price: 35, category: "Desserts and Drinks", productType: "Finished good", status: "Unavailable", image: null, stock: 0, unit: "piece", reorderLevel: 10, expiryDate: null, isAddon: true },
  { sku: "SNK-005", name: "Onion Rings", price: 129, category: "Snacks & Sides", productType: "Finished good", status: "Archived", image: null, stock: 0, unit: "piece", reorderLevel: 5, expiryDate: null },
];

// Get products.
export async function getProducts() {
  return PRODUCTS.map((p) => ({ ...p }));
}

// ---------- Order and Transaction Numbers ----------
let nextNumber = 201;

export function peekOrderNumbers() {
  return {
    transactionNo: nextNumber,
    orderNo: nextNumber,
  };
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
  return DISCOUNT_TYPES.map((d) => ({ ...d }));
}

// Enable or disable a discount type.
export async function updateDiscountType(name, active) {
  const discount = DISCOUNT_TYPES.find((d) => d.name === name);

  if (!discount) {
    throw new Error("Discount type not found.");
  }

  discount.active = Boolean(active);

  return { ...discount };
}

// ---------- Transactions and Stock Movements ----------
const TRANSACTIONS = [];
const STOCK_MOVEMENTS = [];

export async function saveTransaction(order) {
  const id = nextNumber++;
  const now = new Date().toISOString();

  const record = {
    transactionId: id,
    orderNumber: id,
    dateTime: now,
    status: "Completed",
    voidRefundReason: "",
    itemName: order.items.map((i) => `${i.qty}x ${i.name}`).join(", "),
    ...order,
  };

  // Deduct stock and record stock movement.
  order.items.forEach((line) => {
    const product = PRODUCTS.find((p) => p.sku === line.sku);

    if (product) {
      product.stock = Math.max(0, product.stock - line.qty);
    }

    STOCK_MOVEMENTS.push({
      movementType: "Stock out",
      sku: line.sku,
      quantity: line.qty,
      reason: "Sale",
      dateTime: now,
      staff: order.staff,
    });
  });

  TRANSACTIONS.unshift(record);

  return { ...record };
}

// Get transactions.
// Admin sees all transactions; Cashier sees only their own.
export async function getTransactions(user) {
  return TRANSACTIONS
    .filter((t) => user.role === "Admin" || t.staff === user.name)
    .map((t) => ({ ...t }));
}

// Get stock movements.
export async function getStockMovements() {
  return STOCK_MOVEMENTS.map((movement) => {
    const product = PRODUCTS.find((p) => p.sku === movement.sku);

    return {
      ...movement,
      productName: product ? product.name : "Unknown Product",
    };
  });
}
