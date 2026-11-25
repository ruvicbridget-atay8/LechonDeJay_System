
// discounts.js: Admin discount settings.
import * as api from "./api.js";
import { escapeHTML } from "./components.js";

export async function renderDiscounts(container, user) {
  container.innerHTML = `
    <h1 class="page-title">Discount Setting</h1>
    <p class="muted">Loading discount settings...</p>
  `;

  try {
    let discounts = await api.getDiscountSettings();

    function displayDiscounts() {
      container.innerHTML = `
        <div class="page-header">
          <div>
            <h1 class="page-title">Discount Setting</h1>
            <p class="muted">
              Manage discount percentages and their requirements.
            </p>
          </div>
        </div>

        <div class="table-responsive">
          <table class="data-table">
            <thead>
              <tr>
                <th>Discount Type</th>
                <th>Discount Rate (%)</th>
                <th>ID Required</th>
                <th>Status</th>
                <th>Action</th>
              </tr>
            </thead>

            <tbody>
              ${discounts.map((discount, index) => `
                <tr>
                  <td>
                    <strong>${escapeHTML(discount.name)}</strong>
                  </td>

                  <td>
                    <div class="discount-rate-control">
                      <input
                        class="discount-rate-input"
                        type="number"
                        min="0"
                        max="100"
                        step="0.01"
                        value="${Number(discount.value)}"
                        data-rate="${index}"
                        aria-label="${escapeHTML(discount.name)} discount percentage"
                      />
                      <span>%</span>
                    </div>
                  </td>

                  <td>${discount.requiresId ? "Yes" : "No"}</td>

                  <td>
                    <span class="status-chip ${
                      discount.active ? "status-success" : "status-muted"
                    }">
                      ${discount.active ? "Active" : "Inactive"}
                    </span>
                  </td>

                  <td>
                    <div class="discount-actions">
                      <button
                        class="btn btn-primary discount-save-btn"
                        type="button"
                        data-save="${index}"
                      >
                        Save
                      </button>

                      <button
                        class="btn btn-secondary discount-toggle-btn"
                        type="button"
                        data-toggle="${index}"
                      >
                        ${discount.active ? "Disable" : "Enable"}
                      </button>
                    </div>
                  </td>
                </tr>
              `).join("")}
            </tbody>
          </table>
        </div>

        <p class="discount-settings-note">
          Changes to a discount percentage will apply to future transactions.
        </p>

        <p class="discount-feedback" role="status" aria-live="polite"></p>
      `;

      const feedback = container.querySelector(".discount-feedback");

      // Save edited percentage.
      container.querySelectorAll("[data-save]").forEach((button) => {
        button.addEventListener("click", async () => {
          const index = Number(button.dataset.save);
          const discount = discounts[index];
          const input = container.querySelector(
            `[data-rate="${index}"]`
          );

          const value = Number(input.value);

          if (
            input.value.trim() === "" ||
            !Number.isFinite(value) ||
            value < 0 ||
            value > 100
          ) {
            feedback.textContent =
              "Enter a valid discount percentage from 0 to 100.";
            feedback.className = "discount-feedback error";
            input.focus();
            return;
          }

          if (discount.name === "Regular" && value !== 0) {
            feedback.textContent = "The Regular discount must remain at 0%.";
            feedback.className = "discount-feedback error";
            input.focus();
            return;
          }

          button.disabled = true;
          button.textContent = "Saving...";

          try {
            const updated = await api.saveDiscountPercentage(discount, value);

            discounts[index] = updated;

            feedback.textContent =
              `${discount.name} discount updated to ${updated.value}%.`;
            feedback.className = "discount-feedback success";

            displayDiscounts();

            const newFeedback = container.querySelector(
              ".discount-feedback"
            );
            newFeedback.textContent =
              `${discount.name} discount updated to ${updated.value}%.`;
            newFeedback.className = "discount-feedback success";
          } catch (error) {
            console.error("Discount save error:", error);
            button.disabled = false;
            button.textContent = "Save";
            feedback.textContent =
              error.message || "Unable to save discount percentage.";
            feedback.className = "discount-feedback error";
          }
        });
      });

      // Enable or disable a discount.
      container.querySelectorAll("[data-toggle]").forEach((button) => {
        button.addEventListener("click", async () => {
          const index = Number(button.dataset.toggle);
          const discount = discounts[index];

          button.disabled = true;

          try {
            const updated = await api.updateDiscountType(
              discount.name,
              !discount.active
            );

            discounts[index] = updated;
            displayDiscounts();

            const newFeedback = container.querySelector(
              ".discount-feedback"
            );
            newFeedback.textContent =
              `${discount.name} discount is now ${
                updated.active ? "Active" : "Inactive"
              }.`;
            newFeedback.className = "discount-feedback success";
          } catch (error) {
            console.error("Discount status error:", error);
            button.disabled = false;
            feedback.textContent =
              error.message || "Unable to update discount status.";
            feedback.className = "discount-feedback error";
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
