// api.js: mock data for now.

const USERS = [
  { id: 1, username: "cashier", password: "1234", name: "Elle Santos", role: "Cashier" },
  { id: 2, username: "admin", password: "1234", name: "Sallie De Guzman", role: "Admin" },
];

// Mock products. Prices are from the Figma. Stock numbers are samples.
const PRODUCTS = [
  { sku: "MEL-001", name: "Lechon Budget Meal",   price: 99,   category: "Meals",               productType: "Finished good", status: "Available",   image: null, stock: 24, unit: "piece", reorderLevel: 5,  expiryDate: null },
  { sku: "SNK-001", name: "Cheese Burger",        price: 30,   category: "Snacks & Sides",      productType: "Finished good", status: "Available",   image: null, stock: 18, unit: "piece", reorderLevel: 5,  expiryDate: null },
  { sku: "MEL-002", name: "Lechon Paksiw",        price: 149,  category: "Meals",               productType: "Finished good", status: "Available",   image: null, stock: 3,  unit: "piece", reorderLevel: 5,  expiryDate: null },
  { sku: "SNK-002", name: "Fries Platter",        price: 249,  category: "Snacks & Sides",      productType: "Finished good", status: "Available",   image: null, stock: 12, unit: "tray",  reorderLevel: 4,  expiryDate: null },
  { sku: "MEL-003", name: "Lechon Meal Unli Rice",price: 129,  category: "Meals",               productType: "Finished good", status: "Available",   image: null, stock: 20, unit: "piece", reorderLevel: 5,  expiryDate: null },
  { sku: "SNK-003", name: "Crazy Loaded Nachos",  price: 179,  category: "Snacks & Sides",      productType: "Finished good", status: "Available",   image: null, stock: 15, unit: "tray",  reorderLevel: 5,  expiryDate: null },
  { sku: "DSR-001", name: "Fruit Salad",          price: 79,   category: "Desserts and Drinks", productType: "Finished good", status: "Available",   image: null, stock: 10, unit: "piece", reorderLevel: 4,  expiryDate: "2026-10-29" },
  { sku: "MEL-004", name: "Crew Meal",            price: 200,  category: "Meals",               productType: "Finished good", status: "Available",   image: null, stock: 9,  unit: "piece", reorderLevel: 3,  expiryDate: null },
  { sku: "WLC-001", name: "Whole Lechon Baboy (Medium)", price: 6500, category: "Whole Lechon", productType: "Finished good", status: "Available",   image: null, stock: 2,  unit: "piece", reorderLevel: 1,  expiryDate: null },

  // Add-ons: saved as their own lines under a main item (FR-17)
  { sku: "SNK-004", name: "Cheese Sauce",         price: 50,   category: "Snacks & Sides",      productType: "Finished good", status: "Available",   image: null, stock: 30, unit: "piece", reorderLevel: 10, expiryDate: null, isAddon: true },
  { sku: "SNK-006", name: "Lechon Bites",         price: 120,  category: "Snacks & Sides",      productType: "Finished good", status: "Available",   image: null, stock: 25, unit: "piece", reorderLevel: 8,  expiryDate: null, isAddon: true },

  // These must NOT show on the POS:
  { sku: "RAW-001", name: "Rice",                 price: 0,    category: "Raw Materials",       productType: "Raw material",  status: "Available",   image: null, stock: 8,  unit: "kg",    reorderLevel: 10, expiryDate: null },
  { sku: "DRK-001", name: "Refreshments",         price: 35,   category: "Desserts and Drinks", productType: "Finished good", status: "Unavailable", image: null, stock: 0,  unit: "piece", reorderLevel: 10, expiryDate: null, isAddon: true },
  { sku: "SNK-005", name: "Onion Rings",          price: 129,  category: "Snacks & Sides",      productType: "Finished good", status: "Archived",    image: null, stock: 0,  unit: "piece", reorderLevel: 5,  expiryDate: null },
];

const SESSION_KEY = "lechon_session";
let memorySession = null;

export async function login(username, password) {
  const user = USERS.find(
    (u) => u.username === username.trim().toLowerCase() && u.password === password
  );
  if (!user) throw new Error("Invalid username or password.");

  const { password: _omit, ...safe } = user;
  memorySession = safe;
  try { sessionStorage.setItem(SESSION_KEY, JSON.stringify(safe)); } catch { /* ignore */ }
  return safe;
}

export function getSession() {
  if (memorySession) return memorySession;
  try {
    const raw = sessionStorage.getItem(SESSION_KEY);
    if (raw) memorySession = JSON.parse(raw);
  } catch { /* ignore */ }
  return memorySession;
}

export function logout() {
  memorySession = null;
  try { sessionStorage.removeItem(SESSION_KEY); } catch { /* ignore */ }
}

// Later this calls the backend. For now it returns the mock list.
export async function getProducts() {
  return PRODUCTS.map((p) => ({ ...p }));
}

// Transaction and order numbers are assigned by the system (FR-06).
let nextNumber = 201;
export function peekOrderNumbers() {
  return { transactionNo: nextNumber, orderNo: nextNumber };
}