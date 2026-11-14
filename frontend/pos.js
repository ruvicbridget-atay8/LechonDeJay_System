// pos.js: POS screen. Catalog (Seq. 13) + invoice and cart (Seq. 15).
import * as api from "./api.js";

const CATEGORIES = ["All", "Meals", "Snacks & Sides", "Desserts and Drinks", "Whole Lechon"];

const peso = (n) =>
  "₱ " + Number(n).toLocaleString("en-PH", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const esc = (s) =>
  String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

// Only Available finished goods are sold at the counter (FR-04, FR-28).
const sellable = (p) => p.status === "Available" && p.productType === "Finished good";

/* ---------- Cart state (kept while the user moves between pages) ---------- */
let cart = [];            // { id, sku, name, price, qty, isAddon, parentId }
let orderType = "Dine In";
let lastParentId = null;  // the last main item added: add-ons attach to it
let lineCounter = 1;

// Later steps use these (discount, payment, Place Order).
export const getCart = () => cart;
export const getOrderType = () => orderType;
export const getSubtotal = () => cart.reduce((sum, l) => sum + l.price * l.qty, 0);

export async function renderPos(container, user) {
  const { transactionNo, orderNo } = api.peekOrderNumbers();

  container.innerHTML = `
    <div class="pos">
      <section class="pos-catalog">
        <label class="pos-search">
          <i class="bi bi-search"></i>
          <input id="pos-search" type="search" placeholder="Search SKU, name or category" />
        </label>
        <div class="pos-chips" id="pos-chips">
          ${CATEGORIES.map((c, i) => `
            <button class="pos-chip${i === 0 ? " is-active" : ""}" type="button" data-cat="${esc(c)}">${esc(c)}</button>`).join("")}
        </div>
        <div class="product-grid" id="pos-grid"></div>
      </section>

      <aside class="pos-cart">
        <div class="cart-head">
          <div>
            <h2>Invoice</h2>
            <p>Transaction# ${transactionNo}</p>
            <p>Order# ${orderNo}</p>
          </div>
          <span class="cart-time" id="cart-time"></span>
        </div>

        <select class="cart-type" id="cart-type" aria-label="Order type">
          <option value="Dine In">Dine In</option>
          <option value="Take-out">Take-out</option>
        </select>

        <p class="alert" id="cart-notice" hidden></p>
        <div class="cart-lines" id="cart-lines"></div>

        <div class="cart-summary">
          <span>Subtotal</span>
          <strong id="cart-subtotal">${peso(0)}</strong>
        </div>
      </aside>
    </div>`;

  const grid = document.getElementById("pos-grid");
  const linesBox = document.getElementById("cart-lines");
  const notice = document.getElementById("cart-notice");
  const typeSelect = document.getElementById("cart-type");
  const products = (await api.getProducts()).filter(sellable);
  let category = "All";
  let query = "";

  /* ---------- Catalog ---------- */
  function drawCatalog() {
    const q = query.trim().toLowerCase();
    const list = products.filter((p) =>
      (category === "All" || p.category === category) &&
      (!q || p.name.toLowerCase().includes(q) ||
             p.sku.toLowerCase().includes(q) ||
             p.category.toLowerCase().includes(q))
    );

    if (!list.length) {
      grid.innerHTML = `<p class="pos-empty">No products matched.</p>`;
      return;
    }

    grid.innerHTML = list.map((p) => `
      <button class="product" type="button" data-sku="${esc(p.sku)}">
        ${p.image
          ? `<img class="product-img" src="${esc(p.image)}" alt="" />`
          : `<div class="product-img"><i class="bi bi-image"></i></div>`}
        <div class="product-info">
          <span class="product-name">${esc(p.name)}</span>
          <span class="product-price">${peso(p.price)}</span>
        </div>
      </button>`).join("");
  }

  /* ---------- Cart ---------- */
  function showNotice(msg) {
    notice.textContent = msg;
    notice.hidden = !msg;
  }

  function addToCart(product) {
    showNotice("");

    if (product.isAddon) {
      // An add-on is its own line, linked to the main item it belongs to (FR-17).
      if (!lastParentId || !cart.some((l) => l.id === lastParentId)) {
        showNotice("Add a main item first, then add the add-on.");
        return;
      }
      const same = cart.find((l) => l.sku === product.sku && l.parentId === lastParentId);
      if (same) same.qty += 1;
      else cart.push({ id: lineCounter++, sku: product.sku, name: product.name, price: product.price, qty: 1, isAddon: true, parentId: lastParentId });
    } else {
      const same = cart.find((l) => l.sku === product.sku && !l.isAddon);
      if (same) {
        same.qty += 1;
        lastParentId = same.id;
      } else {
        const line = { id: lineCounter++, sku: product.sku, name: product.name, price: product.price, qty: 1, isAddon: false, parentId: null };
        cart.push(line);
        lastParentId = line.id;
      }
    }
    drawCart();
  }

  function removeLine(id) {
    // Removing a main item also removes its add-ons.
    cart = cart.filter((l) => l.id !== id && l.parentId !== id);
    if (lastParentId === id) lastParentId = null;
    showNotice("");
    drawCart();
  }

  function changeQty(id, delta) {
    const line = cart.find((l) => l.id === id);
    if (!line) return;
    line.qty = Math.max(1, line.qty + delta); // use the trash button to remove
    drawCart();
  }

  function lineHtml(l) {
    return `
      <div class="cart-line${l.isAddon ? " is-addon" : ""}" data-id="${l.id}">
        <div class="cart-line-top">
          <span class="cart-line-name">${l.isAddon ? "+ " : ""}${esc(l.name)}</span>
          <button class="cart-del" type="button" data-act="del" aria-label="Remove ${esc(l.name)}">
            <i class="bi bi-trash"></i>
          </button>
        </div>
        <div class="cart-line-bottom">
          <div class="qty">
            <button type="button" data-act="inc" aria-label="Add one">+</button>
            <span>${l.qty}</span>
            <button type="button" data-act="dec" aria-label="Remove one">&minus;</button>
          </div>
          <span class="cart-line-price">${peso(l.price * l.qty)}</span>
        </div>
      </div>`;
  }

  function drawCart() {
    if (!cart.length) {
      linesBox.innerHTML = `<p class="cart-empty">No items yet. Tap a product to start.</p>`;
    } else {
      // Each main item is followed by its add-ons.
      const ordered = [];
      cart.filter((l) => !l.isAddon).forEach((main) => {
        ordered.push(main, ...cart.filter((l) => l.parentId === main.id));
      });
      linesBox.innerHTML = ordered.map(lineHtml).join("");
    }
    document.getElementById("cart-subtotal").textContent = peso(getSubtotal());
  }

  /* ---------- Events ---------- */
  document.getElementById("pos-search").addEventListener("input", (e) => {
    query = e.target.value;
    drawCatalog();
  });

  document.getElementById("pos-chips").addEventListener("click", (e) => {
    const btn = e.target.closest(".pos-chip");
    if (!btn) return;
    category = btn.dataset.cat;
    document.querySelectorAll(".pos-chip").forEach((c) => c.classList.toggle("is-active", c === btn));
    drawCatalog();
  });

  grid.addEventListener("click", (e) => {
    const card = e.target.closest(".product");
    if (!card) return;
    addToCart(products.find((p) => p.sku === card.dataset.sku));
  });

  linesBox.addEventListener("click", (e) => {
    const btn = e.target.closest("[data-act]");
    if (!btn) return;
    const id = Number(btn.closest(".cart-line").dataset.id);
    if (btn.dataset.act === "del") removeLine(id);
    if (btn.dataset.act === "inc") changeQty(id, 1);
    if (btn.dataset.act === "dec") changeQty(id, -1);
  });

  typeSelect.value = orderType;
  typeSelect.addEventListener("change", () => { orderType = typeSelect.value; });

  // Clock in the invoice header
  const timeEl = document.getElementById("cart-time");
  const tick = () => {
    timeEl.textContent = new Date()
      .toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })
      .replace(" ", "").toLowerCase();
  };
  tick();
  const timer = setInterval(() => {
    if (!document.body.contains(timeEl)) { clearInterval(timer); return; }
    tick();
  }, 30000);

  drawCatalog();
  drawCart();
}