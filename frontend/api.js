// api.js: mock data for now. 

const USERS = [
  { id: 1, username: "cashier", password: "1234", name: "Elle Santos", role: "Cashier"},
  { id: 2, username: "admin", password: "1234", name: "Sallie De Guzman", role: "Admin"},
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