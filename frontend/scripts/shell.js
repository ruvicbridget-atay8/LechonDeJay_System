// shell.js: sidebar + top bar + content area, shared by Cashier and Admin.
import * as api from "./api.js";
import { NAV } from "./menu.js";

let onHash = null;

const esc = (s) =>
  String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

const initials = (name) =>
  name.split(" ").map((w) => w[0]).slice(0, 2).join("").toUpperCase();

// pages = { pos: (container, user) => {...}, ... }  (filled in script.js)
export function renderShell(user, pages, onLogout) {
  const items = NAV[user.role] || [];
  const today = new Date().toLocaleDateString("en-GB", {
    day: "numeric", month: "long", year: "numeric",
  });

  document.getElementById("app").innerHTML = `
    <div class="shell" id="shell">
      <aside class="sidebar">
        <div class="sidebar-brand">
          <img class="sidebar-logo" src="assets/logo.png" alt="" />
          <span>Lechon De Jay</span>
          <button class="icon-btn sidebar-close" id="sidebar-close" type="button" aria-label="Hide menu">
            <i class="bi bi-layout-sidebar"></i>
          </button>
        </div>

        <div class="sidebar-user">
          <small>${esc(user.role)}</small>
          <div class="sidebar-user-row">
            <span class="avatar">${esc(initials(user.name))}</span>
            <strong>${esc(user.name)}</strong>
          </div>
        </div>

        <nav class="nav" aria-label="Main menu">
          ${items.map((i) => `
            <a class="nav-link" href="#/${i.route}" data-route="${i.route}">
              <i class="bi ${i.icon}"></i><span>${esc(i.label)}</span>
            </a>`).join("")}
        </nav>

        <button class="nav-link nav-logout" id="logout" type="button">
          <i class="bi bi-box-arrow-left"></i><span>Log out</span>
        </button>
      </aside>

      <div class="shell-backdrop" id="backdrop"></div>

      <div class="shell-main">
        <header class="topbar">
          <button class="icon-btn" id="menu-toggle" type="button" aria-label="Toggle menu">
            <i class="bi bi-list"></i>
          </button>
          <div class="topbar-right">
            <span class="topbar-date"><i class="bi bi-calendar3"></i> ${today}</span>
            <span class="avatar">${esc(initials(user.name))}</span>
            <div class="topbar-user">
              <strong>${esc(user.name)}</strong>
              <small>${esc(user.role)}</small>
            </div>
          </div>
        </header>
        <main class="content" id="content"></main>
      </div>
    </div>`;

  const shell = document.getElementById("shell");
  const content = document.getElementById("content");

  function currentRoute() {
    const r = location.hash.replace("#/", "");
    return items.some((i) => i.route === r) ? r : items[0].route;
  }

  function show() {
    const route = currentRoute();
    const item = items.find((i) => i.route === route);

    document.querySelectorAll(".nav-link[data-route]").forEach((a) =>
      a.classList.toggle("is-active", a.dataset.route === route)
    );
    document.title = `${item.label} | Lechon De Jay`;
    shell.classList.remove("is-open");

    content.innerHTML = "";
    const page = pages[route];
    if (page) {
      page(content, user);
    } else {
      content.innerHTML = `<h1 class="page-title">${esc(item.label)}</h1>
                           <p class="muted">Coming soon.</p>`;
    }
  }

  if (onHash) window.removeEventListener("hashchange", onHash);
  onHash = show;
  window.addEventListener("hashchange", onHash);

  // Hide / show the sidebar. Desktop: collapse. Phone: slide in and out.
  const KEY = "lechon_sidebar_collapsed";
  const isMobile = () => window.matchMedia("(max-width: 900px)").matches;

  try { if (localStorage.getItem(KEY) === "1") shell.classList.add("is-collapsed"); } catch { /* ignore */ }

  function toggleMenu() {
    if (isMobile()) {
      shell.classList.toggle("is-open");
      return;
    }
    const collapsed = shell.classList.toggle("is-collapsed");
    try { localStorage.setItem(KEY, collapsed ? "1" : "0"); } catch { /* ignore */ }
  }

  document.getElementById("menu-toggle").addEventListener("click", toggleMenu);
  document.getElementById("sidebar-close").addEventListener("click", toggleMenu);
  document.getElementById("backdrop").addEventListener("click", () => shell.classList.remove("is-open"));

  document.getElementById("logout").addEventListener("click", () => {
    api.logout();
    window.removeEventListener("hashchange", onHash);
    history.replaceState(null, "", location.pathname);
    onLogout();
  });

  show();
}