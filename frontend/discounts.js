
 // discounts.js: Admin discount settings.
import * as api from "./api.js";
import { escapeHTML } from "./components.js";

export async function renderDiscounts(container, user) {
  container.innerHTML = `
    <h1 class="page-title">Discount Setting</h1>
    <p class="muted">Loading discount settings...</p>
  `;

  try {
    const discounts = await api.getDiscountTypes();

    function displayDiscounts() {
      container.innerHTML = `
        <div class="page-header">
          <div>
            <h1 class="page-title">Discount Setting</h1>
            <p class="muted">
              Manage available discounts and their requirements.
            </p>
          </div>
        </div>

        <div class="table-responsive">
          <table class="data-table">
            <thead>
              <tr>
                <th>Discount Type</th>
                <th>Discount Rate</th>
                <th>ID Required</th>
                <th>Status</th>
                <th>Action</th>
              </tr>
            </thead>
            <tbody>
              ${discounts.map((discount) => `
                <tr>
                  <td><strong>${escapeHTML(discount.name)}</strong></td>
                  <td>${escapeHTML(discount.value)}%</td>
                  <td>${discount.requiresId ? "Yes" : "No"}</td>
                  <td>
                    <span class="status-chip ${
                      discount.active ? "status-success" : "status-muted"
                    }">
                      ${discount.active ? "Active" : "Inactive"}
                    </span>
                  </td>
                  <td>
                    <button
                      class="btn btn-secondary"
                      type="button"
                      data-discount="${escapeHTML(discount.name)}"
                      data-active="${discount.active}"
                    >
                      ${discount.active ? "Disable" : "Enable"}
                    </button>
                  </td>
                </tr>
              `).join("")}
            </tbody>
          </table>
        </div>
      `;

      container.querySelectorAll("[data-discount]").forEach((button) => {
        button.addEventListener("click", async () => {
          const name = button.dataset.discount;
          const currentStatus = button.dataset.active === "true";

          try {
            await api.updateDiscountType(name, !currentStatus);

            const updated = discounts.find((d) => d.name === name);
            if (updated) updated.active = !currentStatus;

            displayDiscounts();
          } catch (error) {
            console.error("Discount update error:", error);
            alert("Unable to update discount. Please try again.");
          }
        });
      });
    }

    displayDiscounts();

  } catch (error) {
    console.error("Discount loading error:", error);

    container.innerHTML = `
      <h1 class="page-title">Discount Setting</h1>
      <p class="muted">Unable to load discount settings.</p>
    `;
  }
}
