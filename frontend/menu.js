// menu.js: the sidebar items for each role. Add or remove items here only.
export const NAV = {
  Cashier: [
    { route: "pos",          label: "POS",               icon: "bi-cart3" },
    { route: "transactions", label: "My Transactions",   icon: "bi-receipt" },
    { route: "inventory",    label: "Inventory",         icon: "bi-clipboard-check" },
    { route: "shifts",       label: "Shifts & Cash Log", icon: "bi-clock-history" },
  ],
  Admin: [
    { route: "pos",          label: "POS",                      icon: "bi-cart3" },
    { route: "transactions", label: "Transactions & Approvals", icon: "bi-receipt" },
    { route: "inventory",    label: "Inventory",                icon: "bi-clipboard-check" },
    { route: "stock",        label: "Stock Movement",           icon: "bi-arrow-left-right" },
    { route: "discounts",    label: "Discount Setting",         icon: "bi-percent" },
    { route: "accounts",     label: "Accounts",                 icon: "bi-people" },
    { route: "reports",      label: "Insights & Reporting",     icon: "bi-graph-up" },
  ],
};