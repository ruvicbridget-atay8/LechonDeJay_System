// pos.js: POS screen.
// Catalog (Seq. 13), cart (15), subtotal and discount (17), payment (19).
import * as api from "./api.js";

const CATEGORIES = ["All", "Meals", "Snacks & Sides", "Desserts and Drinks", "Whole Lechon"];

// The SRS names the methods Cash, GCash/E-Wallet and Card (FR-10).
const PAYMENT_METHODS = [
  { value: "Cash",           label: "Cash",     icon: "bi-cash-stack" },
  { value: "Card",           label: "Card",     icon: "bi-credit-card" },
  { value: "GCash/E-Wallet", label: "E-Wallet", icon: "bi-phone" },
];

const peso = (n) =>
  "₱ " + Number(n).toLocaleString("en-PH", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const esc = (s) =>
  String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

const round2 = (n) => Math.round(n * 100) / 100;

// Only Available finished goods are sold at the counter (FR-04, FR-28).
const sellable = (p) => p.status === "Available" && p.productType === "Finished good";

/* ---------- Order state (kept while the user moves between pages) ---------- */
const emptyCheckout = () => ({
  discountType: "Regular",
  discountId: "",          // Senior Citizen and PWD only (FR-08)
  discountName: "",        // Senior Citizen and PWD only (FR-08)
  customerName: "",        // optional (FR-09)
  customerContact: "",     // optional (FR-09)
  paymentMethod: "Cash",   // FR-10
  amountReceived: "",      // typed by the Cashier, Cash only (FR-11)
});

let cart = [];            // { id, sku, name, price, qty, isAddon, parentId }
let orderType = "Dine In";
let lastParentId = null;  // the last main item added: add-ons attach to it
let lineCounter = 1;
let checkout = emptyCheckout();
let discountTypes = [];

export const getCart = () => cart;
export const getOrderType = () => orderType;
export const getCheckout = () => checkout;
export const getSubtotal = () => round2(cart.reduce((sum, l) => sum + l.price * l.qty, 0));
export const getDiscountRate = () =>
  (discountTypes.find((d) => d.name === checkout.discountType) || {}).value || 0;
export const getDiscountAmount = () => round2((getSubtotal() * getDiscountRate()) / 100);
export const getTotal = () => round2(getSubtotal() - getDiscountAmount());

// Card and E-Wallet: the amount received equals the total (A-16).
export const isCash = () => checkout.paymentMethod === "Cash";
export const getAmountReceived = () =>
  isCash() ? round2(Number(checkout.amountReceived) || 0) : getTotal();
export const getChange = () =>
  isCash() ? Math.max(0, round2(getAmountReceived() - getTotal())) : 0;

// Returns { field: message }. Empty means the order can be placed.
export function checkoutErrors() {
  const errs = {};
  const type = discountTypes.find((d) => d.name === checkout.discountType);
  if (type && type.requiresId) {
    if (!checkout.discountId.trim()) errs.discountId = "Required";
    if (!checkout.discountName.trim()) errs.discountName = "Required";
  }
  if (!cart.length) errs.cart = "Add at least one item.";
  if (isCash()) {
    if (checkout.amountReceived === "") errs.amount = "Enter the amount received.";
    else if (getAmountReceived() < getTotal()) errs.amount = "The amount received is less than the total.";
  }
  return errs;
}

// Everything Seq. 21 saves: the transaction record (FR-16).
export function buildOrder(user) {
  return {
    staff: user.name,
    orderType,
    items: cart.map((l) => ({ sku: l.sku, name: l.name, qty: l.qty, unitPrice: l.price, isAddon: l.isAddon, parentId: l.parentId })),
    subtotal: getSubtotal(),
    discountType: checkout.discountType,
    discountRate: getDiscountRate(),
    discountAmount: getDiscountAmount(),
    discountId: checkout.discountId.trim(),
    discountName: checkout.discountName.trim(),
    customerName: checkout.customerName.trim(),
    customerContact: checkout.customerContact.trim(),
    total: getTotal(),
    paymentMethod: checkout.paymentMethod,
    amountTendered: getAmountReceived(),
    change: getChange(),
  };
}

// Place Order (Seq. 21) calls this after the sale is saved.
export function resetOrder() {
  cart = [];
  orderType = "Dine In";
  lastParentId = null;
  checkout = emptyCheckout();
}

function showToast(msg) {
  const t = document.createElement("div");
  t.className = "toast";
  t.textContent = msg;
  document.body.appendChild(t);
  setTimeout(() => t.remove(), 3000);
}

export async function renderPos(container, user) {
  const [allProducts, types] = await Promise.all([api.getProducts(), api.getDiscountTypes()]);
  const products = allProducts.filter(sellable);
  discountTypes = types.filter((t) => t.active);

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

        <section class="checkout">
          <div class="checkout-bar"><i class="bi bi-percent"></i> Subtotal &amp; Discount</div>

          <div class="co-row">
            <span>Subtotal</span>
            <strong id="co-subtotal">${peso(0)}</strong>
          </div>

          <div class="co-row">
            <label for="co-type">Discount Type</label>
            <select class="co-input" id="co-type">
              ${discountTypes.map((d) => `<option value="${esc(d.name)}">${esc(d.name)}</option>`).join("")}
            </select>
          </div>

          <div class="co-id-fields" id="co-id-fields" hidden>
            <div class="co-row">
              <label for="co-id">Discount ID Number <span class="co-req">*</span></label>
              <input class="co-input" id="co-id" autocomplete="off" />
            </div>
            <div class="co-row">
              <label for="co-idname">Discount ID Name <span class="co-req">*</span></label>
              <input class="co-input" id="co-idname" autocomplete="off" />
            </div>
          </div>

          <div class="co-row">
            <label for="co-cname">Customer Name</label>
            <input class="co-input" id="co-cname" placeholder="Optional" autocomplete="off" />
          </div>
          <div class="co-row">
            <label for="co-ccontact">Customer Contact</label>
            <input class="co-input" id="co-ccontact" type="tel" placeholder="Optional" autocomplete="off" />
          </div>

          <div class="co-row" id="co-discount-row" hidden>
            <span id="co-discount-label">Discount</span>
            <strong id="co-discount">-${peso(0)}</strong>
          </div>

          <div class="co-total">
            <span>Total</span>
            <strong id="co-total">${peso(0)}</strong>
          </div>

          <div class="co-section">Payment Method</div>
          <div class="pay-methods" id="pay-methods">
            ${PAYMENT_METHODS.map((m) => `
              <button class="pay-method" type="button" data-method="${esc(m.value)}">
                <i class="bi ${m.icon}"></i><span>${esc(m.label)}</span>
              </button>`).join("")}
          </div>

          <div class="co-row">
            <label for="co-received">Amount Received</label>
            <input class="co-input" id="co-received" type="number" inputmode="decimal" min="0" step="0.01" placeholder="0.00" />
          </div>
          <div class="co-row">
            <span>Change</span>
            <strong id="co-change">${peso(0)}</strong>
          </div>
          <p class="co-hint" id="co-hint" hidden></p>

          <p class="alert" id="co-error" hidden></p>
          <button class="btn btn--primary btn--block" id="place-order" type="button">Place Order</button>
        </section>
      </aside>
    </div>`;

  const grid = document.getElementById("pos-grid");
  const linesBox = document.getElementById("cart-lines");
  const notice = document.getElementById("cart-notice");
  const typeSelect = document.getElementById("cart-type");
  const discountSelect = document.getElementById("co-type");
  const idFields = document.getElementById("co-id-fields");
  const receivedInput = document.getElementById("co-received");
  const changeEl = document.getElementById("co-change");
  const hintEl = document.getElementById("co-hint");
  const errorEl = document.getElementById("co-error");
  const placeBtn = document.getElementById("place-order");
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
    drawTotals();
  }

  /* ---------- Subtotal, discount, total ---------- */
  function drawTotals() {
    const discount = getDiscountAmount();
    document.getElementById("co-subtotal").textContent = peso(getSubtotal());
    document.getElementById("co-discount-row").hidden = discount === 0;
    document.getElementById("co-discount-label").textContent =
      `Discount (${checkout.discountType}, ${getDiscountRate()}%)`;
    document.getElementById("co-discount").textContent = "-" + peso(discount);
    document.getElementById("co-total").textContent = peso(getTotal());
    drawPayment(); // the total changed, so the change changes too
  }

  function syncIdFields() {
    const type = discountTypes.find((d) => d.name === checkout.discountType);
    const needsId = !!(type && type.requiresId);
    idFields.hidden = !needsId;
    if (!needsId) {
      // Don't keep an ID from an earlier discount type.
      checkout.discountId = "";
      checkout.discountName = "";
      document.getElementById("co-id").value = "";
      document.getElementById("co-idname").value = "";
    }
  }

  /* ---------- Payment ---------- */
  function drawPayment() {
    document.querySelectorAll(".pay-method").forEach((b) =>
      b.classList.toggle("is-active", b.dataset.method === checkout.paymentMethod)
    );

    const total = getTotal();
    hintEl.hidden = true;

    if (isCash()) {
      receivedInput.readOnly = false;
      receivedInput.classList.remove("is-locked");
      receivedInput.value = checkout.amountReceived;

      const received = Number(checkout.amountReceived);
      if (checkout.amountReceived === "" || !cart.length) {
        changeEl.textContent = peso(0);
        changeEl.classList.remove("is-bad");
      } else if (received < total) {
        changeEl.textContent = "Insufficient";
        changeEl.classList.add("is-bad");
      } else {
        changeEl.textContent = peso(getChange());
        changeEl.classList.remove("is-bad");
      }
    } else {
      // Card and E-Wallet: amount received equals the total, change is 0.00 (A-16).
      receivedInput.readOnly = true;
      receivedInput.classList.add("is-locked");
      receivedInput.value = total.toFixed(2);
      changeEl.textContent = peso(0);
      changeEl.classList.remove("is-bad");
      hintEl.textContent = "Confirm the payment was received before placing the order.";
      hintEl.hidden = false;
    }

    // Place Order stays off until the order can be paid.
    const errs = checkoutErrors();
    placeBtn.disabled = !!(errs.cart || errs.amount);
  }

  function bindField(id, key) {
    const el = document.getElementById(id);
    el.value = checkout[key];
    el.addEventListener("input", () => { checkout[key] = el.value; el.classList.remove("is-invalid"); });
  }

  /* ---------- Place Order and saves the sale) ---------- */
   async function onPlaceOrder() {
    errorEl.hidden = true;
    document.querySelectorAll(".co-input").forEach((i) => i.classList.remove("is-invalid"));

    const errs = checkoutErrors();
    if (errs.discountId) document.getElementById("co-id").classList.add("is-invalid");
    if (errs.discountName) document.getElementById("co-idname").classList.add("is-invalid");

    const first = Object.values(errs)[0];
    if (first) {
      errorEl.textContent = errs.discountId || errs.discountName
        ? "Enter the discount ID number and ID name."
        : first;
      errorEl.hidden = false;
      return;
    }

    placeBtn.disabled = true;
    try {
      const saved = await api.saveTransaction(buildOrder(user));
      resetOrder();
      showToast(`Order #${saved.orderNumber} saved.`);
      location.hash = "#/transactions";
    } catch (err) {
      errorEl.textContent = err.message || "Could not save the order. Try again.";
      errorEl.hidden = false;
      placeBtn.disabled = false;
    }
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

  discountSelect.value = checkout.discountType;
  discountSelect.addEventListener("change", () => {
    checkout.discountType = discountSelect.value;
    syncIdFields();
    drawTotals();
  });

  bindField("co-id", "discountId");
  bindField("co-idname", "discountName");
  bindField("co-cname", "customerName");
  bindField("co-ccontact", "customerContact");

  document.getElementById("pay-methods").addEventListener("click", (e) => {
    const btn = e.target.closest(".pay-method");
    if (!btn) return;
    checkout.paymentMethod = btn.dataset.method;
    errorEl.hidden = true;
    drawPayment();
  });

  receivedInput.addEventListener("input", () => {
    if (!isCash()) return;
    checkout.amountReceived = receivedInput.value;
    drawPayment();
  });

  placeBtn.addEventListener("click", onPlaceOrder);

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

  syncIdFields();
  drawCatalog();
  drawCart();
}